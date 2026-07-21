// ops.ts — git mutations on the fleet. Pure (no vscode), so it's unit-testable
// against real temp repos. fell / unfell / salvage and the freshness assess.

import { execFile } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync } from "fs";
import { trunkBranch } from "./git";
import { assessSafety, wipPaths } from "./core";

function git(cwd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git", ["-C", cwd, ...args],
      { maxBuffer: 64 * 1024 * 1024, env: env ? { ...process.env, ...env } : process.env },
      (err, out, errout) => (err ? reject(new Error(errout || err.message)) : resolve(out ?? ""))
    );
  });
}

// like git(), but a nonzero exit is data, not an error — merge-tree exits 1 on conflicts
function gitCode(cwd: string, args: string[]): Promise<{ out: string; code: number }> {
  return new Promise((resolve) => {
    execFile("git", ["-C", cwd, ...args], { maxBuffer: 64 * 1024 * 1024 }, (e: any, out) =>
      resolve({ out: out ?? "", code: e ? (typeof e.code === "number" ? e.code : 128) : 0 }));
  });
}

export interface RestoreToken {
  path: string;
  branch: string | null;
  sha: string;
}

export interface Assessment {
  ahead: number; // commits not on trunk
  trackedWip: boolean; // uncommitted tracked/staged changes (a fell can't restore these)
  sha: string; // current HEAD
  safe: boolean; // ahead === 0 && !trackedWip  → fell is fully reversible
}

/**
 * Re-read a worktree's live state right before acting on it. FAILS CLOSED: if
 * any probe errors (an unresolvable trunk, a locked index, an unreadable
 * worktree) the assessment is NOT safe — never fell on indeterminate state.
 */
export async function assess(repo: string, wtPath: string, trunk?: string): Promise<Assessment> {
  const t = trunk ?? (await trunkBranch(repo));
  let ahead = 0;
  let porc = "";
  let sha = "";
  let ok = true;
  try {
    const r = (await git(wtPath, ["rev-list", "--count", `${t}..HEAD`])).trim();
    if (/^\d+$/.test(r)) ahead = parseInt(r, 10); else ok = false;
  } catch { ok = false; }
  try { porc = await git(wtPath, ["status", "--porcelain"]); } catch { ok = false; }
  try { sha = (await git(wtPath, ["rev-parse", "HEAD"])).trim(); if (!sha) ok = false; } catch { ok = false; }
  const { trackedWip } = assessSafety(ahead, porc.split("\n"));
  return { ahead, trackedWip, sha, safe: ok && ahead === 0 && !trackedWip };
}

export interface TreeRef { path: string; branch: string; name: string; }

/** Fell every listed tree that is still safe; returns restore tokens for those felled. */
export async function fellMany(repo: string, trees: TreeRef[], trunk?: string): Promise<RestoreToken[]> {
  const tokens: RestoreToken[] = [];
  for (const t of trees) {
    const a = await assess(repo, t.path, trunk);
    if (!a.safe) continue; // only fell what's still safe
    try { tokens.push(await fell(repo, t.path, t.branch && t.branch !== "(detached)" ? t.branch : null)); } catch {}
  }
  return tokens;
}

/** Restore every token from a fellMany; report which failed rather than dropping them. */
export async function unfellMany(repo: string, tokens: RestoreToken[]): Promise<{ restored: string[]; failed: { ref: string; error: string }[] }> {
  const restored: string[] = [], failed: { ref: string; error: string }[] = [];
  for (const t of tokens) {
    try { await unfell(repo, t); restored.push(t.branch ?? t.path); }
    catch (e: any) { failed.push({ ref: t.branch ?? t.path, error: e?.message ?? String(e) }); }
  }
  return { restored, failed };
}

/**
 * Land a branch: fast-forward the trunk to it. Requires the trunk to be checked
 * out in the main worktree (so the working tree stays consistent). Refuses
 * anything that isn't a clean fast-forward — never a merge commit, never force.
 */
export async function land(repo: string, branch: string, trunk?: string): Promise<{ ok: boolean; message: string; reason?: string }> {
  const t = trunk ?? (await trunkBranch(repo));
  const head = (await git(repo, ["symbolic-ref", "--quiet", "--short", "HEAD"])).trim();
  if (head !== t) return { ok: false, reason: "trunk-not-checked-out", message: `trunk '${t}' isn't checked out in the main worktree (it's on '${head || "a detached HEAD"}')` };
  if (!(await refExists(repo, branch))) return { ok: false, reason: "no-such-branch", message: `no branch '${branch}'` };
  let ffable = false;
  try { await git(repo, ["merge-base", "--is-ancestor", t, branch]); ffable = true; } catch {}
  if (!ffable) return { ok: false, reason: "diverged", message: `${branch} isn't a fast-forward of ${t} (diverged)` };
  try {
    await git(repo, ["merge", "--ff-only", branch]);
    return { ok: true, message: `fast-forwarded ${t} → ${branch}` };
  } catch {
    const dirty = (await git(repo, ["status", "--porcelain"])).trim() !== "";
    return dirty
      ? { ok: false, reason: "dirty-tree", message: `the main worktree has uncommitted changes blocking the fast-forward` }
      : { ok: false, reason: "ff-failed", message: `fast-forward of ${t} → ${branch} failed` };
  }
}

/** Land each branch in turn; returns which landed and which were skipped. */
export async function landMany(repo: string, branches: string[], trunk?: string): Promise<{ landed: string[]; skipped: string[] }> {
  const t = trunk ?? (await trunkBranch(repo));
  const landed: string[] = [], skipped: string[] = [];
  for (const b of branches) {
    const res = await land(repo, b, t);
    (res.ok ? landed : skipped).push(b);
  }
  return { landed, skipped };
}

/** Merge every listed tree's WIP onto one shared review branch, in sequence —
 *  each merge sees the WIP the previous ones just added. Clean ones flow
 *  through; collisions get markers, and are reported as "name: file". */
export async function salvageMany(
  repo: string, trees: TreeRef[], preserveBranch: string
): Promise<{ count: number; conflicts: string[] }> {
  let count = 0;
  const conflicts: string[] = [];
  for (const t of trees) {
    try {
      const pv = await salvagePreview(repo, t.path, preserveBranch);
      await salvage(repo, t.path, preserveBranch, `salvage: preserve ${t.name} (lumberjack)`);
      count++;
      conflicts.push(...pv.conflicts.map((f) => `${t.name}: ${f}`));
    } catch {}
  }
  return { count, conflicts };
}

/** Fell a worktree: capture its HEAD, remove the tree, delete its branch. */
export async function fell(repo: string, wtPath: string, branch: string | null): Promise<RestoreToken> {
  const sha = (await git(wtPath, ["rev-parse", "HEAD"])).trim();
  await git(repo, ["worktree", "remove", "--force", wtPath]);
  if (branch) { try { await git(repo, ["branch", "-D", branch]); } catch {} }
  return { path: wtPath, branch, sha };
}

async function refExists(repo: string, ref: string): Promise<boolean> {
  try { return !!(await git(repo, ["rev-parse", "--verify", "--quiet", ref])).trim(); } catch { return false; }
}

/**
 * Undo a fell: recreate the worktree at the captured sha. If the branch still
 * exists (fell's `branch -D` was refused), reuse it rather than failing on
 * `add -b`. Throws loudly if the path is occupied — the caller surfaces that.
 */
export async function unfell(repo: string, token: RestoreToken): Promise<void> {
  if (token.branch) {
    if (await refExists(repo, token.branch)) await git(repo, ["worktree", "add", token.path, token.branch]);
    else await git(repo, ["worktree", "add", "-b", token.branch, token.path, token.sha]);
  } else {
    await git(repo, ["worktree", "add", "--detach", token.path, token.sha]);
  }
}

/** The worktree's dirty state as a tree object — via a throwaway index, so the
 *  live tree, its index, and its branch are untouched. */
async function wipTreeOf(wtPath: string): Promise<string> {
  const tmpIndex = join(tmpdir(), `lj-wip-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  try {
    const env = { GIT_INDEX_FILE: tmpIndex };
    await git(wtPath, ["add", "-A"], env);
    return (await git(wtPath, ["write-tree"], env)).trim();
  } finally {
    try { unlinkSync(tmpIndex); } catch {}
  }
}

/**
 * Three-way tree merge without touching any worktree. Wants merge-tree's
 * --merge-base, but that needs git ≥ 2.40 — so instead synthesize the ancestry:
 * three scaffold commits sharing an explicit base parent make git compute
 * exactly the base we mean. Works on git ≥ 2.38 (--write-tree). The scaffold
 * commits are unreferenced and get GC'd. Returns null where merge-tree can't
 * do --write-tree at all (< 2.38) — callers fall back to a plain snapshot.
 */
async function mergeTrees(
  repo: string, baseTree: string, oursTree: string, theirsTree: string
): Promise<{ tree: string; conflicts: string[] } | null> {
  const baseC = (await git(repo, ["commit-tree", baseTree, "-m", "lj salvage scaffold: base"])).trim();
  const oursC = (await git(repo, ["commit-tree", oursTree, "-p", baseC, "-m", "lj salvage scaffold: ours"])).trim();
  const theirsC = (await git(repo, ["commit-tree", theirsTree, "-p", baseC, "-m", "lj salvage scaffold: theirs"])).trim();
  const r = await gitCode(repo, ["merge-tree", "--write-tree", "--name-only", oursC, theirsC]);
  const lines = r.out.split("\n");
  if (r.code > 1 || !/^[0-9a-f]{40,64}$/.test((lines[0] || "").trim())) return null;
  const conflicts: string[] = [];
  if (r.code === 1) {
    for (let i = 1; i < lines.length && lines[i].trim(); i++) conflicts.push(lines[i].trim());
  }
  return { tree: lines[0].trim(), conflicts };
}

/**
 * MERGE a worktree's WIP — tracked modifications AND untracked (non-ignored)
 * files, as the delta from its own HEAD — into `preserveBranch`, WITHOUT
 * touching the worktree. The branch accumulates every worktree's WIP woven
 * together; a genuine collision is committed WITH conflict markers (noted in
 * the commit message) for review to sort out — salvage's promise is "nothing
 * is lost", not "this will land clean". Returns the new commit sha.
 */
export async function salvage(
  repo: string,
  wtPath: string,
  preserveBranch: string,
  message: string
): Promise<string> {
  const wipTree = await wipTreeOf(wtPath);
  const head = (await git(wtPath, ["rev-parse", "HEAD"])).trim();
  const headTree = (await git(wtPath, ["rev-parse", "HEAD^{tree}"])).trim();
  const ref = `refs/heads/${preserveBranch}`;
  // compare-and-swap loop: read the current tip, merge onto it, then
  // update-ref with the expected old value. If a concurrent salvage advanced
  // the branch between read and write, the CAS fails and we redo the merge
  // against the new tip — so no preserved WIP is ever clobbered.
  for (let attempt = 0; attempt < 6; attempt++) {
    let old = "";
    try { old = (await git(repo, ["rev-parse", "--verify", "--quiet", ref])).trim(); } catch {}
    let tree = wipTree;
    let note = "";
    if (old) {
      const oldTree = (await git(repo, ["rev-parse", `${old}^{tree}`])).trim();
      const merged = await mergeTrees(repo, headTree, oldTree, wipTree);
      if (merged) {
        tree = merged.tree;
        if (merged.conflicts.length) note = `\n\nconflict markers: ${merged.conflicts.join(", ")}`;
      } // merged === null → ancient git: legacy whole-tree snapshot
    }
    const parent = old || head; // first salvage roots at HEAD so its diff is the pure WIP delta
    const commit = (await git(wtPath, ["commit-tree", tree, "-p", parent, "-m", message + note])).trim();
    try {
      await git(repo, ["update-ref", ref, commit, old]); // old="" ⇒ ref must not exist
      return commit;
    } catch { /* another writer moved it — re-read and retry */ }
  }
  throw new Error(`salvage: could not update ${preserveBranch} after retries`);
}

export interface SalvagePreview {
  branch: string;
  files: string[]; // every WIP path the salvage would capture
  conflicts: string[]; // the subset that collides with the salvage tip
  clean: boolean;
}

/** The dry run of salvage — same merge, no ref update, nothing written that
 *  isn't garbage-collectable. On pre-2.38 git the merge can't be simulated;
 *  the preview reports clean (matching the snapshot fallback, which can't conflict). */
export async function salvagePreview(
  repo: string, wtPath: string, preserveBranch: string
): Promise<SalvagePreview> {
  const porc = await git(wtPath, ["status", "--porcelain", "--untracked-files=all"]);
  const files = wipPaths(porc.split("\n").filter(Boolean));
  let conflicts: string[] = [];
  let old = "";
  try { old = (await git(repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${preserveBranch}`])).trim(); } catch {}
  if (old && files.length) {
    const wipTree = await wipTreeOf(wtPath);
    const headTree = (await git(wtPath, ["rev-parse", "HEAD^{tree}"])).trim();
    const oldTree = (await git(repo, ["rev-parse", `${old}^{tree}`])).trim();
    const merged = await mergeTrees(repo, headTree, oldTree, wipTree);
    if (merged) conflicts = merged.conflicts;
  }
  return { branch: preserveBranch, files, conflicts, clean: conflicts.length === 0 };
}

/**
 * Integrate a diverged branch: rebase it onto the trunk (in its own worktree),
 * then land it. On any rebase conflict it aborts cleanly and reports — never
 * leaves the worktree mid-rebase, never force-lands. Referencing the trunk by
 * name means each call rebases onto the *current* trunk, so a sequence cascades.
 */
export async function integrateOne(
  repo: string, wtPath: string, branch: string, trunk?: string
): Promise<{ status: "landed" | "conflict" | "skipped"; message: string }> {
  const t = trunk ?? (await trunkBranch(repo));
  try {
    await git(wtPath, ["rebase", t]);
  } catch {
    await git(wtPath, ["rebase", "--abort"]).catch(() => {});
    return { status: "conflict", message: `${branch} conflicts rebasing onto ${t}` };
  }
  const res = await land(repo, branch, t);
  return res.ok ? { status: "landed", message: res.message } : { status: "skipped", message: res.message };
}

/** Integrate each tree in turn (cascading onto the growing trunk). */
export async function integrateMany(
  repo: string, trees: TreeRef[], trunk?: string
): Promise<{ landed: string[]; conflicts: string[]; skipped: string[] }> {
  const t = trunk ?? (await trunkBranch(repo));
  const landed: string[] = [], conflicts: string[] = [], skipped: string[] = [];
  for (const tr of trees) {
    const r = await integrateOne(repo, tr.path, tr.branch, t);
    (r.status === "landed" ? landed : r.status === "conflict" ? conflicts : skipped).push(tr.branch);
  }
  return { landed, conflicts, skipped };
}

/**
 * Diffstat between two branch TIPS — for judging rival solutions. Uses a
 * two-tree diff (`git diff a b`), NOT a `a...b` merge-base range, so changes
 * unique to EITHER side are shown (three-dot would omit a's own changes).
 */
export async function compareStat(repo: string, a: string, b: string): Promise<{ files: number; raw: string }> {
  const raw = (await git(repo, ["diff", "--stat", a, b])).trim();
  const names = (await git(repo, ["diff", "--name-only", a, b])).split("\n").filter(Boolean);
  return { files: names.length, raw };
}

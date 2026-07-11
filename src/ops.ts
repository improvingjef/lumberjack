// ops.ts — git mutations on the fleet. Pure (no vscode), so it's unit-testable
// against real temp repos. fell / unfell / salvage and the freshness assess.

import { execFile } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync } from "fs";
import { trunkBranch } from "./git";
import { assessSafety } from "./core";

function git(cwd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git", ["-C", cwd, ...args],
      { maxBuffer: 64 * 1024 * 1024, env: env ? { ...process.env, ...env } : process.env },
      (err, out, errout) => (err ? reject(new Error(errout || err.message)) : resolve(out ?? ""))
    );
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

/** Restore every token from a fellMany (undo-all). */
export async function unfellMany(repo: string, tokens: RestoreToken[]): Promise<void> {
  for (const t of tokens) { try { await unfell(repo, t); } catch {} }
}

/**
 * Land a branch: fast-forward the trunk to it. Requires the trunk to be checked
 * out in the main worktree (so the working tree stays consistent). Refuses
 * anything that isn't a clean fast-forward — never a merge commit, never force.
 */
export async function land(repo: string, branch: string, trunk?: string): Promise<{ ok: boolean; message: string }> {
  const t = trunk ?? (await trunkBranch(repo));
  const head = (await git(repo, ["symbolic-ref", "--quiet", "--short", "HEAD"])).trim();
  if (head !== t) return { ok: false, message: `trunk '${t}' isn't checked out in the main worktree (it's on '${head}')` };
  try {
    await git(repo, ["merge", "--ff-only", branch]);
    return { ok: true, message: `fast-forwarded ${t} → ${branch}` };
  } catch {
    return { ok: false, message: `${branch} isn't a fast-forward of ${t} (diverged)` };
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

/** Park every listed tree's WIP onto one shared review branch; returns how many succeeded. */
export async function salvageMany(repo: string, trees: TreeRef[], preserveBranch: string): Promise<number> {
  let n = 0;
  for (const t of trees) {
    try { await salvage(repo, t.path, preserveBranch, `salvage: preserve ${t.name} (lumberjack)`); n++; } catch {}
  }
  return n;
}

/** Fell a worktree: capture its HEAD, remove the tree, delete its branch. */
export async function fell(repo: string, wtPath: string, branch: string | null): Promise<RestoreToken> {
  const sha = (await git(wtPath, ["rev-parse", "HEAD"])).trim();
  await git(repo, ["worktree", "remove", "--force", wtPath]);
  if (branch) { try { await git(repo, ["branch", "-D", branch]); } catch {} }
  return { path: wtPath, branch, sha };
}

/** Undo a fell: recreate the worktree (and branch) at the captured sha. */
export async function unfell(repo: string, token: RestoreToken): Promise<void> {
  if (token.branch) await git(repo, ["worktree", "add", "-b", token.branch, token.path, token.sha]);
  else await git(repo, ["worktree", "add", "--detach", token.path, token.sha]);
}

/**
 * Snapshot ALL of a worktree's WIP — tracked modifications AND untracked
 * (non-ignored) files — into a single commit appended to `preserveBranch`,
 * WITHOUT touching the worktree. Uses a throwaway index so the live tree and
 * its own branch are untouched. Returns the new commit sha.
 */
export async function salvage(
  repo: string,
  wtPath: string,
  preserveBranch: string,
  message: string
): Promise<string> {
  const tmpIndex = join(tmpdir(), `lj-salvage-${process.pid}-${Date.now()}`);
  try {
    const env = { GIT_INDEX_FILE: tmpIndex };
    await git(wtPath, ["add", "-A"], env); // stage everything into the throwaway index
    const tree = (await git(wtPath, ["write-tree"], env)).trim();
    const ref = `refs/heads/${preserveBranch}`;
    // compare-and-swap loop: read the current tip, build a commit on it, then
    // update-ref with the expected old value. If a concurrent salvage advanced
    // the branch between read and write, the CAS fails and we retry — so no
    // preserved snapshot is ever clobbered.
    for (let attempt = 0; attempt < 6; attempt++) {
      let old = "";
      try { old = (await git(repo, ["rev-parse", "--verify", "--quiet", ref])).trim(); } catch {}
      const parent = old || (await git(wtPath, ["rev-parse", "HEAD"])).trim(); // first snapshot roots at HEAD
      const commit = (await git(wtPath, ["commit-tree", tree, "-p", parent, "-m", message])).trim();
      try {
        await git(repo, ["update-ref", ref, commit, old]); // old="" ⇒ ref must not exist
        return commit;
      } catch { /* another writer moved it — re-read and retry */ }
    }
    throw new Error(`salvage: could not update ${preserveBranch} after retries`);
  } finally {
    try { unlinkSync(tmpIndex); } catch {}
  }
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

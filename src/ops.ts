// ops.ts — git mutations on the fleet. Pure (no vscode), so it's unit-testable
// against real temp repos. fell / unfell / salvage and the freshness assess.

import { execFile } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync } from "fs";
import { trunkBranch } from "./git";

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

/** Re-read a worktree's live state right before acting on it. */
export async function assess(repo: string, wtPath: string, trunk?: string): Promise<Assessment> {
  const t = trunk ?? (await trunkBranch(repo));
  let ahead = 0;
  let porc = "";
  let sha = "";
  try { ahead = parseInt((await git(wtPath, ["rev-list", "--count", `${t}..HEAD`])).trim(), 10) || 0; } catch {}
  try { porc = await git(wtPath, ["status", "--porcelain"]); } catch {}
  try { sha = (await git(wtPath, ["rev-parse", "HEAD"])).trim(); } catch {}
  const trackedWip = porc.split("\n").filter(Boolean).some((l) => !l.startsWith("??"));
  return { ahead, trackedWip, sha, safe: ahead === 0 && !trackedWip };
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
    // rev-parse --verify exits non-zero when the branch doesn't exist yet; that
    // rejects here, so treat any failure as "no preserve branch" and root the
    // first snapshot at the worktree's own HEAD.
    let parent = "";
    try { parent = (await git(repo, ["rev-parse", "--verify", "--quiet", preserveBranch])).trim(); } catch {}
    if (!parent) parent = (await git(wtPath, ["rev-parse", "HEAD"])).trim();
    const commit = (await git(wtPath, ["commit-tree", tree, "-p", parent, "-m", message])).trim();
    await git(repo, ["update-ref", `refs/heads/${preserveBranch}`, commit]);
    return commit;
  } finally {
    try { unlinkSync(tmpIndex); } catch {}
  }
}

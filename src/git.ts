// Live git queries for the worktree fleet. Ports the data model from the
// gramma `gen.py` prototype: worktrees + loose branches, each with recent
// commits colored by master-membership, plus per-commit file lists.

import { execFile } from "child_process";

export interface Commit {
  sha: string;
  short: string;
  subj: string;
  onMaster: boolean;
  files: string[];
  filesOverflow: number;
}

export interface Row {
  kind: "worktree" | "branch";
  name: string;
  branch: string;
  path: string; // worktree dir, or "(no worktree)" for loose branches
  commits: Commit[];
  overflow: number;
  dirty: boolean;
  wip: string[]; // porcelain lines, worktree rows only
  ahead: number;
}

export interface Fleet {
  worktrees: Row[];
  branches: Row[];
}

const US = "\x1f"; // unit separator, matches gen.py's %x1f

function git(repo: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["-C", repo, ...args],
      { maxBuffer: 64 * 1024 * 1024 },
      (_err, stdout) => resolve(stdout ?? "")
    );
  });
}

/** Files a single commit changed (memoised by sha across the whole scan). */
async function filesOf(
  repo: string,
  sha: string,
  cache: Map<string, { files: string[]; overflow: number }>,
  maxFiles: number
): Promise<{ files: string[]; overflow: number }> {
  const hit = cache.get(sha);
  if (hit) return hit;
  const out = await git(repo, [
    "diff-tree",
    "--no-commit-id",
    "--name-only",
    "-r",
    sha,
  ]);
  const all = out.split("\n").filter((f) => f.length > 0);
  const rec = {
    files: all.slice(0, maxFiles),
    overflow: Math.max(0, all.length - maxFiles),
  };
  cache.set(sha, rec);
  return rec;
}

async function commitsOf(
  repo: string,
  cwd: string,
  ref: string | null,
  masterShas: Set<string>,
  cache: Map<string, { files: string[]; overflow: number }>,
  window: number,
  maxFiles: number
): Promise<{ commits: Commit[]; overflow: number }> {
  const args = ["log", `-n${window + 1}`, `--pretty=%H${US}%s`];
  if (ref) args.push(ref);
  const lines = (await git(cwd, args)).split("\n").filter((l) => l.includes(US));
  const shown = lines.slice(0, window);
  const commits: Commit[] = [];
  for (const ln of shown) {
    const idx = ln.indexOf(US);
    const sha = ln.slice(0, idx);
    const subj = ln.slice(idx + 1);
    const fr = maxFiles > 0
      ? await filesOf(repo, sha, cache, maxFiles)
      : { files: [], overflow: 0 };
    commits.push({
      sha,
      short: sha.slice(0, 9),
      subj,
      onMaster: masterShas.has(sha),
      files: fr.files,
      filesOverflow: fr.overflow,
    });
  }
  return { commits, overflow: Math.max(0, lines.length - window) };
}

interface WorktreeEntry {
  path: string;
  branch: string;
}

async function worktreeEntries(repo: string): Promise<WorktreeEntry[]> {
  const out = await git(repo, ["worktree", "list", "--porcelain"]);
  const entries: WorktreeEntry[] = [];
  let cur: Partial<WorktreeEntry> = {};
  for (const line of out.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (cur.path) entries.push({ path: cur.path, branch: cur.branch ?? "?" });
      cur = { path: line.slice("worktree ".length) };
    } else if (line.startsWith("branch ")) {
      cur.branch = line.slice("branch ".length).replace("refs/heads/", "");
    } else if (line === "detached") {
      cur.branch = "(detached)";
    }
  }
  if (cur.path) entries.push({ path: cur.path, branch: cur.branch ?? "?" });
  return entries;
}

export interface GatherOpts {
  window?: number; // recent commits per row (squares). Default 14.
  maxFiles?: number; // per-commit file cap; <= 0 skips file gathering entirely.
  includeBranches?: boolean; // scan loose branches (slow). Default true.
}

/** Gather the full fleet: worktrees (attention-sorted) + loose branches. */
export async function gatherFleet(repo: string, opts: GatherOpts = {}): Promise<Fleet> {
  const window = opts.window ?? 14;
  const maxFiles = opts.maxFiles ?? 80;
  const includeBranches = opts.includeBranches ?? true;
  const masterShas = new Set(
    (await git(repo, ["rev-list", "master"])).split("\n").filter(Boolean)
  );
  const cache = new Map<string, { files: string[]; overflow: number }>();

  const wtEntries = await worktreeEntries(repo);
  const checkedOut = new Set(
    wtEntries
      .map((e) => e.branch)
      .filter((b) => b && b !== "(detached)")
  );

  const worktrees: Row[] = [];
  for (const e of wtEntries) {
    const name = e.path.replace(/\/+$/, "").split("/").pop() || e.path;
    const { commits, overflow } = await commitsOf(
      repo, e.path, null, masterShas, cache, window, maxFiles
    );
    const porc = (await git(e.path, ["status", "--porcelain"]))
      .split("\n")
      .filter(Boolean);
    const aheadRaw = (await git(e.path, ["rev-list", "--count", "master..HEAD"])).trim();
    worktrees.push({
      kind: "worktree",
      name,
      branch: e.branch,
      path: e.path,
      commits,
      overflow,
      dirty: porc.length > 0,
      wip: porc.slice(0, 200),
      ahead: /^\d+$/.test(aheadRaw) ? parseInt(aheadRaw, 10) : 0,
    });
  }
  worktrees.sort((a, b) => {
    const na = a.dirty || a.ahead > 0 ? 1 : 0;
    const nb = b.dirty || b.ahead > 0 ? 1 : 0;
    if (na !== nb) return nb - na;
    if (a.ahead !== b.ahead) return b.ahead - a.ahead;
    return a.name.localeCompare(b.name);
  });

  const allBranches = (
    await git(repo, ["for-each-ref", "--format=%(refname:short)", "refs/heads"])
  )
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const branches: Row[] = [];
  if (includeBranches) for (const b of allBranches) {
    if (b === "master" || checkedOut.has(b)) continue;
    const { commits, overflow } = await commitsOf(
      repo, repo, b, masterShas, cache, window, maxFiles
    );
    const aheadRaw = (await git(repo, ["rev-list", "--count", `master..${b}`])).trim();
    branches.push({
      kind: "branch",
      name: b,
      branch: b,
      path: "(no worktree)",
      commits,
      overflow,
      dirty: false,
      wip: [],
      ahead: /^\d+$/.test(aheadRaw) ? parseInt(aheadRaw, 10) : 0,
    });
  }
  branches.sort((a, b) =>
    a.ahead !== b.ahead ? b.ahead - a.ahead : a.name.localeCompare(b.name)
  );

  return { worktrees, branches };
}

/** Contents of a path at a git ref, for the historical side of a diff. */
export function showAtRef(repo: string, ref: string, path: string): Promise<string> {
  return git(repo, ["show", `${ref}:${path}`]);
}

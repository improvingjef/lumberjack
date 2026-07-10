// Live git queries for the worktree fleet. Data model shared by the extension
// and the `lj` CLI. Gathering is parallelised (bounded concurrency) and split
// into worktrees / branches so the UI can paint worktrees first and lazy-load
// per-commit files only when a commit is opened.

import { execFile } from "child_process";

export interface Commit {
  sha: string;
  short: string;
  subj: string;
  onMaster: boolean; // on the trunk
  date: number; // committer date, unix seconds
  files: string[]; // populated only in full mode; lazy-loaded otherwise
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
  trackedWip: boolean; // has uncommitted tracked/staged changes (a fell can't restore)
  wip: string[]; // porcelain lines, worktree rows only
  ahead: number;
  age: number; // days since the newest commit (staleness)
}

export interface Fleet {
  worktrees: Row[];
  branches: Row[];
}

export interface GatherOpts {
  window?: number; // recent commits per row (squares). Default 14.
  maxFiles?: number; // per-commit file cap; <= 0 skips file gathering entirely.
  includeBranches?: boolean; // scan loose branches (slow). Default true.
  trunk?: string; // branch to color against; auto-detected (master/main) if unset.
  concurrency?: number; // parallel git ops. Default 16.
}

const US = "\x1f";

function git(repo: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile("git", ["-C", repo, ...args], { maxBuffer: 64 * 1024 * 1024 }, (_e, out) => resolve(out ?? ""));
  });
}

/** The trunk branch to color against: master, else main, else origin's default. */
export async function trunkBranch(repo: string): Promise<string> {
  for (const b of ["master", "main"]) {
    if ((await git(repo, ["rev-parse", "--verify", "--quiet", b])).trim()) return b;
  }
  const head = (await git(repo, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"])).trim();
  return head ? head.replace(/^origin\//, "") : "master";
}

/** Run `fn` over `items` with bounded concurrency, preserving order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) || 1 }, worker));
  return out;
}

/** Files a single commit changed — the lazy path, called on demand. */
export async function commitFiles(repo: string, sha: string, maxFiles = 80): Promise<{ files: string[]; overflow: number }> {
  const out = await git(repo, ["diff-tree", "--no-commit-id", "--name-only", "-r", sha]);
  const all = out.split("\n").filter(Boolean);
  return { files: all.slice(0, maxFiles), overflow: Math.max(0, all.length - maxFiles) };
}

async function commitsOf(
  repo: string, cwd: string, ref: string | null, trunkShas: Set<string>,
  window: number, maxFiles: number, now: number
): Promise<{ commits: Commit[]; overflow: number; age: number }> {
  const args = ["log", `-n${window + 1}`, `--pretty=%H${US}%s${US}%ct`];
  if (ref) args.push(ref);
  const lines = (await git(cwd, args)).split("\n").filter((l) => l.includes(US));
  const shown = lines.slice(0, window);
  const commits: Commit[] = [];
  for (const ln of shown) {
    const [sha, subj, ct] = ln.split(US);
    const fr = maxFiles > 0 ? await commitFiles(repo, sha, maxFiles) : { files: [], overflow: 0 };
    commits.push({ sha, short: sha.slice(0, 9), subj, onMaster: trunkShas.has(sha), date: +ct || 0, files: fr.files, filesOverflow: fr.overflow });
  }
  const newest = commits[0]?.date ?? 0;
  const age = newest ? Math.max(0, (now - newest) / 86400) : 0;
  return { commits, overflow: Math.max(0, lines.length - window), age };
}

interface WTEntry { path: string; branch: string; }

async function worktreeEntries(repo: string): Promise<WTEntry[]> {
  const out = await git(repo, ["worktree", "list", "--porcelain"]);
  const entries: WTEntry[] = [];
  let cur: Partial<WTEntry> = {};
  for (const line of out.split("\n")) {
    if (line.startsWith("worktree ")) { if (cur.path) entries.push({ path: cur.path, branch: cur.branch ?? "?" }); cur = { path: line.slice(9) }; }
    else if (line.startsWith("branch ")) cur.branch = line.slice(7).replace("refs/heads/", "");
    else if (line === "detached") cur.branch = "(detached)";
  }
  if (cur.path) entries.push({ path: cur.path, branch: cur.branch ?? "?" });
  return entries;
}

async function trunkAnd(repo: string, opts: GatherOpts): Promise<{ trunk: string; trunkShas: Set<string> }> {
  const trunk = opts.trunk ?? (await trunkBranch(repo));
  const trunkShas = new Set((await git(repo, ["rev-list", trunk])).split("\n").filter(Boolean));
  return { trunk, trunkShas };
}

function attentionSort(a: Row, b: Row) {
  const na = a.dirty || a.ahead > 0 ? 1 : 0, nb = b.dirty || b.ahead > 0 ? 1 : 0;
  if (na !== nb) return nb - na;
  if (a.ahead !== b.ahead) return b.ahead - a.ahead;
  return a.name.localeCompare(b.name);
}

/** Worktrees only — the fast first paint. */
export async function gatherWorktrees(repo: string, opts: GatherOpts = {}): Promise<{ worktrees: Row[]; trunk: string }> {
  const window = opts.window ?? 14, maxFiles = opts.maxFiles ?? 0, conc = opts.concurrency ?? 16, now = Date.now() / 1000;
  const { trunk, trunkShas } = await trunkAnd(repo, opts);
  const entries = await worktreeEntries(repo);
  const worktrees = await mapLimit(entries, conc, async (e) => {
    const name = e.path.replace(/\/+$/, "").split("/").pop() || e.path;
    const [{ commits, overflow, age }, porcRaw, aheadRaw] = await Promise.all([
      commitsOf(repo, e.path, null, trunkShas, window, maxFiles, now),
      git(e.path, ["status", "--porcelain"]),
      git(e.path, ["rev-list", "--count", `${trunk}..HEAD`]),
    ]);
    const porc = porcRaw.split("\n").filter(Boolean);
    return {
      kind: "worktree" as const, name, branch: e.branch, path: e.path, commits, overflow,
      dirty: porc.length > 0, trackedWip: porc.some((l) => !l.startsWith("??")),
      wip: porc.slice(0, 200), ahead: /^\d+$/.test(aheadRaw.trim()) ? parseInt(aheadRaw.trim(), 10) : 0, age,
    };
  });
  worktrees.sort(attentionSort);
  return { worktrees, trunk };
}

/** Loose branches (no worktree) — the second paint / understory. */
export async function gatherBranches(repo: string, opts: GatherOpts = {}): Promise<Row[]> {
  const window = opts.window ?? 14, maxFiles = opts.maxFiles ?? 0, conc = opts.concurrency ?? 16, now = Date.now() / 1000;
  const { trunk, trunkShas } = await trunkAnd(repo, opts);
  const entries = await worktreeEntries(repo);
  const checkedOut = new Set(entries.map((e) => e.branch).filter((b) => b && b !== "(detached)"));
  const all = (await git(repo, ["for-each-ref", "--format=%(refname:short)", "refs/heads"])).split("\n").map((s) => s.trim()).filter(Boolean);
  const loose = all.filter((b) => b !== trunk && !checkedOut.has(b));
  const rows = await mapLimit(loose, conc, async (b) => {
    const [{ commits, overflow, age }, aheadRaw] = await Promise.all([
      commitsOf(repo, repo, b, trunkShas, window, maxFiles, now),
      git(repo, ["rev-list", "--count", `${trunk}..${b}`]),
    ]);
    return {
      kind: "branch" as const, name: b, branch: b, path: "(no worktree)", commits, overflow,
      dirty: false, trackedWip: false, wip: [], ahead: /^\d+$/.test(aheadRaw.trim()) ? parseInt(aheadRaw.trim(), 10) : 0, age,
    };
  });
  rows.sort((a, b) => (a.ahead !== b.ahead ? b.ahead - a.ahead : a.name.localeCompare(b.name)));
  return rows;
}

/** The whole fleet in one call (used by the CLI). */
export async function gatherFleet(repo: string, opts: GatherOpts = {}): Promise<Fleet> {
  const { worktrees, trunk } = await gatherWorktrees(repo, opts);
  const branches = (opts.includeBranches ?? true) ? await gatherBranches(repo, { ...opts, trunk }) : [];
  return { worktrees, branches };
}

/** Contents of a path at a git ref, for the historical side of a diff. */
export function showAtRef(repo: string, ref: string, path: string): Promise<string> {
  return git(repo, ["show", `${ref}:${path}`]);
}

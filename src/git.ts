// Live git queries for the worktree fleet. Data model shared by the extension
// and the `lj` CLI. All parsing / classification / sorting lives in ./core
// (pure, unit-tested); this file is the git I/O + concurrency around it.

import { execFile } from "child_process";
import {
  Group, classify, isAmber, parsePorcelain, parseWorktreeList,
  worktreeName, parseCount, attentionSort, branchSort,
} from "./core";

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
  trackedWip: boolean;
  wip: string[];
  ahead: number;
  age: number; // days since the newest commit
  group?: Group; // worktree rows only — the section it belongs to
  amber: boolean; // an aging (dirty + stale) gem
  claim?: string; // note from the shared claims board, if any
}

export interface Fleet {
  worktrees: Row[];
  branches: Row[];
}

export interface GatherOpts {
  window?: number;
  maxFiles?: number;
  includeBranches?: boolean;
  trunk?: string;
  concurrency?: number;
}

const US = "\x1f";

function git(repo: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile("git", ["-C", repo, ...args], { maxBuffer: 64 * 1024 * 1024 }, (_e, out) => resolve(out ?? ""));
  });
}

export async function trunkBranch(repo: string): Promise<string> {
  for (const b of ["master", "main"]) {
    if ((await git(repo, ["rev-parse", "--verify", "--quiet", b])).trim()) return b;
  }
  const head = (await git(repo, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"])).trim();
  return head ? head.replace(/^origin\//, "") : "master";
}

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

export async function commitFiles(repo: string, sha: string, maxFiles = 80): Promise<{ files: string[]; overflow: number }> {
  const out = await git(repo, ["diff-tree", "--no-commit-id", "--name-only", "-r", sha]);
  const all = out.split("\n").filter(Boolean);
  return { files: all.slice(0, maxFiles), overflow: Math.max(0, all.length - maxFiles) };
}

async function commitsOf(
  repo: string, cwd: string, ref: string | null, trunkShas: Set<string>,
  window: number, maxFiles: number
): Promise<{ commits: Commit[]; overflow: number; age: number }> {
  const args = ["log", `-n${window + 1}`, `--pretty=%H${US}%s${US}%ct`];
  if (ref) args.push(ref);
  const lines = (await git(cwd, args)).split("\n").filter((l) => l.includes(US));
  const commits: Commit[] = [];
  for (const ln of lines.slice(0, window)) {
    const [sha, subj, ct] = ln.split(US);
    const fr = maxFiles > 0 ? await commitFiles(repo, sha, maxFiles) : { files: [], overflow: 0 };
    commits.push({ sha, short: sha.slice(0, 9), subj, onMaster: trunkShas.has(sha), date: +ct || 0, files: fr.files, filesOverflow: fr.overflow });
  }
  const newest = commits[0]?.date ?? 0;
  const nowSec = Date.now() / 1000;
  const age = newest ? Math.max(0, (nowSec - newest) / 86400) : 0;
  return { commits, overflow: Math.max(0, lines.length - window), age };
}

async function trunkAnd(repo: string, opts: GatherOpts): Promise<{ trunk: string; trunkShas: Set<string> }> {
  const trunk = opts.trunk ?? (await trunkBranch(repo));
  const trunkShas = new Set((await git(repo, ["rev-list", trunk])).split("\n").filter(Boolean));
  return { trunk, trunkShas };
}

export async function gatherWorktrees(repo: string, opts: GatherOpts = {}): Promise<{ worktrees: Row[]; trunk: string }> {
  const window = opts.window ?? 14, maxFiles = opts.maxFiles ?? 0, conc = opts.concurrency ?? 16;
  const { trunk, trunkShas } = await trunkAnd(repo, opts);
  const entries = parseWorktreeList(await git(repo, ["worktree", "list", "--porcelain"]));
  const worktrees = await mapLimit(entries, conc, async (e) => {
    const [{ commits, overflow, age }, porcRaw, aheadRaw] = await Promise.all([
      commitsOf(repo, e.path, null, trunkShas, window, maxFiles),
      git(e.path, ["status", "--porcelain"]),
      git(e.path, ["rev-list", "--count", `${trunk}..HEAD`]),
    ]);
    const porc = parsePorcelain(porcRaw);
    const ahead = parseCount(aheadRaw);
    const row: Row = {
      kind: "worktree", name: worktreeName(e.path), branch: e.branch, path: e.path,
      commits, overflow, dirty: porc.dirty, trackedWip: porc.trackedWip, wip: porc.lines.slice(0, 200),
      ahead, age, amber: isAmber({ dirty: porc.dirty, age }),
    };
    row.group = classify(row);
    return row;
  });
  worktrees.sort(attentionSort);
  return { worktrees, trunk };
}

export async function gatherBranches(repo: string, opts: GatherOpts = {}): Promise<Row[]> {
  const window = opts.window ?? 14, maxFiles = opts.maxFiles ?? 0, conc = opts.concurrency ?? 16;
  const { trunk, trunkShas } = await trunkAnd(repo, opts);
  const entries = parseWorktreeList(await git(repo, ["worktree", "list", "--porcelain"]));
  const checkedOut = new Set(entries.map((e) => e.branch).filter((b) => b && b !== "(detached)"));
  const all = (await git(repo, ["for-each-ref", "--format=%(refname:short)", "refs/heads"])).split("\n").map((s) => s.trim()).filter(Boolean);
  const loose = all.filter((b) => b !== trunk && !checkedOut.has(b));
  const rows = await mapLimit(loose, conc, async (b) => {
    const [{ commits, overflow, age }, aheadRaw] = await Promise.all([
      commitsOf(repo, repo, b, trunkShas, window, maxFiles),
      git(repo, ["rev-list", "--count", `${trunk}..${b}`]),
    ]);
    return {
      kind: "branch" as const, name: b, branch: b, path: "(no worktree)", commits, overflow,
      dirty: false, trackedWip: false, wip: [], ahead: parseCount(aheadRaw), age, amber: false,
    };
  });
  rows.sort(branchSort);
  return rows;
}

export async function gatherFleet(repo: string, opts: GatherOpts = {}): Promise<Fleet> {
  const { worktrees, trunk } = await gatherWorktrees(repo, opts);
  const branches = (opts.includeBranches ?? true) ? await gatherBranches(repo, { ...opts, trunk }) : [];
  return { worktrees, branches };
}

export function showAtRef(repo: string, ref: string, path: string): Promise<string> {
  return git(repo, ["show", `${ref}:${path}`]);
}

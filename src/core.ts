// core.ts — the pure domain logic. No git, no vscode, no DOM. Every function
// here is a total function of its inputs, so the whole thing tests in
// microseconds and is the single source of truth for grouping/safety/parsing.

export const AMBER_DAYS = 5;

export type Group = "needs" | "wip" | "dead";

export interface WorktreeFacts {
  ahead: number; // commits not on the trunk
  dirty: boolean; // any uncommitted change (tracked or untracked)
  age: number; // days since the newest commit
}

export interface WTEntry {
  path: string;
  branch: string;
}

/**
 * Which section a worktree belongs to:
 *   needs — has unmerged commits (review / land)
 *   wip   — the only unmerged thing is uncommitted work (salvage for review)
 *   dead  — landed & clean (fell)
 */
export function classify(r: { ahead: number; dirty: boolean }): Group {
  if (r.ahead > 0) return "needs";
  if (r.dirty) return "wip";
  return "dead";
}

/** A dirty worktree left untouched long enough to be an "aging gem". */
export function isAmber(r: { dirty: boolean; age: number }, amberDays = AMBER_DAYS): boolean {
  return r.dirty && r.age >= amberDays;
}

/**
 * Whether a fell would lose nothing: no unmerged commits AND no *tracked*
 * uncommitted work (untracked scratch — "brush" — is disposable, so it doesn't
 * make a tree unsafe).
 */
export function assessSafety(ahead: number, porcelainLines: string[]): { trackedWip: boolean; safe: boolean } {
  const trackedWip = porcelainLines.some((l) => l.length > 0 && !l.startsWith("??"));
  return { trackedWip, safe: ahead === 0 && !trackedWip };
}

/** Parse `git status --porcelain` into WIP facts. */
export function parsePorcelain(text: string): { lines: string[]; dirty: boolean; trackedWip: boolean } {
  const lines = text.split("\n").filter((l) => l.length > 0);
  return { lines, dirty: lines.length > 0, trackedWip: lines.some((l) => !l.startsWith("??")) };
}

/** Parse `git worktree list --porcelain` into path/branch records. */
export function parseWorktreeList(porcelain: string): WTEntry[] {
  const entries: WTEntry[] = [];
  let cur: Partial<WTEntry> = {};
  for (const line of porcelain.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (cur.path) entries.push({ path: cur.path, branch: cur.branch ?? "?" });
      cur = { path: line.slice(9) };
    } else if (line.startsWith("branch ")) {
      cur.branch = line.slice(7).replace("refs/heads/", "");
    } else if (line === "detached") {
      cur.branch = "(detached)";
    }
  }
  if (cur.path) entries.push({ path: cur.path, branch: cur.branch ?? "?" });
  return entries;
}

/** The basename of a worktree path (its display name). */
export function worktreeName(path: string): string {
  return path.replace(/\/+$/, "").split("/").pop() || path;
}

/** Parse a `git rev-list --count` result, defaulting to 0. */
export function parseCount(raw: string): number {
  const t = raw.trim();
  return /^\d+$/.test(t) ? parseInt(t, 10) : 0;
}

/** Attention-first ordering: dirty/ahead float up, then by ahead, then name. */
export function attentionSort<T extends { dirty: boolean; ahead: number; name: string }>(a: T, b: T): number {
  const na = a.dirty || a.ahead > 0 ? 1 : 0;
  const nb = b.dirty || b.ahead > 0 ? 1 : 0;
  if (na !== nb) return nb - na;
  if (a.ahead !== b.ahead) return b.ahead - a.ahead;
  return a.name.localeCompare(b.name);
}

/** Loose-branch ordering: most-ahead first, then name. */
export function branchSort<T extends { ahead: number; name: string }>(a: T, b: T): number {
  return a.ahead !== b.ahead ? b.ahead - a.ahead : a.name.localeCompare(b.name);
}

export interface Summary {
  total: number;
  needs: number;
  wip: number;
  dead: number;
  understory: number;
  aging: number;
}

/** Roll a fleet up into the one-line summary counts. */
export function summarize(worktrees: WorktreeFacts[], branchCount: number): Summary {
  let needs = 0, wip = 0, dead = 0, aging = 0;
  for (const r of worktrees) {
    const g = classify(r);
    if (g === "needs") needs++;
    else if (g === "wip") wip++;
    else dead++;
    if (isAmber(r)) aging++;
  }
  return { total: worktrees.length, needs, wip, dead, understory: branchCount, aging };
}

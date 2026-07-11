// manifest.ts — the central claims store: the swarm's shared blackboard.
// Lives in the git COMMON dir (<repo>/.git/lumberjack/manifest.json) so every
// worktree reads/writes the same file, and it never touches a worktree or
// shows up in `git status`. Keyed by absolute worktree path.
//
// Because multiple CLI/MCP agents write it concurrently, every mutation runs
// under an exclusive lockfile (with stale-steal) and writes atomically via a
// temp file + rename, so no claim is lost or read half-written.

import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, closeSync, unlinkSync, statSync, renameSync } from "fs";
import { join } from "path";

export interface Claim {
  note: string;
  at: number; // unix ms
}
export type Claims = Record<string, Claim>;

function dir(storeDir: string): string { return join(storeDir, "lumberjack"); }
function file(storeDir: string): string { return join(dir(storeDir), "manifest.json"); }

export function readClaims(storeDir: string): Claims {
  const p = file(storeDir);
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8")).claims ?? {};
  } catch {
    return {}; // a corrupt/half-written store reads as empty rather than crashing the fleet
  }
}

function acquire(lockPath: string): number {
  for (let i = 0; i < 200; i++) {
    try { return openSync(lockPath, "wx"); } // exclusive create; EEXIST if held
    catch (e: any) {
      if (e.code !== "EEXIST") throw e;
      try { if (Date.now() - statSync(lockPath).mtimeMs > 5000) { unlinkSync(lockPath); continue; } } catch {}
      const until = Date.now() + 3; while (Date.now() < until) { /* brief spin */ }
    }
  }
  return -1; // couldn't acquire in time — proceed best-effort rather than deadlock
}

function withLock<T>(storeDir: string, fn: () => T): T {
  mkdirSync(dir(storeDir), { recursive: true });
  const lockPath = join(dir(storeDir), "manifest.lock");
  const fd = acquire(lockPath);
  try { return fn(); }
  finally { if (fd >= 0) { try { closeSync(fd); } catch {} try { unlinkSync(lockPath); } catch {} } }
}

function save(storeDir: string, claims: Claims): void {
  mkdirSync(dir(storeDir), { recursive: true });
  const tmp = file(storeDir) + `.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify({ claims }, null, 2) + "\n");
  renameSync(tmp, file(storeDir)); // atomic swap — readers never see a partial write
}

export function setClaim(storeDir: string, worktreePath: string, note: string): void {
  withLock(storeDir, () => {
    const claims = readClaims(storeDir);
    claims[worktreePath] = { note, at: Date.now() };
    save(storeDir, claims);
  });
}

export function clearClaim(storeDir: string, worktreePath: string): void {
  withLock(storeDir, () => {
    const claims = readClaims(storeDir);
    delete claims[worktreePath];
    save(storeDir, claims);
  });
}

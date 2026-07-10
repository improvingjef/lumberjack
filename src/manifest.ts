// manifest.ts — the central claims store: the swarm's shared blackboard.
// Lives in the git COMMON dir (<repo>/.git/lumberjack/manifest.json) so every
// worktree reads/writes the same file, and it never touches a worktree or
// shows up in `git status`. Keyed by absolute worktree path.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

export interface Claim {
  note: string;
  at: number; // unix ms
}
export type Claims = Record<string, Claim>;

function file(storeDir: string): string {
  return join(storeDir, "lumberjack", "manifest.json");
}

export function readClaims(storeDir: string): Claims {
  const p = file(storeDir);
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8")).claims ?? {};
  } catch {
    return {}; // a corrupt store reads as empty rather than crashing the fleet
  }
}

function save(storeDir: string, claims: Claims): void {
  mkdirSync(join(storeDir, "lumberjack"), { recursive: true });
  writeFileSync(file(storeDir), JSON.stringify({ claims }, null, 2) + "\n");
}

export function setClaim(storeDir: string, worktreePath: string, note: string): void {
  const claims = readClaims(storeDir);
  claims[worktreePath] = { note, at: Date.now() };
  save(storeDir, claims);
}

export function clearClaim(storeDir: string, worktreePath: string): void {
  const claims = readClaims(storeDir);
  delete claims[worktreePath];
  save(storeDir, claims);
}

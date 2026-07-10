#!/usr/bin/env node
// lj — the terminal half of Lumberjack. Same git.ts core as the extension.
//
//   lj                 status table of the worktree fleet
//   lj branches        list loose branches (no worktree)
//   lj reap            preview landed + fully-clean worktrees to remove
//   lj reap --go       remove them (worktree + merged branch)
//   lj reap --untracked-ok   also reap worktrees dirty ONLY from untracked scratch
//   lj -C <path>       operate on a different repo (default: cwd's repo)
//   lj help

import { execFile } from "child_process";
import { gatherFleet, Row } from "./git";

const C = {
  reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m",
  blue: "\x1b[38;2;59;130;246m", red: "\x1b[38;2;239;68;68m",
  green: "\x1b[38;2;34;197;94m", yellow: "\x1b[38;2;234;179;8m",
};

function git(repo: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", ["-C", repo, ...args], { maxBuffer: 64 * 1024 * 1024 }, (err, out) =>
      err ? reject(err) : resolve(out ?? "")
    );
  });
}

async function repoRoot(cwd: string): Promise<string> {
  try {
    return (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
  } catch {
    console.error("lj: not inside a git repository");
    process.exit(1);
  }
}

/** The main (non-linked) worktree — never a reap candidate. First in the list. */
async function mainWorktree(repo: string): Promise<string> {
  const out = await git(repo, ["worktree", "list", "--porcelain"]);
  const first = out.split("\n").find((l) => l.startsWith("worktree "));
  return first ? first.slice("worktree ".length) : repo;
}

function squares(r: Row): string {
  let s = "";
  if (r.dirty) s += C.blue + "■" + C.reset;
  for (const c of r.commits) s += (c.onMaster ? C.green : C.red) + "■" + C.reset;
  if (r.overflow) s += C.dim + "+" + r.overflow + C.reset;
  return s;
}

function statusTag(r: Row): string {
  const bits: string[] = [];
  if (r.ahead > 0) bits.push(C.red + r.ahead + "↑" + C.reset);
  if (r.dirty) bits.push(C.blue + "WIP" + C.reset);
  if (!bits.length) bits.push(C.dim + "landed" + C.reset);
  return bits.join(" ");
}

function pad(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s + " ".repeat(n - s.length);
}

async function looseCount(repo: string): Promise<number> {
  const wt = await git(repo, ["worktree", "list", "--porcelain"]);
  const checkedOut = new Set(
    wt.split("\n").filter((l) => l.startsWith("branch "))
      .map((l) => l.slice("branch ".length).replace("refs/heads/", ""))
  );
  const all = (await git(repo, ["for-each-ref", "--format=%(refname:short)", "refs/heads"]))
    .split("\n").map((s) => s.trim()).filter(Boolean);
  return all.filter((b) => b !== "master" && !checkedOut.has(b)).length;
}

function repoName(repo: string): string {
  return repo.replace(/\/+$/, "").split("/").pop() || repo;
}

async function cmdStatus(repo: string) {
  const [fleet, loose] = await Promise.all([
    gatherFleet(repo, { window: 14, maxFiles: 0, includeBranches: false }),
    looseCount(repo),
  ]);
  const w = fleet.worktrees;
  const dirty = w.filter((r) => r.dirty).length;
  const ahead = w.filter((r) => r.ahead > 0 && !r.dirty).length;
  const landed = w.length - w.filter((r) => r.dirty || r.ahead > 0).length;
  console.log(
    `\n${C.bold}🪓 ${repoName(repo)}${C.reset}  ${C.dim}—${C.reset}  ` +
    `${w.length} worktrees · ${loose} loose · ` +
    `${C.blue}${dirty} dirty${C.reset} · ${C.red}${ahead} ahead${C.reset} · ` +
    `${C.green}${landed} landed${C.reset}\n`
  );
  for (const r of w) console.log(`  ${pad(r.name, 30)} ${pad(squares(r), 0)}  ${statusTag(r)}`);
  console.log(
    `\n  ${C.dim}legend:${C.reset} ${C.blue}■${C.reset} WIP  ` +
    `${C.red}■${C.reset} off master  ${C.green}■${C.reset} on master   ` +
    `${C.dim}lj reap  ·  lj branches${C.reset}\n`
  );
}

async function cmdBranches(repo: string) {
  const fleet = await gatherFleet(repo, { window: 14, maxFiles: 0, includeBranches: true });
  console.log(`\n${C.bold}loose branches (no worktree): ${fleet.branches.length}${C.reset}\n`);
  for (const r of fleet.branches) console.log(`  ${pad(r.name, 44)} ${squares(r)}  ${statusTag(r)}`);
  console.log("");
}

async function cmdReap(repo: string, go: boolean, untrackedOk: boolean) {
  const fleet = await gatherFleet(repo, { window: 1, maxFiles: 0, includeBranches: false });
  const main = await mainWorktree(repo);
  const here = (await git(process.cwd(), ["rev-parse", "--show-toplevel"]).catch(() => "")).trim();

  const candidates = fleet.worktrees.filter((r) => {
    if (r.path === main || r.path === here) return false; // never the main tree or the one we stand in
    if (r.ahead !== 0) return false;
    if (!r.dirty) return true; // fully clean, landed
    if (untrackedOk) return r.wip.every((l) => l.startsWith("??")); // dirty only from untracked scratch
    return false;
  });

  if (!candidates.length) {
    console.log(`\n  nothing to reap (${untrackedOk ? "landed or untracked-only" : "landed + clean"}).\n`);
    return;
  }
  console.log(`\n${go ? C.bold + "reaping" + C.reset : "would reap"} ${candidates.length} worktree(s):\n`);
  for (const r of candidates) {
    const branch = r.branch && r.branch !== "(detached)" ? r.branch : "(detached)";
    if (go) {
      await git(repo, ["worktree", "remove", "--force", r.path]);
      if (branch !== "(detached)") await git(repo, ["branch", "-D", branch]).catch(() => {});
      console.log(`  ${C.green}✓${C.reset} ${pad(r.name, 30)} ${C.dim}${branch}${C.reset}`);
    } else {
      console.log(`  ${C.dim}•${C.reset} ${pad(r.name, 30)} ${C.dim}${branch}${C.reset}`);
    }
  }
  if (go) {
    await git(repo, ["worktree", "prune"]);
    console.log(`\n  reaped ${candidates.length}.\n`);
  } else {
    console.log(`\n  ${C.dim}re-run with ${C.reset}${C.bold}--go${C.reset}${C.dim} to remove them.${C.reset}\n`);
  }
}

function help() {
  console.log(`
${C.bold}🪓 lj${C.reset} — tend your git worktree fleet

  ${C.bold}lj${C.reset}                     status table of the fleet
  ${C.bold}lj branches${C.reset}            list loose branches (no worktree)
  ${C.bold}lj reap${C.reset}                preview landed + fully-clean worktrees to remove
  ${C.bold}lj reap --go${C.reset}           remove them (worktree dir + merged branch)
  ${C.bold}lj reap --untracked-ok${C.reset} also reap worktrees dirty only from untracked scratch
  ${C.bold}lj -C <path>${C.reset}           operate on another repo (default: cwd's repo)
  ${C.bold}lj help${C.reset}                this
`);
}

async function main() {
  const argv = process.argv.slice(2);
  let cwd = process.cwd();
  const ci = argv.indexOf("-C");
  if (ci >= 0 && argv[ci + 1]) { cwd = argv[ci + 1]; argv.splice(ci, 2); }
  const cmd = argv[0] ?? "status";
  const flags = new Set(argv.slice(1));

  if (cmd === "help" || cmd === "-h" || cmd === "--help") return help();
  const repo = await repoRoot(cwd);

  if (cmd === "status") return cmdStatus(repo);
  if (cmd === "branches") return cmdBranches(repo);
  if (cmd === "reap") return cmdReap(repo, flags.has("--go"), flags.has("--untracked-ok") || flags.has("--detritus"));
  console.error(`lj: unknown command '${cmd}'. Try 'lj help'.`);
  process.exit(1);
}

main().catch((e) => { console.error("lj:", e?.message ?? e); process.exit(1); });

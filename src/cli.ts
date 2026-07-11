#!/usr/bin/env node
// lj — the terminal half of Lumberjack. Same git.ts core as the extension.
//
//   lj                 status table of the worktree fleet
//   lj branches        list loose branches (no worktree)
//   lj fell            preview the deadwood (landed + clean worktrees) to fell
//   lj fell --go       fell them (remove worktree + delete merged branch)
//   lj fell --brush    also fell worktrees tangled ONLY in untracked brush (scratch)
//   lj -C <path>       operate on a different repo (default: cwd's repo)
//   lj help
//
// Lexicon: you FELL trees (worktrees) and PRUNE branches — the verb is
// disambiguated by the git noun it acts on. Deadwood = landed, clean, fellable.

import { execFile } from "child_process";
import { gatherFleet, Row } from "./git";
import { fleetJson, whoHas, attachClaims, tendPlan } from "./core";
import { readClaims, setClaim, clearClaim } from "./manifest";
import * as ops from "./ops";

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
  // reserve the WIP slot (a blank when clean) so commit squares line up
  let s = r.dirty ? C.blue + "■" + C.reset : " ";
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

async function commonDir(cwd: string): Promise<string> {
  const d = (await git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"])).trim();
  return d || `${cwd}/.git`;
}

async function cmdStatus(repo: string, json = false) {
  if (json) {
    const fleet = await gatherFleet(repo, { window: 10, maxFiles: 0, includeBranches: true });
    attachClaims(fleet.worktrees, readClaims(await commonDir(repo)));
    process.stdout.write(JSON.stringify(fleetJson(fleet, repo), null, 2) + "\n");
    return;
  }
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
    `${C.dim}lj fell  ·  lj branches${C.reset}\n`
  );
}

async function cmdTend(repo: string, json: boolean, go: boolean) {
  const fleet = await gatherFleet(repo, { window: 1, maxFiles: 0, includeBranches: false });
  const plan = tendPlan(fleet);
  if (json) { process.stdout.write(JSON.stringify(plan, null, 2) + "\n"); return; }
  console.log(`\n${C.bold}🌲 fleet tending${C.reset}\n`);
  console.log(`  ${C.green}fell${C.reset}    ${plan.fell.length} deadwood`);
  console.log(`  ${C.red}land${C.reset}    ${plan.land.length} ready`);
  console.log(`  ${C.blue}salvage${C.reset} ${plan.salvage.length} WIP for review`);
  if (plan.aging.length) console.log(`  ${C.yellow}aging${C.reset}   ${plan.aging.map((a) => `${a.name} (${a.age}d)`).join(", ")}`);
  if (plan.collisions.length) {
    console.log(`\n  ${C.red}collisions:${C.reset}`);
    for (const c of plan.collisions) console.log(`    ${c.file} ${C.dim}—${C.reset} ${c.worktrees.join(", ")}`);
  }
  if (go) {
    const tokens = await ops.fellMany(repo, plan.fell.map((f) => ({ path: f.path, branch: f.branch, name: f.name })));
    console.log(`\n  felled ${tokens.length} deadwood.\n`);
  } else if (plan.fell.length) {
    console.log(`\n  ${C.dim}lj tend --go  fells the ${plan.fell.length} deadwood (safe); land/salvage need your judgment.${C.reset}\n`);
  } else { console.log(""); }
}

async function cmdIntegrate(repo: string, go: boolean) {
  const fleet = await gatherFleet(repo, { window: 1, maxFiles: 0, includeBranches: false });
  const trees = fleet.worktrees
    .filter((w) => w.group === "needs" && w.branch && w.branch !== "(detached)")
    .map((w) => ({ path: w.path, branch: w.branch, name: w.name }));
  if (!trees.length) { console.log("\n  nothing to integrate.\n"); return; }
  if (!go) {
    console.log(`\n  ${C.bold}${trees.length}${C.reset} branch(es) to integrate (rebase onto trunk → land):`);
    for (const t of trees.slice(0, 50)) console.log(`    ${t.name}`);
    console.log(`\n  ${C.dim}lj integrate --go  rebases the clean ones and lands them; conflicts are skipped & flagged.${C.reset}\n`);
    return;
  }
  console.log(`\n  integrating ${trees.length}…\n`);
  const res = await ops.integrateMany(repo, trees);
  console.log(`  ${C.green}landed ${res.landed.length}${C.reset} · ${C.red}conflicts ${res.conflicts.length}${C.reset} · skipped ${res.skipped.length}`);
  if (res.landed.length) console.log(`\n  ${C.green}landed:${C.reset} ${res.landed.join(", ")}`);
  if (res.conflicts.length) console.log(`\n  ${C.red}need manual rebase:${C.reset}\n    ${res.conflicts.join("\n    ")}`);
  console.log("");
}

async function cmdLand(repo: string, branch: string | undefined) {
  if (!branch) { console.error("lj land <branch>"); process.exit(1); }
  const res = await ops.land(repo, branch);
  console.log(res.ok ? `  ⬆ ${res.message}` : `  ✗ ${res.message}`);
}

async function cmdCompare(repo: string, a: string | undefined, b: string | undefined) {
  if (!a || !b) { console.error("lj compare <a> <b>"); process.exit(1); }
  const res = await ops.compareStat(repo, a, b);
  console.log("\n" + (res.raw || "  (identical)") + "\n");
}

async function cmdClaim(cwd: string, note: string | undefined, clear: boolean) {
  const top = (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
  if (!top) { console.error("lj: not inside a git worktree"); process.exit(1); }
  const store = await commonDir(cwd);
  const name = top.split("/").pop() || top;
  if (clear) { clearClaim(store, top); console.log(`  cleared claim on ${name}`); return; }
  if (!note) { console.error('lj claim "<note>"   (or --clear)'); process.exit(1); }
  setClaim(store, top, note);
  console.log(`  claimed ${name}: ${note}`);
}

async function cmdClaims(repo: string, json: boolean) {
  const claims = readClaims(await commonDir(repo));
  if (json) { process.stdout.write(JSON.stringify(claims, null, 2) + "\n"); return; }
  const entries = Object.entries(claims);
  if (!entries.length) { console.log("\n  no claims.\n"); return; }
  console.log(`\n  ${C.bold}${entries.length}${C.reset} claim(s):\n`);
  for (const [p, c] of entries) console.log(`  ${pad(p.split("/").pop() || p, 30)} ${C.dim}${c.note}${C.reset}`);
  console.log("");
}

async function cmdWhoHas(repo: string, file: string, json: boolean) {
  const fleet = await gatherFleet(repo, { window: 1, maxFiles: 0, includeBranches: false });
  const hits = whoHas(fleet, file);
  if (json) { process.stdout.write(JSON.stringify(hits, null, 2) + "\n"); return; }
  if (!hits.length) { console.log(`\n  no worktree has uncommitted changes to ${file}.\n`); return; }
  console.log(`\n  ${C.bold}${hits.length}${C.reset} worktree(s) touching ${file}:\n`);
  for (const h of hits) console.log(`  ${pad(h.name, 30)} ${C.dim}${h.branch}${C.reset}`);
  console.log("");
}

async function cmdBranches(repo: string) {
  const fleet = await gatherFleet(repo, { window: 14, maxFiles: 0, includeBranches: true });
  console.log(`\n${C.bold}loose branches (no worktree): ${fleet.branches.length}${C.reset}\n`);
  for (const r of fleet.branches) console.log(`  ${pad(r.name, 44)} ${squares(r)}  ${statusTag(r)}`);
  console.log("");
}

async function cmdFell(repo: string, go: boolean, brush: boolean) {
  const fleet = await gatherFleet(repo, { window: 1, maxFiles: 0, includeBranches: false });
  const main = await mainWorktree(repo);
  const here = (await git(process.cwd(), ["rev-parse", "--show-toplevel"]).catch(() => "")).trim();

  const deadwood = fleet.worktrees.filter((r) => {
    if (r.path === main || r.path === here) return false; // never the main tree or the one we stand in
    if (r.ahead !== 0) return false;
    if (!r.dirty) return true; // fully clean, landed — standing deadwood
    if (brush) return r.wip.every((l) => l.startsWith("??")); // tangled only in untracked brush
    return false;
  });

  if (!deadwood.length) {
    console.log(`\n  no deadwood to fell (${brush ? "landed or brush-tangled" : "landed + clean"}).\n`);
    return;
  }
  console.log(`\n${go ? C.bold + "felling" + C.reset : "would fell"} ${deadwood.length} tree(s):\n`);
  for (const r of deadwood) {
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
    console.log(`\n  felled ${deadwood.length}.\n`);
  } else {
    console.log(`\n  ${C.dim}re-run with ${C.reset}${C.bold}--go${C.reset}${C.dim} to fell them.${C.reset}\n`);
  }
}

function help() {
  console.log(`
${C.bold}🪓 lj${C.reset} — tend your git worktree fleet

  ${C.bold}lj${C.reset}                  status table of the fleet
  ${C.bold}lj --json${C.reset}           the whole fleet as structured data (for agents)
  ${C.bold}lj who-has <file>${C.reset}   which worktrees have uncommitted changes to a file
  ${C.bold}lj claim "<note>"${C.reset}   claim this worktree on the shared board (--clear to release)
  ${C.bold}lj claims${C.reset}           list all worktree claims
  ${C.bold}lj branches${C.reset}         list loose branches (no worktree)
  ${C.bold}lj fell${C.reset}             preview the deadwood (landed + clean worktrees)
  ${C.bold}lj fell --go${C.reset}        fell them (remove worktree + delete merged branch)
  ${C.bold}lj fell --brush${C.reset}     also fell trees tangled only in untracked brush
  ${C.bold}lj land <branch>${C.reset}    fast-forward the trunk to a ready branch
  ${C.bold}lj integrate [--go]${C.reset} rebase ready branches onto trunk and land them (conflicts flagged)
  ${C.bold}lj compare <a> <b>${C.reset}  diffstat between two branches/worktrees
  ${C.bold}lj tend [--go]${C.reset}       propose a sweep (fell · land · salvage · aging · collisions)
  ${C.bold}lj mcp${C.reset}              run as an MCP server (stdio) — fleet tools for an IDE agent
  ${C.bold}lj -C <path>${C.reset}        operate on another repo (default: cwd's repo)
  ${C.bold}lj help${C.reset}             this

  ${C.dim}you ${C.reset}fell${C.dim} trees (worktrees), you ${C.reset}prune${C.dim} branches. deadwood = fellable.${C.reset}
`);
}

async function main() {
  const argv = process.argv.slice(2);
  let cwd = process.cwd();
  const ci = argv.indexOf("-C");
  if (ci >= 0 && argv[ci + 1]) { cwd = argv[ci + 1]; argv.splice(ci, 2); }
  const positional = argv.filter((a) => !a.startsWith("-"));
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const json = flags.has("--json");
  const cmd = positional[0] ?? "status";

  if (cmd === "help" || flags.has("--help") || argv.includes("-h")) return help();
  const repo = await repoRoot(cwd);

  if (cmd === "status") return cmdStatus(repo, json);
  if (cmd === "branches") return cmdBranches(repo);
  if (cmd === "who-has") {
    const file = positional[1];
    if (!file) { console.error("lj who-has <file>"); process.exit(1); }
    return cmdWhoHas(repo, file, json);
  }
  if (cmd === "claim") return cmdClaim(cwd, positional[1], flags.has("--clear"));
  if (cmd === "claims") return cmdClaims(repo, json);
  if (cmd === "land") return cmdLand(repo, positional[1]);
  if (cmd === "integrate") return cmdIntegrate(repo, flags.has("--go"));
  if (cmd === "compare") return cmdCompare(repo, positional[1], positional[2]);
  if (cmd === "tend") return cmdTend(repo, json, flags.has("--go"));
  if (cmd === "mcp") { const { runMcp } = await import("./mcp"); runMcp(cwd, "0.1.0"); return; }
  if (cmd === "fell") return cmdFell(repo, flags.has("--go"), flags.has("--brush") || flags.has("--untracked-ok"));
  console.error(`lj: unknown command '${cmd}'. Try 'lj help'.`);
  process.exit(1);
}

main().catch((e) => { console.error("lj:", e?.message ?? e); process.exit(1); });

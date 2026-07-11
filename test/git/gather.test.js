const test = require("node:test");
const assert = require("node:assert");
const { makeRepo, commit, wt, write, cleanup, g } = require("./helpers");
const { gatherFleet, trunkBranch } = require("../../out/git.js");

const byName = (fleet, name) => fleet.worktrees.find((r) => r.name === name);

test("trunkBranch detects master", async () => {
  const e = makeRepo("master");
  assert.equal(await trunkBranch(e.dir), "master");
  cleanup(e);
});

test("trunkBranch detects main when there's no master", async () => {
  const e = makeRepo("main");
  assert.equal(await trunkBranch(e.dir), "main");
  cleanup(e);
});

test("gatherFleet: ahead / dirty / onMaster / attention-sort", async () => {
  const e = makeRepo("master");
  // A: landed & clean (sits at trunk)
  wt(e, "A", "A");
  // B: one commit ahead of trunk
  const bPath = wt(e, "B", "B");
  commit(bPath, "b.txt", "b\n", "b work");
  // C: clean history but a dirty working tree (untracked)
  const cPath = wt(e, "C", "C");
  write(cPath, "scratch.txt", "junk\n");

  const fleet = await gatherFleet(e.dir, { maxFiles: 2 });

  // includes the main worktree ("repo") plus A, B, C
  assert.equal(fleet.worktrees.length, 4);

  assert.equal(byName(fleet, "A").ahead, 0);
  assert.equal(byName(fleet, "A").dirty, false);
  assert.equal(byName(fleet, "B").ahead, 1);
  assert.equal(byName(fleet, "B").commits[0].onMaster, false); // B's tip is off-trunk
  assert.equal(byName(fleet, "C").ahead, 0);
  assert.equal(byName(fleet, "C").dirty, true);

  // attention-first: B (ahead) and C (dirty) sort ahead of the clean A & main
  const idx = (n) => fleet.worktrees.findIndex((r) => r.name === n);
  assert.ok(idx("B") < idx("A"), "ahead sorts before clean");
  assert.ok(idx("C") < idx("A"), "dirty sorts before clean");
  cleanup(e);
});

test("gatherFleet: onMaster true for landed history", async () => {
  const e = makeRepo("master");
  const p = wt(e, "A", "A"); // A == trunk, so its commits are all on trunk
  const fleet = await gatherFleet(e.dir, { maxFiles: 0 });
  assert.ok(byName(fleet, "A").commits.every((c) => c.onMaster));
  cleanup(e);
});

test("gatherFleet: lean mode skips files and branches", async () => {
  const e = makeRepo("master");
  const p = wt(e, "A", "A");
  commit(p, "x.txt", "x\n", "x");
  g(e.dir, "branch", "loose-1"); // a branch with no worktree
  const lean = await gatherFleet(e.dir, { maxFiles: 0, includeBranches: false });
  assert.equal(lean.branches.length, 0, "includeBranches:false → no branch scan");
  assert.ok(lean.worktrees.every((r) => r.commits.every((c) => c.files.length === 0)), "maxFiles:0 → no file lists");
  cleanup(e);
});

test("gatherFleet: loose branches surface; trunk & checked-out excluded", async () => {
  const e = makeRepo("master");
  wt(e, "A", "feature-A"); // checked out → not loose
  g(e.dir, "branch", "salvage"); // loose
  g(e.dir, "branch", "backup/old"); // loose
  const fleet = await gatherFleet(e.dir);
  const names = fleet.branches.map((b) => b.name).sort();
  assert.deepEqual(names, ["backup/old", "salvage"]);
  assert.ok(!names.includes("master"), "trunk excluded");
  assert.ok(!names.includes("feature-A"), "checked-out branch excluded");
  cleanup(e);
});

test("gatherFleet: works on a main-trunk repo (not just master)", async () => {
  const e = makeRepo("main");
  const p = wt(e, "A", "A");
  const fleet = await gatherFleet(e.dir);
  assert.ok(byName(fleet, "A").commits.every((c) => c.onMaster), "colored against main");
  cleanup(e);
});

test("gatherWorktrees throws on an unreadable path (not a silent empty fleet)", async () => {
  await assert.rejects(() => require("../../out/git.js").gatherWorktrees("/nope/not-a-repo-" + Date.now(), {}),
    "an unreadable repo must error, not report 'the stand is clear'");
});

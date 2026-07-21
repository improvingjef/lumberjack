// Integration — the batch operations the fleet UI triggers, against real repos.
const test = require("node:test");
const assert = require("node:assert");
const { makeRepo, commit, wt, write, cleanup, g } = require("./helpers");
const ops = require("../../out/ops.js");

const hasWt = (dir, p) => g(dir, "worktree", "list", "--porcelain").includes("worktree " + p);
const hasBranch = (dir, b) => g(dir, "branch", "--list", b).trim() !== "";

test("fellMany fells the safe trees, skips the unsafe one, unfellMany restores all", async () => {
  const e = makeRepo("master");
  const a = wt(e, "a", "a"); // deadwood — clean, landed
  const b = wt(e, "b", "b"); commit(b, "x.txt", "x\n", "ahead"); // unsafe: 1 commit ahead
  const c = wt(e, "c", "c"); // deadwood
  const trees = [
    { path: a, branch: "a", name: "a" },
    { path: b, branch: "b", name: "b" },
    { path: c, branch: "c", name: "c" },
  ];
  const tokens = await ops.fellMany(e.dir, trees);
  assert.equal(tokens.length, 2, "felled the 2 safe trees only");
  assert.equal(hasWt(e.dir, a), false);
  assert.equal(hasWt(e.dir, c), false);
  assert.equal(hasWt(e.dir, b), true, "the ahead tree is left standing");
  assert.equal(hasBranch(e.dir, "b"), true, "and keeps its branch");

  await ops.unfellMany(e.dir, tokens);
  assert.equal(hasWt(e.dir, a), true, "restored a");
  assert.equal(hasWt(e.dir, c), true, "restored c");
  assert.equal(hasBranch(e.dir, "a"), true);
  cleanup(e);
});

test("salvageMany parks every tree's WIP onto one shared branch as history", async () => {
  const e = makeRepo("master");
  const a = wt(e, "a", "a"); write(a, "README.md", "from-a\n");
  const b = wt(e, "b", "b"); write(b, "README.md", "from-b\n");
  const r = await ops.salvageMany(e.dir, [
    { path: a, branch: "a", name: "a" },
    { path: b, branch: "b", name: "b" },
  ], "salvage");
  assert.equal(r.count, 2, "both salvaged");
  // both edited README.md differently → the second merge collides and says so
  assert.deepEqual(r.conflicts, ["b: README.md"], "the collision is reported, attributed to b");
  assert.ok(hasBranch(e.dir, "salvage"), "onto the one shared branch");
  // root + 2 appended commits, chained (not clobbered)
  assert.equal(g(e.dir, "rev-list", "--count", "salvage"), "3");
  cleanup(e);
});

test("fellMany respects a configured trunk (won't fell work ahead of it)", async () => {
  const e = makeRepo("develop"); // trunk is develop; no master/main
  const p = wt(e, "feat", "feat");
  commit(p, "x.txt", "x\n", "ahead of develop");
  const tokens = await ops.fellMany(e.dir, [{ path: p, branch: "feat", name: "feat" }], "develop");
  assert.equal(tokens.length, 0, "not felled — it is 1 ahead of the configured trunk");
  cleanup(e);
});

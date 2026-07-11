// Integration — compare two worktrees/branches (for judging rival solutions).
const test = require("node:test");
const assert = require("node:assert");
const { makeRepo, commit, wt, cleanup } = require("./helpers");
const ops = require("../../out/ops.js");

test("compareStat sees changes unique to EITHER side (not a merge-base range)", async () => {
  const e = makeRepo("master");
  const a = wt(e, "a", "a"); commit(a, "only-a.txt", "a\n", "a adds a file");
  const b = wt(e, "b", "b"); commit(b, "only-b.txt", "b\n", "b adds a different file");
  const res = await ops.compareStat(e.dir, "a", "b");
  assert.ok(res.raw.includes("only-a.txt"), "must show a's unique file");
  assert.ok(res.raw.includes("only-b.txt"), "must show b's unique file");
  assert.ok(res.files >= 2);
  cleanup(e);
});

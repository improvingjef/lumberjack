// Integration — compare two worktrees/branches (for judging rival solutions).
const test = require("node:test");
const assert = require("node:assert");
const { makeRepo, commit, wt, cleanup } = require("./helpers");
const ops = require("../../out/ops.js");

test("compareStat: files/insertions between two branches", async () => {
  const e = makeRepo("master");
  const a = wt(e, "a", "a"); commit(a, "shared.txt", "from-a\n", "a work");
  const b = wt(e, "b", "b"); commit(b, "shared.txt", "from-b\n", "b work"); commit(b, "extra.txt", "x\n", "b extra");
  const res = await ops.compareStat(e.dir, "a", "b");
  assert.ok(res.files >= 2, "sees the differing files");
  assert.ok(res.raw.includes("extra.txt"), "names a file only b has");
  cleanup(e);
});

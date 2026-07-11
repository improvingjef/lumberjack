// Integration — land: ff-merge a clean-ahead branch into the trunk.
const test = require("node:test");
const assert = require("node:assert");
const { makeRepo, commit, wt, cleanup, g } = require("./helpers");
const ops = require("../../out/ops.js");

test("land fast-forwards the trunk to a clean-ahead branch", async () => {
  const e = makeRepo("master");
  const p = wt(e, "feat", "feat");
  const sha = commit(p, "x.txt", "x\n", "feature work");
  const res = await ops.land(e.dir, "feat");
  assert.ok(res.ok, res.message);
  assert.equal(g(e.dir, "rev-parse", "master"), sha, "master fast-forwarded to the feature tip");
  cleanup(e);
});

test("land refuses a diverged branch (--ff-only)", async () => {
  const e = makeRepo("master");
  const p = wt(e, "feat", "feat");
  commit(p, "x.txt", "x\n", "feature");
  const before = g(e.dir, "rev-parse", "master");
  commit(e.dir, "y.txt", "y\n", "trunk moves on"); // master diverges from feat
  const res = await ops.land(e.dir, "feat");
  assert.equal(res.ok, false, "refused, not force-merged");
  assert.notEqual(g(e.dir, "rev-parse", "master"), before, "master still has its own commit, unchanged by land");
  cleanup(e);
});

test("landMany lands the ff-able, skips the rest", async () => {
  const e = makeRepo("master");
  const a = wt(e, "a", "a"); commit(a, "a.txt", "a\n", "a");     // ff-able
  const b = wt(e, "b", "b"); commit(b, "b.txt", "b\n", "b");     // will be behind after a lands? no — independent
  const res = await ops.landMany(e.dir, ["a", "b"]);
  // a lands (ff). b then can't ff (master moved to a's tip, b diverged) → skipped.
  assert.ok(res.landed.includes("a"));
  assert.ok(res.skipped.includes("b"));
  cleanup(e);
});

test("land reports dirty-main distinctly from diverged", async () => {
  const e = makeRepo("master");
  const p = wt(e, "feat", "feat");
  commit(p, "shared.txt", "feat\n", "feat adds shared.txt"); // feat is ff-able of master
  const { writeFileSync } = require("fs");
  writeFileSync(require("path").join(e.dir, "shared.txt"), "would-be-overwritten\n"); // main dirties the same path
  const res = await ops.land(e.dir, "feat");
  assert.equal(res.ok, false);
  assert.equal(res.reason, "dirty-tree", "ff-able but blocked by a dirty main tree — NOT 'diverged'");
  cleanup(e);
});

test("land marks a genuinely diverged branch as diverged", async () => {
  const e = makeRepo("master");
  const p = wt(e, "feat", "feat");
  commit(p, "x.txt", "x\n", "feat");
  commit(e.dir, "y.txt", "y\n", "trunk moves"); // master diverges
  const res = await ops.land(e.dir, "feat");
  assert.equal(res.reason, "diverged");
  cleanup(e);
});

// Integration — integrate: rebase a diverged branch onto trunk, then land it.
const test = require("node:test");
const assert = require("node:assert");
const { makeRepo, commit, wt, cleanup, g } = require("./helpers");
const ops = require("../../out/ops.js");

test("integrateOne rebases a cleanly-diverged branch and lands it", async () => {
  const e = makeRepo("master");
  const p = wt(e, "feat", "feat");
  commit(p, "feat.txt", "f\n", "feature");         // feat ahead
  commit(e.dir, "main.txt", "m\n", "trunk moves");  // master diverges on a DIFFERENT file → clean rebase
  const before = g(e.dir, "rev-parse", "master");
  const r = await ops.integrateOne(e.dir, p, "feat", "master");
  assert.equal(r.status, "landed", r.message);
  assert.notEqual(g(e.dir, "rev-parse", "master"), before, "master advanced");
  assert.equal(g(e.dir, "show", "master:feat.txt").trim(), "f", "feature's commit is now on master");
  cleanup(e);
});

test("integrateOne aborts on a rebase conflict, leaving trunk untouched", async () => {
  const e = makeRepo("master");
  const p = wt(e, "feat", "feat");
  commit(p, "README.md", "feat-version\n", "feat edits README");     // same file...
  commit(e.dir, "README.md", "trunk-version\n", "trunk edits README"); // ...as trunk → conflict
  const before = g(e.dir, "rev-parse", "master");
  const r = await ops.integrateOne(e.dir, p, "feat", "master");
  assert.equal(r.status, "conflict");
  assert.equal(g(e.dir, "rev-parse", "master"), before, "master untouched");
  assert.equal(g(p, "status", "--porcelain"), "", "worktree not left mid-rebase");
  cleanup(e);
});

test("integrateMany reports landed vs conflicts", async () => {
  const e = makeRepo("master");
  const a = wt(e, "a", "a"); commit(a, "a.txt", "a\n", "a");
  const b = wt(e, "b", "b"); commit(b, "README.md", "b\n", "b conflicts");
  commit(e.dir, "README.md", "trunk\n", "trunk"); // b will conflict; a is clean
  const res = await ops.integrateMany(e.dir, [
    { path: a, branch: "a", name: "a" },
    { path: b, branch: "b", name: "b" },
  ]);
  assert.ok(res.landed.includes("a"));
  assert.ok(res.conflicts.includes("b"));
  cleanup(e);
});

test("integrateMany: landing one branch can flip another to conflict (the shuffle)", async () => {
  const e = makeRepo("master");
  const a = wt(e, "a", "a"); commit(a, "shared.txt", "a-version\n", "a edits shared");
  const b = wt(e, "b", "b"); commit(b, "shared.txt", "b-version\n", "b edits shared");
  commit(e.dir, "z.txt", "z\n", "trunk moves"); // a and b both diverge
  const res = await ops.integrateMany(e.dir, [
    { path: a, branch: "a", name: "a" },
    { path: b, branch: "b", name: "b" },
  ]);
  assert.ok(res.landed.includes("a"), "a rebases clean and lands");
  assert.ok(res.conflicts.includes("b"), "b flips to conflict once a's shared.txt is on master");
  cleanup(e);
});

const test = require("node:test");
const assert = require("node:assert");
const { makeRepo, commit, wt, wtDetached, write, cleanup, g } = require("./helpers");
const ops = require("../../out/ops.js");

const hasWorktree = (dir, p) => g(dir, "worktree", "list", "--porcelain").includes("worktree " + p);
const hasBranch = (dir, b) => g(dir, "branch", "--list", b).trim() !== "";

test("assess: clean landed tree is safe", async () => {
  const e = makeRepo("master");
  const p = wt(e, "A", "A");
  const a = await ops.assess(e.dir, p);
  assert.equal(a.ahead, 0);
  assert.equal(a.trackedWip, false);
  assert.equal(a.safe, true);
  cleanup(e);
});

test("assess: untracked-only stays safe; tracked WIP is unsafe", async () => {
  const e = makeRepo("master");
  const p = wt(e, "A", "A");
  write(p, "scratch.txt", "junk\n"); // untracked brush
  let a = await ops.assess(e.dir, p);
  assert.equal(a.trackedWip, false);
  assert.equal(a.safe, true, "untracked scratch is still fearless");

  write(p, "README.md", "changed\n"); // modify a tracked file
  a = await ops.assess(e.dir, p);
  assert.equal(a.trackedWip, true);
  assert.equal(a.safe, false);
  cleanup(e);
});

test("assess: commits ahead of trunk are unsafe", async () => {
  const e = makeRepo("master");
  const p = wt(e, "A", "A");
  commit(p, "a.txt", "a\n", "ahead");
  const a = await ops.assess(e.dir, p);
  assert.equal(a.ahead, 1);
  assert.equal(a.safe, false);
  cleanup(e);
});

test("fell + unfell round-trip restores tree, branch, and content", async () => {
  const e = makeRepo("master");
  const p = wt(e, "A", "feature");
  const sha = commit(p, "keep.txt", "precious\n", "work"); // 1 ahead, but we capture it

  const token = await ops.fell(e.dir, p, "feature");
  assert.equal(hasWorktree(e.dir, p), false, "worktree removed");
  assert.equal(hasBranch(e.dir, "feature"), false, "branch deleted");
  assert.equal(token.sha, sha);

  await ops.unfell(e.dir, token);
  assert.equal(hasWorktree(e.dir, p), true, "worktree restored");
  assert.equal(hasBranch(e.dir, "feature"), true, "branch restored");
  assert.equal(g(p, "rev-parse", "HEAD"), sha, "restored at the captured sha");
  assert.equal(g(p, "show", "HEAD:keep.txt"), "precious", "committed content restored");
  cleanup(e);
});

test("fell + unfell of a detached worktree", async () => {
  const e = makeRepo("master");
  const sha = g(e.dir, "rev-parse", "HEAD");
  const p = wtDetached(e, "D", sha);
  const token = await ops.fell(e.dir, p, null);
  assert.equal(token.branch, null);
  assert.equal(hasWorktree(e.dir, p), false);
  await ops.unfell(e.dir, token);
  assert.equal(hasWorktree(e.dir, p), true);
  assert.equal(g(p, "rev-parse", "HEAD"), sha);
  cleanup(e);
});

test("salvage snapshots tracked + untracked WIP onto a preserve branch, tree untouched", async () => {
  const e = makeRepo("master");
  const p = wt(e, "A", "A");
  write(p, "README.md", "modified\n"); // tracked change
  write(p, "new.txt", "brand new\n"); // untracked file

  const commitSha = await ops.salvage(e.dir, p, "salvage", "salvage: preserve A");
  assert.ok(hasBranch(e.dir, "salvage"), "preserve branch created");
  assert.equal(g(e.dir, "rev-parse", "salvage"), commitSha);

  // both the modified tracked file and the untracked file are captured
  assert.equal(g(e.dir, "show", "salvage:README.md"), "modified");
  assert.equal(g(e.dir, "show", "salvage:new.txt"), "brand new");

  // the worktree itself is NOT touched — still dirty with the same WIP
  assert.ok(g(p, "status", "--porcelain").includes("new.txt"), "worktree left dirty");
  cleanup(e);
});

test("salvage appends to an existing preserve branch (history, not clobber)", async () => {
  const e = makeRepo("master");
  const p = wt(e, "A", "A");
  write(p, "one.txt", "1\n");
  const c1 = await ops.salvage(e.dir, p, "salvage", "first");
  write(p, "two.txt", "2\n");
  const c2 = await ops.salvage(e.dir, p, "salvage", "second");

  assert.notEqual(c1, c2);
  assert.equal(g(e.dir, "rev-parse", "salvage"), c2, "branch advanced to the second");
  assert.equal(g(e.dir, "rev-parse", "salvage~1"), c1, "first is the parent — history preserved");
  cleanup(e);
});

test("assess fails CLOSED when a safety probe fails (e.g. trunk ref missing)", async () => {
  const e = makeRepo("master");
  const p = wt(e, "feat", "feat");
  commit(p, "x.txt", "x\n", "real work");
  const a = await ops.assess(e.dir, p, "nonexistent-trunk"); // rev-list against a bad ref throws
  assert.equal(a.safe, false, "an unresolvable trunk must NOT read as safe-to-fell");
  cleanup(e);
});

test("unfell reuses an existing branch when fell couldn't delete it (loud, not lost)", async () => {
  const e = makeRepo("master");
  const p = wt(e, "feat", "feat");
  const sha = commit(p, "k.txt", "k\n", "work");
  const token = await ops.fell(e.dir, p, "feat");
  g(e.dir, "branch", "feat", sha); // something recreated the branch after fell
  await ops.unfell(e.dir, token); // must NOT throw; reuse the existing branch
  assert.ok(g(e.dir, "worktree", "list", "--porcelain").includes("worktree " + p), "worktree restored");
  cleanup(e);
});

test("unfellMany reports failures instead of silently dropping them", async () => {
  const e = makeRepo("master");
  const p = wt(e, "feat", "feat");
  const token = await ops.fell(e.dir, p, "feat");
  require("fs").mkdirSync(p); // occupy the path with a non-empty dir so `worktree add` refuses
  require("fs").writeFileSync(require("path").join(p, "blocker"), "x");
  const res = await ops.unfellMany(e.dir, [token]);
  assert.equal(res.restored.length, 0);
  assert.equal(res.failed.length, 1, "the collision is surfaced, not swallowed");
  cleanup(e);
});

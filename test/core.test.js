// Fast unit base — pure domain logic, no git/DOM/vscode. Microseconds.
const test = require("node:test");
const assert = require("node:assert");
const core = require("../out/core.js");

test("classify: needs / wip / dead partition", () => {
  assert.equal(core.classify({ ahead: 2, dirty: false }), "needs", "unmerged commits → needs");
  assert.equal(core.classify({ ahead: 2, dirty: true }), "needs", "commits win over dirty");
  assert.equal(core.classify({ ahead: 0, dirty: true }), "wip", "only uncommitted → wip");
  assert.equal(core.classify({ ahead: 0, dirty: false }), "dead", "landed & clean → dead");
});

test("isAmber: dirty and stale past the threshold", () => {
  assert.equal(core.isAmber({ dirty: true, age: 6 }), true);
  assert.equal(core.isAmber({ dirty: true, age: 4 }), false, "fresh WIP is not aging");
  assert.equal(core.isAmber({ dirty: false, age: 99 }), false, "clean is never aging");
  assert.equal(core.isAmber({ dirty: true, age: 5 }), true, "boundary is inclusive");
  assert.equal(core.isAmber({ dirty: true, age: 2 }, 2), true, "threshold is configurable");
});

test("assessSafety: safe only when nothing is lost", () => {
  assert.deepEqual(core.assessSafety(0, []), { trackedWip: false, safe: true }, "landed & clean");
  assert.deepEqual(core.assessSafety(0, ["?? scratch"]), { trackedWip: false, safe: true }, "untracked brush is safe");
  assert.deepEqual(core.assessSafety(0, [" M a.ts"]), { trackedWip: true, safe: false }, "tracked WIP is unsafe");
  assert.deepEqual(core.assessSafety(3, []), { trackedWip: false, safe: false }, "unmerged commits are unsafe");
  assert.deepEqual(core.assessSafety(0, ["?? a", "M  b"]), { trackedWip: true, safe: false }, "any tracked line is unsafe");
});

test("parsePorcelain: dirty and tracked-WIP facts", () => {
  assert.deepEqual(core.parsePorcelain(""), { lines: [], dirty: false, trackedWip: false });
  const p = core.parsePorcelain("?? a\n?? b\n");
  assert.deepEqual([p.dirty, p.trackedWip, p.lines.length], [true, false, 2], "untracked-only");
  const q = core.parsePorcelain(" M x\n?? y\n");
  assert.deepEqual([q.dirty, q.trackedWip], [true, true]);
});

test("parseWorktreeList: worktrees, branches, detached", () => {
  const out = [
    "worktree /repo", "HEAD abc", "branch refs/heads/main", "",
    "worktree /repo/wt/a", "HEAD def", "branch refs/heads/feature-a", "",
    "worktree /repo/wt/d", "HEAD 123", "detached", "",
  ].join("\n");
  assert.deepEqual(core.parseWorktreeList(out), [
    { path: "/repo", branch: "main" },
    { path: "/repo/wt/a", branch: "feature-a" },
    { path: "/repo/wt/d", branch: "(detached)" },
  ]);
});

test("worktreeName / parseCount helpers", () => {
  assert.equal(core.worktreeName("/a/b/my-tree/"), "my-tree");
  assert.equal(core.worktreeName("/a/b/my-tree"), "my-tree");
  assert.equal(core.parseCount("  7\n"), 7);
  assert.equal(core.parseCount(""), 0);
  assert.equal(core.parseCount("fatal: bad"), 0);
});

test("attentionSort: dirty/ahead first, then ahead desc, then name", () => {
  const rows = [
    { name: "clean-b", dirty: false, ahead: 0 },
    { name: "ahead-1", dirty: false, ahead: 1 },
    { name: "clean-a", dirty: false, ahead: 0 },
    { name: "ahead-5", dirty: false, ahead: 5 },
    { name: "dirty-0", dirty: true, ahead: 0 },
  ];
  const order = [...rows].sort(core.attentionSort).map((r) => r.name);
  assert.deepEqual(order, ["ahead-5", "ahead-1", "dirty-0", "clean-a", "clean-b"]);
});

test("branchSort: most-ahead first then name", () => {
  const b = [{ name: "z", ahead: 1 }, { name: "a", ahead: 3 }, { name: "m", ahead: 1 }];
  assert.deepEqual([...b].sort(core.branchSort).map((x) => x.name), ["a", "m", "z"]);
});

test("summarize: rolls a fleet into the summary line counts", () => {
  const wts = [
    { ahead: 2, dirty: false, age: 0 }, // needs
    { ahead: 1, dirty: true, age: 0 },  // needs
    { ahead: 0, dirty: true, age: 9 },  // wip + aging
    { ahead: 0, dirty: true, age: 1 },  // wip
    { ahead: 0, dirty: false, age: 0 }, // dead
  ];
  assert.deepEqual(core.summarize(wts, 128), {
    total: 5, needs: 2, wip: 2, dead: 1, understory: 128, aging: 1,
  });
});

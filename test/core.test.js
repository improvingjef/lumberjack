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

test("wipPaths: file paths out of porcelain lines (incl renames)", () => {
  assert.deepEqual(core.wipPaths([" M src/a.ts", "?? b.txt", "R  old.ts -> new.ts"]), ["src/a.ts", "b.txt", "new.ts"]);
  assert.deepEqual(core.wipPaths([]), []);
});

test("whoHas: worktrees dirtying a file (exact or path-suffix)", () => {
  const fleet = { worktrees: [
    { name: "a", path: "/wt/a", branch: "a", wip: [" M bootstrap/src/Pipeline.hs"] },
    { name: "b", path: "/wt/b", branch: "b", wip: [" M other.ts"] },
    { name: "c", path: "/wt/c", branch: "c", wip: ["?? Pipeline.hs"] },
  ], branches: [] };
  assert.deepEqual(core.whoHas(fleet, "Pipeline.hs").map((x) => x.name).sort(), ["a", "c"]);
  assert.deepEqual(core.whoHas(fleet, "nope.ts"), []);
});

test("fleetJson: stable agent-facing schema", () => {
  const fleet = {
    worktrees: [{
      kind: "worktree", name: "a", branch: "a", path: "/wt/a", group: "wip", ahead: 0,
      dirty: true, trackedWip: true, amber: false, age: 1.23, wip: [" M x.ts"], overflow: 0,
      commits: [{ sha: "abc123def0", short: "abc123def", subj: "work", onMaster: false, date: 0, files: [], filesOverflow: 0 }],
    }],
    branches: [{ name: "salvage", branch: "salvage", ahead: 3, age: 9, wip: [], commits: [], overflow: 0, dirty: false, amber: false }],
  };
  const j = core.fleetJson(fleet, "/repo");
  assert.equal(j.repo, "/repo");
  assert.deepEqual(j.summary, { total: 1, needs: 0, wip: 1, dead: 0, understory: 1, aging: 0 });
  assert.equal(j.worktrees[0].name, "a");
  assert.deepEqual(j.worktrees[0].wip, ["x.ts"], "wip is file paths, not porcelain");
  assert.equal(j.worktrees[0].commits[0].sha, "abc123def");
  assert.equal(j.branches[0].name, "salvage");
});

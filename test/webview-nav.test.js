// Navigation regression tests — the webview rendered in jsdom, driven by the
// same messages the host posts. Guards the sidebar→panel handoff: clicking a
// worktree must land on THAT worktree's view, not another fleet list.
const test = require("node:test");
const assert = require("node:assert");
const { JSDOM } = require("jsdom");
const { fleetHtml } = require("../out/webview.js");

function mount(compact) {
  const posted = [];
  const dom = new JSDOM(fleetHtml(compact), {
    runScripts: "dangerously",
    beforeParse(w) {
      w.acquireVsCodeApi = () => ({ postMessage: (m) => posted.push(m) });
      if (!w.CSS) w.CSS = { escape: (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => "\\" + c) };
    },
  });
  const w = dom.window;
  return { w, doc: w.document, posted, post: (m) => w.dispatchEvent(new w.MessageEvent("message", { data: m })) };
}

const wt = (name, path, ahead) => ({
  kind: "worktree", name, branch: name, path, ahead, overflow: 0,
  dirty: false, trackedWip: false, wip: [], age: 0,
  commits: [{ sha: name + "1", short: name + "1", subj: name + " work", onMaster: false, date: 0, files: [], filesOverflow: 0 }],
});
const FLEET = { worktrees: [wt("alpha", "/wt/alpha", 1), wt("beta", "/wt/beta", 2)], branches: [] };

test("panel: a 'select' focuses THAT worktree's view (mid column opens on it)", () => {
  const { doc, post } = mount(false);
  post({ type: "data", fleet: FLEET });
  post({ type: "select", path: "/wt/beta" });
  const mid = doc.getElementById("mid");
  assert.ok(mid.classList.contains("open"), "the worktree view opened");
  assert.match(doc.getElementById("midpad").innerHTML, /beta/, "it's beta's view, not a fleet list");
});

test("panel: a data message carrying `select` auto-focuses that worktree", () => {
  const { doc, post } = mount(false);
  post({ type: "worktrees", worktrees: FLEET.worktrees, select: "/wt/alpha" });
  assert.ok(doc.getElementById("mid").classList.contains("open"));
  assert.match(doc.getElementById("midpad").innerHTML, /alpha/);
});

test("sidebar: clicking a worktree hands off its path so the panel can focus it", () => {
  const { doc, posted, post } = mount(true);
  post({ type: "data", fleet: FLEET });
  const row = doc.querySelector(".row");
  assert.ok(row, "a worktree row rendered");
  row.click();
  const openFull = posted.find((m) => m.type === "openFull");
  assert.ok(openFull, "sidebar posts openFull");
  assert.ok(openFull.path, "openFull carries the worktree path (not just a name)");
});

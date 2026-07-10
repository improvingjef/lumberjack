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

test("panel: selecting a worktree in a collapsed section reveals AND focuses it", () => {
  const { doc, post } = mount(false);
  const gamma = wt("gamma", "/wt/gamma", 0); // ahead 0, clean → deadwood (collapsed by default)
  post({ type: "data", fleet: { worktrees: [wt("alpha", "/wt/alpha", 1), gamma], branches: [] } });
  post({ type: "select", path: "/wt/gamma" });
  assert.ok(doc.getElementById("mid").classList.contains("open"), "the worktree view opened");
  assert.match(doc.getElementById("midpad").innerHTML, /gamma/, "on gamma");
  assert.match(doc.getElementById("left").innerHTML, /gamma/, "its collapsed section expanded so the row is visible");
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

test("deadwood header exposes a fell-all axe that posts fellGroup", () => {
  const { doc, posted, post } = mount(false);
  post({ type: "data", fleet: { worktrees: [wt("g1", "/wt/g1", 0), wt("g2", "/wt/g2", 0)], branches: [] } });
  const hdr = [...doc.querySelectorAll(".shdr")].find((h) => /deadwood/i.test(h.textContent));
  assert.ok(hdr, "deadwood section present");
  const axe = hdr.querySelector(".hdraxe");
  assert.ok(axe, "fell-all axe in the deadwood header");
  axe.click();
  const fg = posted.find((m) => m.type === "fellGroup");
  assert.ok(fg && fg.trees.length === 2, "posts fellGroup with both deadwood trees");
});

test("ahead==0 + dirty worktrees group under 'uncommitted wip' with salvage-all", () => {
  const { doc, posted, post } = mount(false);
  const w = wt("d1", "/wt/d1", 0); w.dirty = true; w.wip = [" M a.txt"];
  post({ type: "data", fleet: { worktrees: [w], branches: [] } });
  const hdr = [...doc.querySelectorAll(".shdr")].find((h) => /uncommitted/i.test(h.textContent));
  assert.ok(hdr, "uncommitted-wip section present");
  const salv = hdr.querySelector(".hdraxe");
  assert.ok(salv, "salvage-all action in the header");
  salv.click();
  assert.ok(posted.find((m) => m.type === "salvageGroup"), "posts salvageGroup");
});

test("a wip row offers a standalone salvage action (not only fell)", () => {
  const { doc, posted, post } = mount(false);
  const w = wt("d1", "/wt/d1", 0); w.dirty = true; w.wip = [" M a.txt"];
  post({ type: "data", fleet: { worktrees: [w], branches: [] } });
  const act = doc.querySelector('.act[data-a="salvage"]');
  assert.ok(act, "salvage action present on the dirty row");
  act.click();
  const s = posted.find((m) => m.type === "salvage");
  assert.ok(s && s.path === "/wt/d1", "posts a standalone salvage for that worktree");
});

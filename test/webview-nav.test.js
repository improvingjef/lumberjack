// Navigation regression tests — the webview rendered in jsdom, driven by the
// same messages the host posts. Guards the sidebar→panel handoff: clicking a
// worktree must land on THAT worktree's view, not another fleet list.
const test = require("node:test");
const assert = require("node:assert");
const { JSDOM } = require("jsdom");
const { fleetHtml } = require("../out/webview.js");
const core = require("../out/core.js");

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

// build a row the way the host does — group/amber stamped by core, so the
// tests exercise the real classification, not a hand-set field
const wt = (name, path, ahead, dirty = false) => {
  const r = {
    kind: "worktree", name, branch: name, path, ahead, overflow: 0,
    dirty, trackedWip: dirty, wip: dirty ? [" M " + name + ".txt"] : [], age: 0,
    commits: [{ sha: name + "1", short: name + "1", subj: name + " work", onMaster: false, date: 0, files: [], filesOverflow: 0 }],
  };
  r.group = core.classify(r);
  r.amber = core.isAmber(r);
  return r;
};
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
  const w = wt("d1", "/wt/d1", 0, true);
  post({ type: "data", fleet: { worktrees: [w], branches: [] } });
  const hdr = [...doc.querySelectorAll(".shdr")].find((h) => /uncommitted/i.test(h.textContent));
  assert.ok(hdr, "uncommitted-wip section present");
  const salv = hdr.querySelector(".hdraxe");
  assert.ok(salv, "salvage-all action in the header");
  salv.click();
  assert.ok(posted.find((m) => m.type === "salvageGroup"), "posts salvageGroup");
});

test("host-driven select enters FOCUS: fleet column hidden, ‹ fleet returns", () => {
  const { w, doc, post } = mount(false);
  post({ type: "data", fleet: FLEET });
  post({ type: "select", path: "/wt/beta" });
  assert.ok("focused" in doc.body.dataset, "focused mode on — no second fleet list");
  const back = doc.getElementById("back");
  assert.equal(back.hidden, false, "‹ fleet affordance visible");
  doc.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape" }));
  assert.ok(!("focused" in doc.body.dataset), "Escape steps back to the fleet");
  assert.ok(doc.getElementById("mid").classList.contains("open"), "worktree view still open behind it");
});

test("clicking a row in the fleet list does NOT enter focus", () => {
  const { doc, post } = mount(false);
  post({ type: "data", fleet: FLEET });
  doc.querySelector(".row").click();
  assert.ok(!("focused" in doc.body.dataset), "in-panel selection keeps the fleet visible");
});

test("WIP rides the tree view as ONE pseudo-commit; its files open as source in the files view", () => {
  const { doc, posted, post } = mount(false);
  post({ type: "data", fleet: { worktrees: [wt("d1", "/wt/d1", 0, true)], branches: [] } });
  post({ type: "select", path: "/wt/d1" });
  assert.equal(doc.querySelectorAll("#midpad .file").length, 0, "no inline wip file list");
  const wipRow = doc.querySelector("#midpad .cmt[data-wip-row]");
  assert.ok(wipRow, "wip appears as a commit-like row");
  assert.match(wipRow.textContent, /1 uncommitted/);
  const first = [...doc.querySelectorAll("#midpad .cmt")][0];
  assert.equal(first, wipRow, "the wip row leads the history");
  wipRow.click();
  assert.match(doc.getElementById("rightlabel").textContent, /files · wip/);
  const f = doc.querySelector("#rightpad .file[data-wip]");
  assert.ok(f, "wip files listed in the files view");
  f.click();
  const m = posted.find((x) => x.type === "openSource");
  assert.ok(m && m.cwd === "/wt/d1", "a wip file opens as source");
  assert.ok(!posted.find((x) => x.type === "diffWip"), "never as a diff");
});

test("cmd-click and shift-click multi-select rows; shift+arrows grow and shrink the range", () => {
  const { w, doc, post } = mount(false);
  const rows = [wt("a", "/wt/a", 1), wt("b", "/wt/b", 1), wt("c", "/wt/c", 1), wt("d", "/wt/d", 1)];
  post({ type: "data", fleet: { worktrees: rows, branches: [] } });
  const els = [...doc.querySelectorAll("#left .row")];
  const n = () => doc.getElementById("batchn").textContent;
  els[0].dispatchEvent(new w.MouseEvent("click", { metaKey: true, bubbles: true }));
  assert.match(n(), /1 selected/, "cmd-click ticks without opening");
  assert.equal(doc.getElementById("mid").classList.contains("open"), false, "no tree view opened");
  els[2].dispatchEvent(new w.MouseEvent("click", { shiftKey: true, bubbles: true }));
  assert.match(n(), /3 selected/, "shift-click ranges from the anchor");
  doc.dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowDown", shiftKey: true }));
  assert.match(n(), /4 selected/, "shift+down grows the range");
  doc.dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowUp", shiftKey: true }));
  doc.dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowUp", shiftKey: true }));
  assert.match(n(), /2 selected/, "shift+up contracts it");
  const ticked = els.map((el) => el.classList.contains("ticked"));
  assert.deepEqual(ticked, [true, true, false, false], "ticked rows wear the highlight, contracted ones dropped it");
});

test("focusing a worktree retitles the panel; leaving focus restores it", () => {
  const { w, doc, posted, post } = mount(false);
  post({ type: "data", fleet: FLEET });
  post({ type: "select", path: "/wt/beta" });
  assert.ok(posted.find((m) => m.type === "title" && m.name === "beta"), "panel asked to wear the worktree name");
  doc.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape" }));
  assert.ok(posted.find((m) => m.type === "title" && m.name === null), "back to the forest title");
});

test("a conflicted salvage shows the badged preview; confirm posts force", () => {
  const { doc, posted, post } = mount(false);
  const a = wt("a", "/wt/a", 0, true); a.wip = [" M src/app.ts"];
  const b = wt("b", "/wt/b", 0, true); b.wip = [" M src/app.ts"];
  post({ type: "data", fleet: { worktrees: [a, b], branches: [] } });
  post({ type: "salvagePreview", path: "/wt/a", name: "a", branch: "salvage", files: ["src/app.ts", "notes.md"], conflicts: ["src/app.ts"] });
  const midpad = doc.getElementById("midpad");
  assert.match(midpad.textContent, /salvage a/, "preview shown in the worktree column");
  assert.match(midpad.textContent, /also WIP in b/, "collision attributed to the other worktree");
  doc.getElementById("pvgo").click();
  const s = posted.find((m) => m.type === "salvage" && m.force);
  assert.ok(s && s.path === "/wt/a", "confirm posts salvage with force=true (markers accepted)");
});

test("commit rows and wip files carry relative-age tags", () => {
  const { doc, post } = mount(false);
  const w = wt("aged", "/wt/aged", 1, true);
  const now = Math.floor(Date.now() / 1000);
  w.commits[0].date = now - 3 * 86400; // 3 days ago
  w.wipTimes = [now - 2 * 3600]; // wip file touched 2h ago
  post({ type: "data", fleet: { worktrees: [w], branches: [] } });
  post({ type: "select", path: "/wt/aged" });
  const whens = [...doc.getElementById("midpad").querySelectorAll(".when")].map((el) => el.textContent);
  assert.ok(whens.includes("3d"), `commit row shows its age (got ${JSON.stringify(whens)})`);
  assert.ok(whens.includes("2h"), `wip file shows its mtime age (got ${JSON.stringify(whens)})`);
});

test("rows without dates (old cache shape) render with no age tags, not errors", () => {
  const { doc, post } = mount(false);
  post({ type: "data", fleet: FLEET }); // fixture rows: date 0, no wipTimes
  post({ type: "select", path: "/wt/alpha" });
  assert.ok(doc.getElementById("mid").classList.contains("open"), "view still opens");
  assert.equal(doc.getElementById("midpad").querySelectorAll(".when").length, 0, "no empty age tags");
});

const rowNames = (doc) => [...doc.querySelectorAll("#left .row .nm")].map((el) => el.textContent);

test("sort: name / unmerged / oldest reorder rows; 'recent' keeps host order", () => {
  const { w, doc, post } = mount(false);
  const rows = [wt("carol", "/wt/c", 1), wt("alice", "/wt/a", 2), wt("bob", "/wt/b", 3)];
  rows[0].age = 40; rows[1].age = 5; rows[2].age = 12; // carol oldest, bob most unmerged
  post({ type: "data", fleet: { worktrees: rows, branches: [] } });
  const sort = doc.getElementById("sort");
  const pick = (v) => { sort.value = v; sort.dispatchEvent(new w.Event("change")); };
  assert.deepEqual(rowNames(doc), ["carol", "alice", "bob"], "recent = host order");
  pick("name");
  assert.deepEqual(rowNames(doc), ["alice", "bob", "carol"]);
  pick("ahead");
  assert.deepEqual(rowNames(doc), ["bob", "alice", "carol"], "most unmerged first (3,2,1)");
  pick("age");
  assert.deepEqual(rowNames(doc), ["carol", "bob", "alice"], "oldest first");
});

test("the filter matches branch names, live", () => {
  const { w, doc, post } = mount(false);
  const a = wt("alpha", "/wt/a", 1); a.branch = "feature/zeta-fix";
  post({ type: "data", fleet: { worktrees: [a, wt("beta", "/wt/b", 1)], branches: [] } });
  const q = doc.getElementById("q");
  q.value = "zeta"; q.dispatchEvent(new w.Event("input"));
  assert.deepEqual(rowNames(doc), ["alpha"], "matched on branch, not just name");
});

test("checkboxes tick worktrees; the batch bar posts group verbs for the ticked set", () => {
  const { doc, posted, post } = mount(false);
  post({ type: "data", fleet: FLEET });
  const cks = [...doc.querySelectorAll("#left .row .ck")];
  assert.equal(cks.length, 2, "each worktree row carries a checkbox");
  cks.forEach((c) => c.click());
  const batch = doc.getElementById("batch");
  assert.equal(batch.hidden, false, "batch bar appears");
  assert.match(doc.getElementById("batchn").textContent, /2 selected/);
  doc.getElementById("bland").click();
  const m = posted.find((x) => x.type === "landGroup");
  assert.ok(m && m.trees.length === 2, "landGroup carries both ticked trees");
  assert.equal(doc.getElementById("batch").hidden, true, "selection cleared after the verb");
});

test("fell from the batch bar keeps the ticks (host modal may cancel); felled prunes", () => {
  const { doc, posted, post } = mount(false);
  // fresh fixture — 'felled' rewrites the posted fleet object, so sharing FLEET would starve later tests
  post({ type: "data", fleet: { worktrees: [wt("alpha", "/wt/alpha", 1), wt("beta", "/wt/beta", 2)], branches: [] } });
  [...doc.querySelectorAll("#left .row .ck")].forEach((c) => c.click());
  doc.getElementById("bfell").click();
  const m = posted.find((x) => x.type === "fellGroup");
  assert.ok(m && m.trees.length === 2, "fellGroup carries both ticked trees");
  assert.equal(doc.getElementById("batch").hidden, false, "ticks survive until the host confirms");
  post({ type: "felled", path: "/wt/alpha" });
  assert.match(doc.getElementById("batchn").textContent, /1 selected/, "a felled tree leaves the selection");
});

test("x ticks the cursor row without losing the cursor", () => {
  const { w, doc, post } = mount(false);
  post({ type: "data", fleet: FLEET });
  doc.dispatchEvent(new w.KeyboardEvent("keydown", { key: "j" }));
  doc.dispatchEvent(new w.KeyboardEvent("keydown", { key: "x" }));
  assert.match(doc.getElementById("batchn").textContent, /1 selected/);
  const cur = doc.querySelector("#left .row.cursor");
  assert.ok(cur, "cursor still on a row");
  assert.equal(cur.querySelector(".ck").checked, true, "the cursor row is the ticked one");
});

test("columns are labeled: forest · tree — <name> · files — <sha>", () => {
  const { doc, post } = mount(false);
  post({ type: "data", fleet: FLEET });
  assert.match(doc.querySelector(".leftcol .collabel").textContent, /forest/i);
  post({ type: "select", path: "/wt/beta" });
  assert.match(doc.getElementById("midlabel").textContent, /tree · beta/);
  doc.querySelector("#midpad .cmt[data-i]").click();
  assert.match(doc.getElementById("rightlabel").textContent, /files · beta1/);
});

test("the tree view's filter narrows the wip row and commits live", () => {
  const { w, doc, post } = mount(false);
  const r = wt("dirty", "/wt/dirty", 1, true); // wip row 'WIP 1 uncommitted…', commit subj 'dirty work'
  post({ type: "data", fleet: { worktrees: [r], branches: [] } });
  post({ type: "select", path: "/wt/dirty" });
  const midq = doc.getElementById("midq");
  midq.value = "uncommitted"; midq.dispatchEvent(new w.Event("input"));
  const wip = doc.querySelector("#midpad .cmt[data-wip-row]"), cmt = doc.querySelector("#midpad .cmt[data-i]");
  assert.equal(wip.hidden, false, "matching wip row stays");
  assert.equal(cmt.hidden, true, "non-matching commit hides");
  midq.value = "work"; midq.dispatchEvent(new w.Event("input"));
  assert.equal(wip.hidden, true, "now the wip row hides");
  assert.equal(cmt.hidden, false, "and the commit shows");
});

test("the files view's filter narrows a commit's files live", () => {
  const { w, doc, post } = mount(false);
  post({ type: "data", fleet: FLEET });
  post({ type: "select", path: "/wt/alpha" });
  doc.querySelector("#midpad .cmt[data-i]").click();
  post({ type: "files", sha: "alpha1", files: ["src/app.ts", "docs/readme.md"], overflow: 0 });
  const rightq = doc.getElementById("rightq");
  rightq.value = "app"; rightq.dispatchEvent(new w.Event("input"));
  const files = [...doc.querySelectorAll("#rightpad .file[data-f]")];
  assert.equal(files.length, 2);
  assert.deepEqual(files.map((f) => f.hidden), [false, true], "only the match stays visible");
});

test("the sidebar (compact) view multi-selects too: checkboxes, cmd-click, batch bar", () => {
  const { w, doc, posted, post } = mount(true);
  post({ type: "data", fleet: FLEET });
  const cks = [...doc.querySelectorAll("#left .row .ck")];
  assert.equal(cks.length, 2, "compact rows carry checkboxes");
  cks[0].click();
  doc.querySelectorAll("#left .row")[1].dispatchEvent(new w.MouseEvent("click", { metaKey: true, bubbles: true }));
  assert.equal(doc.getElementById("batch").hidden, false, "batch bar shows in the sidebar");
  assert.match(doc.getElementById("batchn").textContent, /2 selected/);
  assert.ok(!posted.find((m) => m.type === "openFull"), "cmd-click selected, it didn't open the panel");
  doc.getElementById("bsalv").click();
  const m = posted.find((x) => x.type === "salvageGroup");
  assert.ok(m && m.trees.length === 2, "salvageGroup posted from the sidebar");
});

test("commit list: tick WIP + a commit → one action shows all their files; ticked files open in one go", () => {
  const { doc, posted, post } = mount(false);
  post({ type: "data", fleet: { worktrees: [wt("d1", "/wt/d1", 1, true)], branches: [] } });
  post({ type: "select", path: "/wt/d1" });
  const ticks = [...doc.querySelectorAll("#midpad .ptick")];
  assert.equal(ticks.length, 2, "the wip row and the commit both carry ticks");
  ticks.forEach((t) => t.click());
  const act = doc.getElementById("midact");
  assert.equal(act.hidden, false, "the tree label grows a files-of-N verb");
  act.click();
  assert.ok(posted.find((m) => m.type === "reqFiles" && m.sha === "d11"), "uncached commit files requested");
  post({ type: "files", sha: "d11", files: ["a.ts"], overflow: 0 });
  assert.ok(doc.querySelector("#rightpad .file[data-wip]"), "wip files in the combined view");
  assert.ok(doc.querySelector("#rightpad .file[data-f]"), "commit files in the combined view");
  [...doc.querySelectorAll("#rightpad .ptick")].forEach((t) => t.click());
  doc.getElementById("rightact").click();
  assert.ok(posted.find((m) => m.type === "diffCommit" && m.file === "a.ts"), "ticked commit file opens as diff");
  assert.ok(posted.find((m) => m.type === "openSource"), "ticked wip file opens as source");
});

test("file list: cmd-click ticks, shift-click ranges, rows highlight", () => {
  const { w, doc, post } = mount(false);
  post({ type: "data", fleet: FLEET });
  post({ type: "select", path: "/wt/alpha" });
  doc.querySelector("#midpad .cmt[data-i]").click();
  post({ type: "files", sha: "alpha1", files: ["a.ts", "b.ts", "c.ts"], overflow: 0 });
  const rows = [...doc.querySelectorAll("#rightpad .file[data-f]")];
  rows[0].dispatchEvent(new w.MouseEvent("click", { metaKey: true, bubbles: true }));
  rows[2].dispatchEvent(new w.MouseEvent("click", { shiftKey: true, bubbles: true }));
  assert.deepEqual(rows.map((r) => r.classList.contains("ticked")), [true, true, true], "range ticked + highlighted");
  assert.match(doc.getElementById("rightact").textContent, /3/, "the verb counts all three");
});

test("a wip row offers a standalone salvage action (not only fell)", () => {
  const { doc, posted, post } = mount(false);
  const w = wt("d1", "/wt/d1", 0, true);
  post({ type: "data", fleet: { worktrees: [w], branches: [] } });
  const act = doc.querySelector('.act[data-a="salvage"]');
  assert.ok(act, "salvage action present on the dirty row");
  act.click();
  const s = posted.find((m) => m.type === "salvage");
  assert.ok(s && s.path === "/wt/d1", "posts a standalone salvage for that worktree");
});

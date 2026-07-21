const test = require("node:test");
const assert = require("node:assert");
const { fleetHtml } = require("../out/webview.js");

test("fleetHtml renders a self-contained page with the expected hooks", () => {
  const h = fleetHtml();
  assert.match(h, /<!doctype html>/i);
  assert.match(h, /acquireVsCodeApi/);
  assert.match(h, /class="col leftcol"/);
  assert.match(h, /class="col mid"/);
  assert.match(h, /class="col right"/);
});

test("fleetHtml wires the fell gesture and the fall/rise animations", () => {
  const h = fleetHtml();
  assert.match(h, /type:'fell'/, "webview posts a fell intent");
  assert.match(h, /\.row\.falling/, "fall animation present");
  assert.match(h, /ljrise/, "rise-on-undo animation present");
  assert.match(h, /type==='felled'/, "handles the felled message");
  assert.match(h, /type==='restored'/, "handles the restored message");
});

test("fleetHtml uses a fresh CSP nonce each call", () => {
  const a = fleetHtml();
  const b = fleetHtml();
  const nonceOf = (s) => (s.match(/nonce-([A-Za-z0-9]+)/) || [])[1];
  assert.ok(nonceOf(a), "has a nonce");
  assert.notEqual(nonceOf(a), nonceOf(b), "nonce is per-render");
});

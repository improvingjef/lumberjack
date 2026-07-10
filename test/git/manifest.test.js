// Integration — the central claims store (fs round-trip).
const test = require("node:test");
const assert = require("node:assert");
const { join } = require("path");
const { makeRepo, cleanup } = require("./helpers");
const manifest = require("../../out/manifest.js");

test("manifest: claim set / read / clear round-trip in the central store", () => {
  const e = makeRepo("master");
  const store = join(e.dir, ".git"); // main worktree's git dir = the common dir
  manifest.setClaim(store, "/wt/a", "claiming X");
  manifest.setClaim(store, "/wt/b", "claiming Y");
  let claims = manifest.readClaims(store);
  assert.equal(claims["/wt/a"].note, "claiming X");
  assert.equal(claims["/wt/b"].note, "claiming Y");
  assert.ok(typeof claims["/wt/a"].at === "number", "records a timestamp");

  manifest.clearClaim(store, "/wt/a");
  claims = manifest.readClaims(store);
  assert.ok(!claims["/wt/a"], "cleared");
  assert.equal(claims["/wt/b"].note, "claiming Y", "others untouched");
  cleanup(e);
});

test("manifest: readClaims on a fresh store is empty, not an error", () => {
  const e = makeRepo("master");
  assert.deepEqual(manifest.readClaims(join(e.dir, ".git")), {});
  cleanup(e);
});

// Integration — the MCP server (mcp.ts) spoken to over real stdio JSON-RPC.
// Spawns `lj mcp` against a throwaway repo and drives the protocol end-to-end.
const test = require("node:test");
const assert = require("node:assert");
const { spawn } = require("child_process");
const path = require("path");
const { makeRepo, commit, wt, cleanup } = require("./helpers");

const CLI = path.join(__dirname, "..", "..", "out", "cli.js");

function startMcp(repo) {
  const child = spawn(process.execPath, [CLI, "mcp", "-C", repo], { stdio: ["pipe", "pipe", "pipe"] });
  const pending = new Map();
  let buf = "";
  child.stdout.on("data", (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg; try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id != null && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    }
  });
  let nextId = 1;
  const call = (method, params) => new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
  const notify = (method, params) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  const stop = () => { try { child.stdin.end(); } catch {} child.kill(); };
  return { call, notify, stop };
}

test("mcp: initialize handshake advertises the server + tools capability", async () => {
  const e = makeRepo("master");
  const m = startMcp(e.dir);
  try {
    const res = await m.call("initialize", {});
    assert.equal(res.result.serverInfo.name, "lumberjack");
    assert.equal(res.result.protocolVersion, "2024-11-05");
    assert.ok(res.result.capabilities.tools);
  } finally { m.stop(); cleanup(e); }
});

test("mcp: tools/list exposes the fleet tools", async () => {
  const e = makeRepo("master");
  const m = startMcp(e.dir);
  try {
    const names = (await m.call("tools/list", {})).result.tools.map((t) => t.name);
    for (const n of ["fleet_status", "who_has", "tend", "claim", "land", "salvage"]) assert.ok(names.includes(n), `exposes ${n}`);
  } finally { m.stop(); cleanup(e); }
});

test("mcp: tools/call fleet_status returns the agent schema", async () => {
  const e = makeRepo("master");
  const p = wt(e, "feat", "feat"); commit(p, "x.txt", "x\n", "x");
  const m = startMcp(e.dir);
  try {
    const res = await m.call("tools/call", { name: "fleet_status", arguments: {} });
    const payload = JSON.parse(res.result.content[0].text);
    assert.ok(payload.summary, "has a summary");
    assert.ok(payload.worktrees.length >= 1, "lists worktrees");
  } finally { m.stop(); cleanup(e); }
});

test("mcp: claim REJECTS a worktree_path outside the fleet (no cross-repo write)", async () => {
  const e = makeRepo("master");
  const m = startMcp(e.dir);
  try {
    const res = await m.call("tools/call", { name: "claim", arguments: { worktree_path: "/tmp/some-other-repo", note: "x" } });
    assert.ok(res.error, "returns a JSON-RPC error, not ok");
    assert.match(res.error.message, /not a worktree/i);
  } finally { m.stop(); cleanup(e); }
});

test("mcp: unknown method errors; a notification (no id) gets no reply and doesn't wedge", async () => {
  const e = makeRepo("master");
  const m = startMcp(e.dir);
  try {
    const res = await m.call("bogus/method", {});
    assert.equal(res.error.code, -32601, "method-not-found");
    m.notify("notifications/initialized", {}); // no id → no response expected
    const ping = await m.call("ping", {}); // server still responsive
    assert.ok(ping.result);
  } finally { m.stop(); cleanup(e); }
});

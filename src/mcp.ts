// mcp.ts — a minimal Model Context Protocol server over stdio, no SDK.
// Newline-delimited JSON-RPC 2.0. Exposes the fleet's read model and its safe
// actions as tools, so an IDE agent can *see and operate* the whole worktree
// swarm — not just the one worktree it's sealed in.

import { createInterface } from "readline";
import { execFile } from "child_process";
import { gatherFleet } from "./git";
import { fleetJson, whoHas, tendPlan, attachClaims } from "./core";
import { readClaims, setClaim } from "./manifest";
import * as ops from "./ops";

function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((res) => execFile("git", ["-C", cwd, ...args], { maxBuffer: 64 * 1024 * 1024 }, (_e, o) => res((o || "").trim())));
}
async function repoTop(cwd: string): Promise<string> { return (await git(cwd, ["rev-parse", "--show-toplevel"])) || cwd; }
async function commonDir(repo: string): Promise<string> { return (await git(repo, ["rev-parse", "--path-format=absolute", "--git-common-dir"])) || `${repo}/.git`; }

const TOOLS = [
  { name: "fleet_status", description: "The whole worktree fleet: per-worktree group (needs/wip/dead), ahead, dirty, WIP files, claims, commits, plus loose branches and a summary.", inputSchema: { type: "object", properties: {} } },
  { name: "who_has", description: "Which worktrees have uncommitted changes to a file — call before editing a shared file to avoid colliding with another agent.", inputSchema: { type: "object", properties: { file: { type: "string" } }, required: ["file"] } },
  { name: "tend", description: "A proposed caretaker sweep: deadwood to fell, branches ready to land, WIP to salvage, aging gems, and file collisions across worktrees.", inputSchema: { type: "object", properties: {} } },
  { name: "claim", description: "Claim a worktree on the shared board so other agents see it's taken.", inputSchema: { type: "object", properties: { worktree_path: { type: "string" }, note: { type: "string" } }, required: ["worktree_path", "note"] } },
  { name: "land", description: "Fast-forward the trunk to a ready (clean-ahead) branch. Refuses anything that isn't a clean ff.", inputSchema: { type: "object", properties: { branch: { type: "string" } }, required: ["branch"] } },
  { name: "salvage", description: "Park a worktree's WIP onto the shared salvage branch for review, without touching the worktree.", inputSchema: { type: "object", properties: { worktree_path: { type: "string" } }, required: ["worktree_path"] } },
];

async function callTool(cwd: string, name: string, args: any): Promise<unknown> {
  const repo = await repoTop(cwd);
  if (name === "fleet_status") {
    const f = await gatherFleet(repo, { window: 10, maxFiles: 0, includeBranches: true });
    attachClaims(f.worktrees, readClaims(await commonDir(repo)));
    return fleetJson(f, repo);
  }
  if (name === "who_has") {
    const f = await gatherFleet(repo, { window: 1, maxFiles: 0, includeBranches: false });
    return whoHas(f, String(args.file));
  }
  if (name === "tend") {
    const f = await gatherFleet(repo, { window: 1, maxFiles: 0, includeBranches: false });
    return tendPlan(f);
  }
  if (name === "claim") { setClaim(await commonDir(repo), String(args.worktree_path), String(args.note)); return { ok: true }; }
  if (name === "land") { return ops.land(repo, String(args.branch)); }
  if (name === "salvage") { const c = await ops.salvage(repo, String(args.worktree_path), "salvage", "salvage: preserve (lumberjack mcp)"); return { ok: true, commit: c }; }
  throw new Error(`unknown tool: ${name}`);
}

export function runMcp(cwd: string, version: string): void {
  const send = (msg: any) => process.stdout.write(JSON.stringify(msg) + "\n");
  const reply = (id: any, result: any) => send({ jsonrpc: "2.0", id, result });
  const fail = (id: any, code: number, message: string) => send({ jsonrpc: "2.0", id, error: { code, message } });

  const rl = createInterface({ input: process.stdin });
  rl.on("line", async (line) => {
    const text = line.trim();
    if (!text) return;
    let req: any;
    try { req = JSON.parse(text); } catch { return; }
    const { id, method, params } = req;
    try {
      if (method === "initialize") {
        reply(id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "lumberjack", version } });
      } else if (method === "tools/list") {
        reply(id, { tools: TOOLS });
      } else if (method === "tools/call") {
        const out = await callTool(cwd, params?.name, params?.arguments ?? {});
        reply(id, { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
      } else if (method === "ping") {
        reply(id, {});
      } else if (typeof id !== "undefined") {
        fail(id, -32601, `method not found: ${method}`);
      }
      // notifications (no id) — e.g. notifications/initialized — need no reply
    } catch (e: any) {
      if (typeof id !== "undefined") fail(id, -32000, e?.message ?? String(e));
    }
  });
}

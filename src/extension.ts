import * as vscode from "vscode";
import * as path from "path";
import { execFile } from "child_process";
import { gatherWorktrees, gatherBranches, commitFiles, showAtRef, Fleet } from "./git";
import { fleetHtml } from "./webview";
import { attachClaims, shouldReuseCache } from "./core";
import { readClaims } from "./manifest";
import * as ops from "./ops";

function commonDir(repo: string): Promise<string> {
  return new Promise((res) =>
    execFile("git", ["-C", repo, "rev-parse", "--path-format=absolute", "--git-common-dir"], (_e, o) =>
      res((o || "").trim() || `${repo}/.git`)));
}

const SCHEME = "lumberjack";

function cfg() { return vscode.workspace.getConfiguration("lumberjack"); }
function salvageBranch(): string { return cfg().get<string>("salvageBranch") || "salvage"; }
function trunkOpt(): string | undefined { const t = cfg().get<string>("trunk"); return t && t.trim() ? t.trim() : undefined; }
function commitWindow(): number { return cfg().get<number>("commitWindow") ?? 8; }

class GitContentProvider implements vscode.TextDocumentContentProvider {
  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const p = new URLSearchParams(uri.query);
    const repo = p.get("repo") ?? "", ref = p.get("ref") ?? "HEAD", file = p.get("file") ?? "";
    if (!repo || !file) return "";
    try { return await showAtRef(repo, ref, file); } catch { return ""; }
  }
}

function repoRoot(): string | undefined {
  const c = cfg().get<string>("repoPath");
  if (c && c.trim()) return c.trim();
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
function gitUri(repo: string, ref: string, file: string): vscode.Uri {
  return vscode.Uri.parse(`${SCHEME}:${file}?${new URLSearchParams({ repo, ref, file }).toString()}`);
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(SCHEME, new GitContentProvider()));

  let panel: vscode.WebviewPanel | undefined;
  let sidebar: vscode.WebviewView | undefined;
  let pendingSelect: string | undefined; // worktree path to focus once the panel loads
  let pendingPreview: any; // a salvage preview to deliver the same way (sidebar → fresh panel handoff)
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.command = "lumberjack.open";
  context.subscriptions.push(status);

  const targets = () => [panel?.webview, sidebar?.webview].filter(Boolean) as vscode.Webview[];
  const broadcast = (msg: any) => targets().forEach((w) => w.postMessage(msg));
  const cacheKey = (repo: string) => `fleet:${repo}`;
  const atKey = (repo: string) => `fleetAt:${repo}`;
  const getCache = (repo: string) => context.globalState.get<Fleet>(cacheKey(repo));
  const cacheAge = (repo: string) => Date.now() - (context.globalState.get<number>(atKey(repo)) ?? 0);
  const setCache = async (repo: string, fleet: Fleet) => {
    await context.globalState.update(cacheKey(repo), fleet);
    await context.globalState.update(atKey(repo), Date.now());
  };
  const freshMs = () => (cfg().get<number>("cacheFreshnessSeconds") ?? 15) * 1000;

  // Interrogate the whole fleet in the background and warm the cache — run at
  // startup so the first panel open is instant and current, not a cold 5s gather.
  async function warmCache() {
    const repo = repoRoot();
    if (!repo) return;
    try {
      const { worktrees, trunk } = await gatherWorktrees(repo, { window: commitWindow(), maxFiles: 0, trunk: trunkOpt() });
      attachClaims(worktrees, readClaims(await commonDir(repo)));
      const branches = await gatherBranches(repo, { window: commitWindow(), maxFiles: 0, trunk });
      const fleet = { worktrees, branches };
      await setCache(repo, fleet);
      paintStatus(fleet);
      // NB: do NOT broadcast here — an open view refreshes on its own, and a
      // background 'data' can land after that refresh's split worktrees/branches
      // posts and revert them (race). The warm cache benefits the next open.
    } catch { /* leave the last good cache */ }
  }

  function paintStatus(fleet: Fleet) {
    const w = fleet.worktrees;
    const needs = w.filter((r) => r.dirty || r.ahead > 0).length;
    const dead = w.length - needs;
    status.text = `$(git-branch) ${needs} need you · ${dead} deadwood`;
    status.tooltip = `Lumberjack — ${w.length} worktrees (${needs} need you, ${dead} deadwood), ${fleet.branches.length} loose branches. Click to open.`;
    status.show();
  }

  // Two-phase, cache-first gather for a set of webviews.
  async function refresh(views: vscode.Webview[], force = false) {
    if (!views.length) return;
    const repo = repoRoot();
    if (!repo) { views.forEach((w) => w.postMessage({ type: "error", message: "No repo. Open a folder or set lumberjack.repoPath." })); return; }

    const select = pendingSelect; // focus this worktree the moment there's data — even from cache
    const cached = getCache(repo);
    if (cached) views.forEach((w) => w.postMessage({ type: "data", repo, fleet: cached, cached: true, select }));
    else views.forEach((w) => w.postMessage({ type: "loading" }));

    const deliverPreview = () => {
      if (!pendingPreview) return;
      views.forEach((w) => w.postMessage(pendingPreview));
      pendingPreview = undefined;
    };
    // warm cache + not forced → the instant paint IS current; skip the redundant gather
    if (shouldReuseCache(force, !!cached, cacheAge(repo), freshMs())) { pendingSelect = undefined; deliverPreview(); return; }

    try {
      const { worktrees, trunk } = await gatherWorktrees(repo, { window: commitWindow(), maxFiles: 0, trunk: trunkOpt() });
      attachClaims(worktrees, readClaims(await commonDir(repo)));
      views.forEach((w) => w.postMessage({ type: "worktrees", worktrees, select }));
      pendingSelect = undefined;
      deliverPreview();
      paintStatus({ worktrees, branches: cached?.branches ?? [] });

      const branches = await gatherBranches(repo, { window: commitWindow(), maxFiles: 0, trunk });
      views.forEach((w) => w.postMessage({ type: "branches", branches }));

      await setCache(repo, { worktrees, branches });
      paintStatus({ worktrees, branches });
    } catch (e: any) {
      pendingSelect = undefined;
      views.forEach((w) => w.postMessage({ type: "error", message: `Couldn't read the forest: ${e?.message ?? e}` }));
    }
  }

  async function updateStatus() {
    const repo = repoRoot();
    if (!repo) { status.hide(); return; }
    try { const { worktrees } = await gatherWorktrees(repo, { window: 0, maxFiles: 0, trunk: trunkOpt() }); paintStatus({ worktrees, branches: context.globalState.get<Fleet>(cacheKey(repo))?.branches ?? [] }); } catch {}
  }

  // ---- actions ----
  async function openSource(m: any, repo: string) {
    const uri = vscode.Uri.file(path.isAbsolute(m.file) ? m.file : path.join(m.cwd ?? repo, m.file));
    await vscode.window.showTextDocument(uri, { preview: true });
  }
  async function diffCommit(repo: string, m: any) {
    await vscode.commands.executeCommand("vscode.diff", gitUri(repo, `${m.sha}^`, m.file), gitUri(repo, m.sha, m.file), `${path.basename(m.file)} @ ${m.sha.slice(0, 9)}`);
  }
  async function diffWip(m: any) {
    await vscode.commands.executeCommand("vscode.diff", gitUri(m.cwd, "HEAD", m.file), vscode.Uri.file(path.join(m.cwd, m.file)), `${path.basename(m.file)} (WIP)`);
  }
  async function dive(m: any) {
    // spend the lens: open the worktree itself, Lumberjack gets out of the way
    if (!m.path || m.path === "(no worktree)") return;
    await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(m.path), { forceNewWindow: true });
  }
  async function sendFiles(view: vscode.Webview, repo: string, sha: string) {
    const { files, overflow } = await commitFiles(repo, sha, 80);
    view.postMessage({ type: "files", sha, files, overflow });
  }

  // Merge a worktree's WIP onto the shared branch for review — no fell.
  // Clean merge → just go. Conflicts → hand the webview a badged preview;
  // its confirm comes back with force=true and commits WITH markers.
  async function salvageOnly(view: vscode.Webview, m: any, isSidebar = false) {
    const repo = repoRoot();
    if (!repo) return;
    try {
      const pv = await ops.salvagePreview(repo, m.path, salvageBranch());
      if (!pv.clean && !m.force) {
        const msg = { type: "salvagePreview", path: m.path, name: m.name, branch: pv.branch, files: pv.files, conflicts: pv.conflicts };
        if (isSidebar) {
          // the compact view has no mid column — hand the preview to the panel
          const existed = !!panel;
          await vscode.commands.executeCommand("lumberjack.open");
          if (existed) panel?.webview.postMessage(msg);
          else { pendingSelect = m.path; pendingPreview = msg; } // a fresh panel gets it via its load
        } else view.postMessage(msg);
        return;
      }
      const c = await ops.salvage(repo, m.path, salvageBranch(), `salvage: preserve ${m.name} (lumberjack)`);
      const outcome = pv.conflicts.length ? `${pv.conflicts.length} with conflict markers` : "merged clean";
      vscode.window.showInformationMessage(`Salvaged ${m.name} → ${salvageBranch()} @ ${c.slice(0, 9)} — ${pv.files.length} file(s), ${outcome}`);
      await refresh(targets(), true);
    } catch (e: any) { vscode.window.showErrorMessage(`Salvage failed: ${e.message}`); }
  }

  // Salvage-all: park every listed worktree's WIP onto one shared review branch.
  async function salvageGroup(m: any) {
    const repo = repoRoot();
    if (!repo) return;
    const trees = (m.trees ?? []) as ops.TreeRef[];
    if (!trees.length) return;
    const branch = salvageBranch();
    const r = await ops.salvageMany(repo, trees, branch);
    const conflictNote = r.conflicts.length ? ` — ${r.conflicts.length} conflict(s) committed with markers (${r.conflicts.join(", ")})` : "";
    vscode.window.showInformationMessage(`Salvaged ${r.count} worktree(s) → ${branch} for review${conflictNote}`);
    await refresh(targets(), true);
  }

  async function landOne(m: any) {
    const repo = repoRoot();
    if (!repo) return;
    const res = await ops.land(repo, m.branch, trunkOpt());
    if (res.ok) vscode.window.showInformationMessage(`⬆ ${res.message}`);
    else vscode.window.showWarningMessage(`Couldn't land ${m.name}: ${res.message}`);
    await refresh(targets(), true);
  }

  async function landGroup(m: any) {
    const repo = repoRoot();
    if (!repo) return;
    const branches = ((m.trees ?? []) as ops.TreeRef[]).map((t) => t.branch).filter((b) => b && b !== "(detached)");
    if (!branches.length) return;
    const { landed, skipped } = await ops.landMany(repo, branches, trunkOpt());
    vscode.window.showInformationMessage(`Landed ${landed.length}${skipped.length ? `, skipped ${skipped.length} (not fast-forwardable)` : ""}`);
    await refresh(targets(), true);
  }

  // Fell-all deadwood: one confirm, felled together, one Undo restores them all.
  async function fellGroup(m: any) {
    const repo = repoRoot();
    if (!repo) return;
    const trees = (m.trees ?? []) as ops.TreeRef[];
    if (!trees.length) return;
    const pick = await vscode.window.showWarningMessage(
      `Fell ${trees.length} worktree(s)?`, { modal: true, detail: trees.map((t) => t.name).join(", ") }, `Fell ${trees.length}`);
    if (!pick) return;
    const tokens = await ops.fellMany(repo, trees, trunkOpt());
    tokens.forEach((t) => broadcast({ type: "felled", path: t.path }));
    await updateStatus();
    const undo = await vscode.window.showInformationMessage(`🪓 Felled ${tokens.length} deadwood`, "Undo");
    if (undo === "Undo") {
      const r = await ops.unfellMany(repo, tokens);
      if (r.failed.length) vscode.window.showWarningMessage(`Undo: restored ${r.restored.length}, ${r.failed.length} couldn't be restored (${r.failed.map((f) => f.ref).join(", ")})`);
      await refresh(targets(), true);
    }
  }

  async function fellWorktree(m: any) {
    const repo = repoRoot();
    if (!repo) return;
    const a = await ops.assess(repo, m.path, trunkOpt());
    const branch = m.branch && m.branch !== "(detached)" ? (m.branch as string) : null;
    if (!a.safe) {
      const risks: string[] = [];
      if (a.ahead > 0) risks.push(`${a.ahead} commit(s) not on the trunk`);
      if (a.trackedWip) risks.push(`uncommitted changes a fell can't restore`);
      const buttons = a.trackedWip ? ["Salvage & Fell", "Fell anyway"] : ["Fell anyway"];
      const pick = await vscode.window.showWarningMessage(`Fell ${m.name}?`, { modal: true, detail: `This tree has ${risks.join(" and ")}.` }, ...buttons);
      if (!pick) return;
      if (pick === "Salvage & Fell") {
        try { const c = await ops.salvage(repo, m.path, salvageBranch(), `salvage: preserve ${m.name} (lumberjack)`); vscode.window.showInformationMessage(`Salvaged ${m.name} → ${salvageBranch()} @ ${c.slice(0, 9)}`); }
        catch (e: any) { vscode.window.showErrorMessage(`Salvage failed: ${e.message}`); return; }
      }
    }
    let token: ops.RestoreToken;
    try { token = await ops.fell(repo, m.path, branch); }
    catch (e: any) { vscode.window.showErrorMessage(`Fell failed: ${e.message}`); return; }
    broadcast({ type: "felled", path: m.path });
    await updateStatus();
    const undo = await vscode.window.showInformationMessage(`🪓 Felled ${m.name}`, "Undo");
    if (undo === "Undo") {
      try { await ops.unfell(repo, token); broadcast({ type: "restored", path: m.path }); await refresh(targets(), true); }
      catch (e: any) { vscode.window.showErrorMessage(`Undo failed: ${e.message} — the branch may still be at ${token.sha.slice(0, 9)}.`); }
    }
  }

  function handler(view: vscode.Webview, isSidebar: boolean) {
    return async (msg: any) => {
      const repo = repoRoot();
      if (msg.type === "ready") return refresh([view]); // uses the warm cache if fresh
      if (msg.type === "refresh") return refresh([view], true); // user hit ↻ → force live
      if (!repo) return;
      if (msg.type === "openFull") {
        const existed = !!panel;
        await vscode.commands.executeCommand("lumberjack.open");
        // already-open panel has data → focus now; fresh panel → deliver via its load
        if (existed) panel?.webview.postMessage({ type: "select", path: msg.path });
        else pendingSelect = msg.path;
        return;
      }
      if (msg.type === "title") { // focused panel wears the worktree's name
        if (!isSidebar && panel) panel.title = msg.name ? `Worktree: ${msg.name}` : "Worktree Forest";
        return;
      }
      if (msg.type === "reqFiles") return sendFiles(view, repo, msg.sha);
      if (msg.type === "openSource") return openSource(msg, repo);
      if (msg.type === "diffCommit") return diffCommit(repo, msg);
      if (msg.type === "diffWip") return diffWip(msg);
      if (msg.type === "dive") return dive(msg);
      if (msg.type === "fell") return fellWorktree(msg);
      if (msg.type === "salvage") return salvageOnly(view, msg, isSidebar);
      if (msg.type === "salvageGroup") return salvageGroup(msg);
      if (msg.type === "fellGroup") return fellGroup(msg);
      if (msg.type === "land") return landOne(msg);
      if (msg.type === "landGroup") return landGroup(msg);
    };
  }

  // ---- sidebar (activity-bar) view ----
  context.subscriptions.push(vscode.window.registerWebviewViewProvider("lumberjack.fleetView", {
    resolveWebviewView(view) {
      sidebar = view;
      view.webview.options = { enableScripts: true };
      view.webview.html = fleetHtml(true);
      view.webview.onDidReceiveMessage(handler(view.webview, true));
      view.onDidDispose(() => { sidebar = undefined; });
    },
  }));

  // ---- editor-area panel ----
  context.subscriptions.push(vscode.commands.registerCommand("lumberjack.open", () => {
    if (panel) { panel.reveal(); return; }
    panel = vscode.window.createWebviewPanel("lumberjack", "Worktree Forest", vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
    panel.webview.html = fleetHtml(false);
    panel.webview.onDidReceiveMessage(handler(panel.webview, false), undefined, context.subscriptions);
    panel.onDidDispose(() => (panel = undefined), undefined, context.subscriptions);
  }));

  context.subscriptions.push(vscode.commands.registerCommand("lumberjack.refresh", () => refresh(targets(), true)));

  // Warm the fleet in the background at startup → first open is instant + current.
  if (cfg().get<boolean>("warmOnStartup") ?? true) warmCache();

  // Compare two worktrees — judge rival solutions to the same problem.
  context.subscriptions.push(vscode.commands.registerCommand("lumberjack.compare", async () => {
    const repo = repoRoot();
    if (!repo) return;
    const { worktrees } = await gatherWorktrees(repo, { window: 1, maxFiles: 0, trunk: trunkOpt() });
    const items = worktrees.filter((w) => w.branch && w.branch !== "(detached)").map((w) => ({ label: w.name, description: w.branch, branch: w.branch }));
    const a = await vscode.window.showQuickPick(items, { placeHolder: "Compare — first worktree" });
    if (!a) return;
    const b = await vscode.window.showQuickPick(items.filter((i) => i.branch !== a.branch), { placeHolder: `Compare ${a.label} with…` });
    if (!b) return;
    const res = await ops.compareStat(repo, a.branch, b.branch);
    const doc = await vscode.workspace.openTextDocument({ content: `${a.label}  …vs…  ${b.label}\n\n${res.raw || "(identical)"}\n`, language: "diff" });
    await vscode.window.showTextDocument(doc, { preview: true });
  }));

  // ---- ambient status tile ----
  const r0 = repoRoot();
  const warming = cfg().get<boolean>("warmOnStartup") ?? true;
  if (r0 && getCache(r0)) paintStatus(getCache(r0)!); // instant from last-known cache
  else if (!warming) updateStatus(); // no warm, no cache → read once so the tile isn't hidden forever
  const secs = cfg().get<number>("statusBarRefreshSeconds") ?? 20;
  if (secs > 0) { const h = setInterval(updateStatus, secs * 1000); context.subscriptions.push({ dispose: () => clearInterval(h) }); }
}

export function deactivate() {}

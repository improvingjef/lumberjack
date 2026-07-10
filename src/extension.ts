import * as vscode from "vscode";
import * as path from "path";
import { gatherWorktrees, gatherBranches, commitFiles, showAtRef, Fleet } from "./git";
import { fleetHtml } from "./webview";
import * as ops from "./ops";

const SCHEME = "lumberjack";

function cfg() { return vscode.workspace.getConfiguration("lumberjack"); }
function salvageBranch(): string { return cfg().get<string>("salvageBranch") || "salvage"; }
function trunkOpt(): string | undefined { const t = cfg().get<string>("trunk"); return t && t.trim() ? t.trim() : undefined; }
function commitWindow(): number { return cfg().get<number>("commitWindow") ?? 14; }

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
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.command = "lumberjack.open";
  context.subscriptions.push(status);

  const targets = () => [panel?.webview, sidebar?.webview].filter(Boolean) as vscode.Webview[];
  const broadcast = (msg: any) => targets().forEach((w) => w.postMessage(msg));
  const cacheKey = (repo: string) => `fleet:${repo}`;

  function paintStatus(fleet: Fleet) {
    const w = fleet.worktrees;
    const needs = w.filter((r) => r.dirty || r.ahead > 0).length;
    const dead = w.length - needs;
    status.text = `$(git-branch) ${needs} need you · ${dead} deadwood`;
    status.tooltip = `Lumberjack — ${w.length} worktrees (${needs} need you, ${dead} deadwood), ${fleet.branches.length} loose branches. Click to open.`;
    status.show();
  }

  // Two-phase, cache-first gather for a set of webviews.
  async function refresh(views: vscode.Webview[]) {
    if (!views.length) return;
    const repo = repoRoot();
    if (!repo) { views.forEach((w) => w.postMessage({ type: "error", message: "No repo. Open a folder or set lumberjack.repoPath." })); return; }

    const select = pendingSelect; // focus this worktree the moment there's data — even from cache
    const cached = context.globalState.get<Fleet>(cacheKey(repo));
    if (cached) views.forEach((w) => w.postMessage({ type: "data", repo, fleet: cached, cached: true, select }));
    else views.forEach((w) => w.postMessage({ type: "loading" }));

    const { worktrees, trunk } = await gatherWorktrees(repo, { window: commitWindow(), maxFiles: 0, trunk: trunkOpt() });
    views.forEach((w) => w.postMessage({ type: "worktrees", worktrees, select }));
    pendingSelect = undefined;
    paintStatus({ worktrees, branches: cached?.branches ?? [] });

    const branches = await gatherBranches(repo, { window: commitWindow(), maxFiles: 0, trunk });
    views.forEach((w) => w.postMessage({ type: "branches", branches }));

    const fleet = { worktrees, branches };
    await context.globalState.update(cacheKey(repo), fleet);
    paintStatus(fleet);
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

  // Park a worktree's WIP onto the shared branch for review — no fell.
  async function salvageOnly(m: any) {
    const repo = repoRoot();
    if (!repo) return;
    try {
      const c = await ops.salvage(repo, m.path, salvageBranch(), `salvage: preserve ${m.name} (lumberjack)`);
      vscode.window.showInformationMessage(`Salvaged ${m.name} → ${salvageBranch()} @ ${c.slice(0, 9)} for review`);
      await refresh(targets());
    } catch (e: any) { vscode.window.showErrorMessage(`Salvage failed: ${e.message}`); }
  }

  // Salvage-all: park every listed worktree's WIP onto one shared review branch.
  async function salvageGroup(m: any) {
    const repo = repoRoot();
    if (!repo) return;
    const trees = (m.trees ?? []) as ops.TreeRef[];
    if (!trees.length) return;
    const branch = salvageBranch();
    const n = await ops.salvageMany(repo, trees, branch);
    vscode.window.showInformationMessage(`Salvaged ${n} worktree(s) → ${branch} for review`);
    await refresh(targets());
  }

  // Fell-all deadwood: one confirm, felled together, one Undo restores them all.
  async function fellGroup(m: any) {
    const repo = repoRoot();
    if (!repo) return;
    const trees = (m.trees ?? []) as ops.TreeRef[];
    if (!trees.length) return;
    const pick = await vscode.window.showWarningMessage(
      `Fell all ${trees.length} deadwood?`, { modal: true, detail: trees.map((t) => t.name).join(", ") }, `Fell ${trees.length}`);
    if (!pick) return;
    const tokens = await ops.fellMany(repo, trees);
    tokens.forEach((t) => broadcast({ type: "felled", path: t.path }));
    await updateStatus();
    const undo = await vscode.window.showInformationMessage(`🪓 Felled ${tokens.length} deadwood`, "Undo");
    if (undo === "Undo") { await ops.unfellMany(repo, tokens); await refresh(targets()); }
  }

  async function fellWorktree(m: any) {
    const repo = repoRoot();
    if (!repo) return;
    const a = await ops.assess(repo, m.path);
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
      try { await ops.unfell(repo, token); broadcast({ type: "restored", path: m.path }); await refresh(targets()); }
      catch (e: any) { vscode.window.showErrorMessage(`Undo failed: ${e.message} — the branch may still be at ${token.sha.slice(0, 9)}.`); }
    }
  }

  function handler(view: vscode.Webview, isSidebar: boolean) {
    return async (msg: any) => {
      const repo = repoRoot();
      if (msg.type === "ready" || msg.type === "refresh") return refresh([view]);
      if (!repo) return;
      if (msg.type === "openFull") {
        const existed = !!panel;
        await vscode.commands.executeCommand("lumberjack.open");
        // already-open panel has data → focus now; fresh panel → deliver via its load
        if (existed) panel?.webview.postMessage({ type: "select", path: msg.path });
        else pendingSelect = msg.path;
        return;
      }
      if (msg.type === "reqFiles") return sendFiles(view, repo, msg.sha);
      if (msg.type === "openSource") return openSource(msg, repo);
      if (msg.type === "diffCommit") return diffCommit(repo, msg);
      if (msg.type === "diffWip") return diffWip(msg);
      if (msg.type === "dive") return dive(msg);
      if (msg.type === "fell") return fellWorktree(msg);
      if (msg.type === "salvage") return salvageOnly(msg);
      if (msg.type === "salvageGroup") return salvageGroup(msg);
      if (msg.type === "fellGroup") return fellGroup(msg);
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
    panel = vscode.window.createWebviewPanel("lumberjack", "Worktree Fleet", vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
    panel.webview.html = fleetHtml(false);
    panel.webview.onDidReceiveMessage(handler(panel.webview, false), undefined, context.subscriptions);
    panel.onDidDispose(() => (panel = undefined), undefined, context.subscriptions);
  }));

  context.subscriptions.push(vscode.commands.registerCommand("lumberjack.refresh", () => refresh(targets())));

  // ---- ambient status tile ----
  updateStatus();
  const secs = cfg().get<number>("statusBarRefreshSeconds") ?? 20;
  if (secs > 0) { const h = setInterval(updateStatus, secs * 1000); context.subscriptions.push({ dispose: () => clearInterval(h) }); }
}

export function deactivate() {}

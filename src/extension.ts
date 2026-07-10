import * as vscode from "vscode";
import * as path from "path";
import { gatherFleet, Fleet } from "./git";
import { showAtRef } from "./git";
import { fleetHtml } from "./webview";
import * as ops from "./ops";

const SCHEME = "lumberjack"; // virtual docs for the historical side of a diff

function cfg() { return vscode.workspace.getConfiguration("lumberjack"); }
function salvageBranch(): string { return cfg().get<string>("salvageBranch") || "salvage"; }
function trunkOpt(): string | undefined { const t = cfg().get<string>("trunk"); return t && t.trim() ? t.trim() : undefined; }

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
  const q = new URLSearchParams({ repo, ref, file }).toString();
  return vscode.Uri.parse(`${SCHEME}:${file}?${q}`);
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, new GitContentProvider())
  );

  let panel: vscode.WebviewPanel | undefined;
  let sidebar: vscode.WebviewView | undefined;
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.command = "lumberjack.open";
  context.subscriptions.push(status);

  const broadcast = (msg: any) => { panel?.webview.postMessage(msg); sidebar?.webview.postMessage(msg); };

  function paintStatus(fleet: Fleet) {
    const w = fleet.worktrees;
    const dirty = w.filter((r) => r.dirty).length;
    const ahead = w.filter((r) => r.ahead > 0 && !r.dirty).length;
    status.text = `$(git-branch) ${w.length} · ${dirty} dirty · ${ahead} ahead`;
    status.tooltip = `Lumberjack — ${w.length} worktrees, ${dirty} dirty, ${ahead} ahead. Click to open the fleet.`;
    status.show();
  }

  async function sendPanel() {
    if (!panel) return;
    const repo = repoRoot();
    if (!repo) { panel.webview.postMessage({ type: "error", message: "No repo. Open a folder or set lumberjack.repoPath." }); return; }
    panel.webview.postMessage({ type: "loading" });
    const fleet = await gatherFleet(repo, { window: cfg().get<number>("commitWindow") ?? 14, maxFiles: 80, trunk: trunkOpt() });
    panel.webview.postMessage({ type: "data", repo, fleet });
  }

  async function sendSidebar() {
    if (!sidebar) return;
    const repo = repoRoot();
    if (!repo) { sidebar.webview.postMessage({ type: "error", message: "No repo. Open a folder or set lumberjack.repoPath." }); return; }
    sidebar.webview.postMessage({ type: "loading" });
    const fleet = await gatherFleet(repo, { window: cfg().get<number>("commitWindow") ?? 14, maxFiles: 0, includeBranches: true, trunk: trunkOpt() });
    sidebar.webview.postMessage({ type: "data", repo, fleet });
    paintStatus(fleet);
  }

  async function updateStatus() {
    const repo = repoRoot();
    if (!repo) { status.hide(); return; }
    try {
      const fleet = await gatherFleet(repo, { window: 0, maxFiles: 0, includeBranches: false, trunk: trunkOpt() });
      paintStatus(fleet);
    } catch { /* leave the last good tile */ }
  }

  const refreshAll = async () => { await sendPanel(); await sendSidebar(); if (!sidebar) await updateStatus(); };

  // ---- actions shared by both surfaces ----
  async function openSource(m: any, repo: string) {
    const uri = vscode.Uri.file(path.isAbsolute(m.file) ? m.file : path.join(m.cwd ?? repo, m.file));
    await vscode.window.showTextDocument(uri, { preview: true });
  }
  async function diffCommit(repo: string, m: any) {
    await vscode.commands.executeCommand("vscode.diff", gitUri(repo, `${m.sha}^`, m.file), gitUri(repo, m.sha, m.file),
      `${path.basename(m.file)} @ ${m.sha.slice(0, 9)}`);
  }
  async function diffWip(m: any) {
    await vscode.commands.executeCommand("vscode.diff", gitUri(m.cwd, "HEAD", m.file), vscode.Uri.file(path.join(m.cwd, m.file)),
      `${path.basename(m.file)} (WIP)`);
  }

  // Fell a worktree — undoably. Deadwood/brush fell instantly with an Undo
  // toast; a tree with real work routes through a modal offering Salvage & Fell.
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
      const pick = await vscode.window.showWarningMessage(
        `Fell ${m.name}?`, { modal: true, detail: `This tree has ${risks.join(" and ")}.` }, ...buttons);
      if (!pick) return;
      if (pick === "Salvage & Fell") {
        try {
          const c = await ops.salvage(repo, m.path, salvageBranch(), `salvage: preserve ${m.name} (lumberjack)`);
          vscode.window.showInformationMessage(`Salvaged ${m.name} → ${salvageBranch()} @ ${c.slice(0, 9)}`);
        } catch (e: any) { vscode.window.showErrorMessage(`Salvage failed: ${e.message}`); return; }
      }
    }

    let token: ops.RestoreToken;
    try { token = await ops.fell(repo, m.path, branch); }
    catch (e: any) { vscode.window.showErrorMessage(`Fell failed: ${e.message}`); return; }
    broadcast({ type: "felled", path: m.path });
    await updateStatus();

    const undo = await vscode.window.showInformationMessage(`🪓 Felled ${m.name}`, "Undo");
    if (undo === "Undo") {
      try {
        await ops.unfell(repo, token);
        broadcast({ type: "restored", path: m.path });
        await sendPanel(); await sendSidebar(); if (!sidebar) await updateStatus();
      } catch (e: any) {
        vscode.window.showErrorMessage(`Undo failed: ${e.message} — the branch may still be at ${token.sha.slice(0, 9)}.`);
      }
    }
  }

  async function panelMessage(msg: any) {
    if (msg.type === "ready" || msg.type === "refresh") return sendPanel();
    const repo = repoRoot();
    if (!repo) return;
    if (msg.type === "openSource") return openSource(msg, repo);
    if (msg.type === "diffCommit") return diffCommit(repo, msg);
    if (msg.type === "diffWip") return diffWip(msg);
    if (msg.type === "fell") return fellWorktree(msg);
  }

  function sidebarMessage(msg: any) {
    if (msg.type === "ready" || msg.type === "refresh") return sendSidebar();
    if (msg.type === "openFull") return vscode.commands.executeCommand("lumberjack.open");
    if (msg.type === "fell") return fellWorktree(msg);
  }

  // ---- sidebar (activity-bar) view ----
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("lumberjack.fleetView", {
      resolveWebviewView(view) {
        sidebar = view;
        view.webview.options = { enableScripts: true };
        view.webview.html = fleetHtml(true); // compact
        view.webview.onDidReceiveMessage(sidebarMessage);
        view.onDidDispose(() => { sidebar = undefined; });
      },
    })
  );

  // ---- editor-area panel ----
  context.subscriptions.push(
    vscode.commands.registerCommand("lumberjack.open", () => {
      if (panel) { panel.reveal(); return; }
      panel = vscode.window.createWebviewPanel("lumberjack", "Worktree Fleet",
        vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
      panel.webview.html = fleetHtml(false);
      panel.webview.onDidReceiveMessage(panelMessage, undefined, context.subscriptions);
      panel.onDidDispose(() => (panel = undefined), undefined, context.subscriptions);
    })
  );

  context.subscriptions.push(vscode.commands.registerCommand("lumberjack.refresh", () => refreshAll()));

  // ---- ambient status tile ----
  updateStatus();
  const secs = cfg().get<number>("statusBarRefreshSeconds") ?? 20;
  if (secs > 0) {
    const h = setInterval(updateStatus, secs * 1000);
    context.subscriptions.push({ dispose: () => clearInterval(h) });
  }
}

export function deactivate() {}

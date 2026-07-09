import * as vscode from "vscode";
import * as path from "path";
import { gatherFleet, showAtRef } from "./git";
import { fleetHtml } from "./webview";

// Virtual documents for the historical side of a diff: lumberjack:<path>?repo=…&ref=…
const SCHEME = "lumberjack";

class GitContentProvider implements vscode.TextDocumentContentProvider {
  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const params = new URLSearchParams(uri.query);
    const repo = params.get("repo") ?? "";
    const ref = params.get("ref") ?? "HEAD";
    const file = params.get("file") ?? "";
    if (!repo || !file) return "";
    try {
      return await showAtRef(repo, ref, file);
    } catch {
      return ""; // e.g. the file didn't exist at this ref (added/deleted)
    }
  }
}

function repoRoot(): string | undefined {
  const cfg = vscode.workspace.getConfiguration("lumberjack").get<string>("repoPath");
  if (cfg && cfg.trim()) return cfg.trim();
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function gitUri(repo: string, ref: string, file: string): vscode.Uri {
  const q = new URLSearchParams({ repo, ref, file }).toString();
  // path segment is cosmetic (drives the editor tab label / language mode)
  return vscode.Uri.parse(`${SCHEME}:${file}?${q}`);
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      SCHEME,
      new GitContentProvider()
    )
  );

  let panel: vscode.WebviewPanel | undefined;

  async function sendData() {
    if (!panel) return;
    const repo = repoRoot();
    if (!repo) {
      panel.webview.postMessage({ type: "error", message: "No repo. Open a folder or set lumberjack.repoPath." });
      return;
    }
    const window = vscode.workspace.getConfiguration("lumberjack").get<number>("commitWindow") ?? 14;
    panel.webview.postMessage({ type: "loading" });
    const fleet = await gatherFleet(repo, window);
    panel.webview.postMessage({ type: "data", repo, fleet });
  }

  async function onMessage(msg: any) {
    const repo = repoRoot();
    if (!repo) return;
    if (msg.type === "ready" || msg.type === "refresh") {
      await sendData();
    } else if (msg.type === "openSource") {
      // worktree files are real files on disk — just open them
      const uri = vscode.Uri.file(path.isAbsolute(msg.file) ? msg.file : path.join(msg.cwd ?? repo, msg.file));
      await vscode.window.showTextDocument(uri, { preview: true });
    } else if (msg.type === "diffCommit") {
      // what this commit changed: parent:file  ↔  sha:file
      const left = gitUri(repo, `${msg.sha}^`, msg.file);
      const right = gitUri(repo, msg.sha, msg.file);
      await vscode.commands.executeCommand(
        "vscode.diff", left, right, `${path.basename(msg.file)} @ ${msg.sha.slice(0, 9)}`
      );
    } else if (msg.type === "diffWip") {
      // uncommitted change: HEAD:file (in that worktree)  ↔  the on-disk file
      const left = gitUri(msg.cwd, "HEAD", msg.file);
      const right = vscode.Uri.file(path.join(msg.cwd, msg.file));
      await vscode.commands.executeCommand(
        "vscode.diff", left, right, `${path.basename(msg.file)} (WIP)`
      );
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("lumberjack.open", () => {
      if (panel) {
        panel.reveal();
        return;
      }
      panel = vscode.window.createWebviewPanel(
        "lumberjack",
        "Worktree Fleet",
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      panel.webview.html = fleetHtml();
      panel.webview.onDidReceiveMessage(onMessage, undefined, context.subscriptions);
      panel.onDidDispose(() => (panel = undefined), undefined, context.subscriptions);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("lumberjack.refresh", () => sendData())
  );
}

export function deactivate() {}

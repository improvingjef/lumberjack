import * as vscode from "vscode";
import * as path from "path";
import { gatherFleet, showAtRef } from "./git";
import { fleetHtml } from "./webview";
import * as ops from "./ops";

function salvageBranch(): string {
  return vscode.workspace.getConfiguration("lumberjack").get<string>("salvageBranch") || "salvage";
}

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
    const fleet = await gatherFleet(repo, { window, maxFiles: 80 });
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
    } else if (msg.type === "fell") {
      await fellWorktree(msg);
    }
  }

  // Fell a worktree — undoably. Re-verifies freshness first; deadwood/brush
  // fell instantly, offering Undo (which recreates the tree + branch at the
  // captured SHA). A tree with real work at stake routes through a modal that
  // can Salvage (park the WIP to a preserve branch) & Fell, or Fell anyway.
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
        `Fell ${m.name}?`, { modal: true, detail: `This tree has ${risks.join(" and ")}.` }, ...buttons
      );
      if (!pick) return;
      if (pick === "Salvage & Fell") {
        try {
          const c = await ops.salvage(repo, m.path, salvageBranch(), `salvage: preserve ${m.name} (lumberjack)`);
          vscode.window.showInformationMessage(`Salvaged ${m.name} → ${salvageBranch()} @ ${c.slice(0, 9)}`);
        } catch (e: any) {
          vscode.window.showErrorMessage(`Salvage failed: ${e.message}`);
          return;
        }
      }
    }

    let token: ops.RestoreToken;
    try {
      token = await ops.fell(repo, m.path, branch);
    } catch (e: any) {
      vscode.window.showErrorMessage(`Fell failed: ${e.message}`);
      return;
    }
    panel?.webview.postMessage({ type: "felled", path: m.path });

    const undo = await vscode.window.showInformationMessage(`🪓 Felled ${m.name}`, "Undo");
    if (undo === "Undo") {
      try {
        await ops.unfell(repo, token);
        panel?.webview.postMessage({ type: "restored", path: m.path });
        await sendData();
      } catch (e: any) {
        vscode.window.showErrorMessage(`Undo failed: ${e.message} — the branch may still be at ${token.sha.slice(0, 9)}.`);
      }
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

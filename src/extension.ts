import * as vscode from "vscode";
import * as path from "path";
import { gatherFleet, showAtRef } from "./git";
import { fleetHtml } from "./webview";
import { execFile } from "child_process";

function runGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", ["-C", cwd, ...args], { maxBuffer: 64 * 1024 * 1024 }, (err, out, errout) =>
      err ? reject(new Error(errout || err.message)) : resolve(out ?? "")
    );
  });
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

  // Fell a worktree — undoably. Re-verifies freshness first; only prompts
  // (modal) when there's unmerged work or uncommitted tracked WIP at stake.
  // Otherwise it fells instantly and offers Undo, which recreates the tree +
  // branch at the captured SHA (branch/commits survive in the reflog).
  async function fellWorktree(m: any) {
    const repo = repoRoot();
    if (!repo) return;

    let ahead = 0;
    let porc = "";
    try { ahead = parseInt((await runGit(m.path, ["rev-list", "--count", "master..HEAD"])).trim(), 10) || 0; } catch {}
    try { porc = await runGit(m.path, ["status", "--porcelain"]); } catch {}
    const trackedWip = porc.split("\n").filter(Boolean).some((l) => !l.startsWith("??"));

    if (ahead > 0 || trackedWip) {
      const risks: string[] = [];
      if (ahead > 0) risks.push(`${ahead} commit(s) not on master`);
      if (trackedWip) risks.push(`uncommitted changes that can't be restored`);
      const pick = await vscode.window.showWarningMessage(
        `Fell ${m.name}?`, { modal: true, detail: `This tree has ${risks.join(" and ")}.` }, "Fell anyway"
      );
      if (pick !== "Fell anyway") return;
    }

    // capture restore info from the live tree before it's gone
    let sha: string | undefined = m.sha;
    try { sha = (await runGit(m.path, ["rev-parse", "HEAD"])).trim(); } catch {}
    const branch = m.branch && m.branch !== "(detached)" ? (m.branch as string) : null;

    try {
      await runGit(repo, ["worktree", "remove", "--force", m.path]);
      if (branch) { try { await runGit(repo, ["branch", "-D", branch]); } catch {} }
    } catch (e: any) {
      vscode.window.showErrorMessage(`Fell failed: ${e.message}`);
      return;
    }
    panel?.webview.postMessage({ type: "felled", path: m.path });

    const undo = await vscode.window.showInformationMessage(`🪓 Felled ${m.name}`, "Undo");
    if (undo === "Undo") {
      try {
        if (branch && sha) await runGit(repo, ["worktree", "add", "-b", branch, m.path, sha]);
        else if (sha) await runGit(repo, ["worktree", "add", "--detach", m.path, sha]);
        await sendData();
      } catch (e: any) {
        vscode.window.showErrorMessage(`Undo failed: ${e.message} — the branch may still exist at ${sha?.slice(0, 9)}.`);
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

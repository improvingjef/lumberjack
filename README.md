# 🪓 Lumberjack

**See and tend the forest of git worktrees your agents leave behind.**

When you run a fleet of coding agents, each on its own worktree and branch, the
sprawl gets away from you fast — dozens of worktrees, some with live WIP, some
landed on master, some abandoned, a few hiding a gem. Lumberjack is the glance
tool for that world: one screen tells you the state of every worktree, lets you
drill into what changed, and helps you fell the deadwood.

Built for humans working *with* agents.

## The glance

A three-column view, colored squares carrying the state at a glance:

| square | meaning |
|--------|---------|
| 🔵 blue | uncommitted WIP in the working tree |
| 🔴 red  | a commit on this branch **not** on master |
| 🟢 green | a commit that **is** on master (landed) |

- **Column 1 — the fleet.** One row per worktree: name + a wrapping strip of
  squares, newest first. A branch 3-ahead reads `red red red green green…`; a
  fully-landed worktree is all green; a live one leads with a blue square.
  Sorted attention-first. Below the worktrees, a **branches — no worktree**
  section catches loose branches (the preserve/backup/stash branches a
  worktree view alone can't see).
- **Column 2 — commits.** Select a row → its recent commits with full messages.
- **Column 3 — files.** Select a commit → the files it changed. Click a file
  and it opens in the editor's **native diff** — because the editor already
  *is* the diff viewer and the source viewer, Lumberjack just hands it the
  URIs. WIP files diff against `HEAD`; commit files diff parent-vs-commit.

Live, not a snapshot — hit ↻ (or `Lumberjack: Refresh Fleet`) and it re-reads
git.

## Install / develop

```bash
npm install
npm run compile
# then press F5 in VS Code (Run Extension), or:
code --extensionDevelopmentPath=$PWD
```

Run the command **Lumberjack: Open Worktree Fleet**. By default it surveys the
first workspace folder; point it elsewhere with the `lumberjack.repoPath`
setting.

## Roadmap

- **Actions on the squares** — right-click a worktree → open in new window,
  rebase onto master, park to a preserve branch, or **reap** (remove the
  worktree + delete the merged branch). The reaping logic already exists as
  scripts; the extension will shell out to it.
- **`lj`** — a thin CLI sharing the same core, for the terminal half of the
  workflow: `lj` (status), `lj reap` (fell landed + clean worktrees), `lj reap
  --detritus`. Short by design — you'll type it a lot.
- **Status bar** — `54 worktrees · 3 dirty · 7 ahead`, ambient.
- **Branch hygiene** — surface and sweep loose `backup/*`, `wip/stash-*`, and
  orphaned agent branches.

## Provenance

Lumberjack grew out of a throwaway HTML dashboard for triaging ~100 agent
worktrees in a single repo. It worked well enough that it wanted to be real.

MIT licensed.

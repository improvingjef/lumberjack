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

## `lj` — the CLI

The terminal half, sharing the exact same `git.ts` core as the extension. From
the repo:

```bash
npm run compile
node out/cli.js            # or: npm link  →  lj
```

```
lj                     status table of the fleet (colored squares in your terminal)
lj branches            list loose branches (no worktree)
lj reap                preview landed + fully-clean worktrees to remove
lj reap --go           remove them (worktree dir + merged branch)
lj reap --untracked-ok also reap worktrees dirty ONLY from untracked scratch
lj -C <path>           operate on another repo (default: cwd's repo)
lj help
```

Reaping previews by default; nothing is deleted without `--go`. It never
touches the main worktree or the one you're standing in.

## Roadmap

- **Actions on the squares** — right-click a worktree → open in new window,
  rebase onto master, park to a preserve branch, or **reap** (remove the
  worktree + delete the merged branch). The reaping logic already exists as
  scripts; the extension will shell out to it.
- ~~**`lj`** — a thin CLI sharing the same core.~~ **Landed** — see above.
  Next for it: `lj park <wt>` (park to a preserve branch) and a `lj open <wt>`
  hand-off to the editor.
- **Status bar** — `54 worktrees · 3 dirty · 7 ahead`, ambient.
- **Branch hygiene** — surface and sweep loose `backup/*`, `wip/stash-*`, and
  orphaned agent branches.

## Provenance

Lumberjack grew out of a throwaway HTML dashboard for triaging ~100 agent
worktrees in a single repo. It worked well enough that it wanted to be real.

MIT licensed.

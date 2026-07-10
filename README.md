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

## Felling — fearless because it's undoable

Hover a worktree row and click the 🪓, or select a row and press **`f`**. The
row *falls* — and a toast offers **Undo**. Undo genuinely restores it:
Lumberjack captures the branch + HEAD SHA before removing, so undo runs
`git worktree add -b <branch> <path> <sha>` and the tree, branch, and committed
content all come back (the objects survive in the reflog).

Because it's reversible, deadwood and brush-tangled trees fell **instantly, no
confirmation** — that's the point: cleanup should feel like clearing brush, not
defusing a bomb. The one guard: if a tree has *unmerged commits* or
*uncommitted tracked changes* (real work that a fell can't restore), it routes
through a modal that names exactly what's at stake before it'll proceed.

## `lj` — the CLI

The terminal half, sharing the exact same `git.ts` core as the extension. From
the repo:

```bash
npm run compile
node out/cli.js            # or: npm link  →  lj
```

```
lj                  status table of the fleet (colored squares in your terminal)
lj branches         list loose branches (no worktree)
lj fell             preview the deadwood (landed + clean worktrees) to fell
lj fell --go        fell them (remove worktree + delete merged branch)
lj fell --brush     also fell trees tangled only in untracked brush (scratch)
lj -C <path>        operate on another repo (default: cwd's repo)
lj help
```

**Lexicon.** You **fell** trees (worktrees) and **prune** branches — the verb
is disambiguated by the git noun it acts on, so it stays clear even while it's
cheeky. **Deadwood** is the fellable set (landed + clean); **brush** is
untracked scratch; **salvage** preserves WIP before it's lost.

Felling previews by default; nothing is removed without `--go`. It never
touches the main worktree or the one you're standing in.

## Roadmap

- ~~**Undoable felling**~~ — **landed** (see above). Fell from the fleet with
  🪓 / `f`, `Undo` restores it.
- **More actions on the squares** — open in new window, rebase onto master,
  **salvage** (park WIP to a preserve branch), and **prune** the loose-branch
  understory.
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

# Changelog

All notable changes to **Lumberjack** are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased] — first Marketplace release

The feature set as it stands, gathering toward `0.1.0`:

### The glance
- The stand is a **forest** now, not a fleet — the view, panel, and command
  titles all say so (IDs and the CLI/MCP surface are unchanged).
- Three-column forest view: worktrees + loose branches, colored-square status
  (🔵 WIP · 🔴 off-trunk · 🟢 on-trunk), newest-first, wrapping.
- Sedimented sections — **needs you · uncommitted WIP · deadwood · understory
  (branches)** — with a one-line summary; only "needs you" open by default.
- Breathing WIP, amber **aging** tags for stale gems, a claim (📌) badge.
- Squares cap at WIP + 8 recent commits (`lumberjack.commitWindow`); listed
  commits and files carry relative-age tags (WIP files by mtime).
- Compact **activity-bar** view + an ambient **status-bar** tile.
- **Sort** the panel by recent (host order), name, unmerged commits, or age;
  the live `/` filter matches branch names as well as worktree names.
- **Checkboxes** (or `x` on the cursor row) tick worktrees for a batch bar
  that lands, salvages, or fells the whole selection at once.
- Every column is **labeled and scrollable** — forest · tree (wip + commits) ·
  files — and each carries its own live filter; the fourth view, the diff, is
  the editor's native diff tab.
- **WIP is one pseudo-commit** leading the tree's history — its files show in
  the files view and open as source (uncommitted files aren't a diff).
- **Multi-select like a list**: cmd/ctrl-click toggles, shift-click and
  shift+arrows grow/shrink a range — the checkboxes mirror it either way,
  in the panel AND the activity-bar view. Ticked rows wear a light-blue wash.
- The **commit and file lists multi-select too**: tick commits (WIP included)
  and one *⧉ files of N* verb opens a combined, per-pick-sectioned files view;
  tick files and one *↗ open N* verb opens them all — diffs for commit files,
  source for WIP.
- A focused panel is titled **Worktree: \<name\>**, not Worktree Forest.

### The drill
- Select a worktree → its WIP files (listed first when dirty) → its commits →
  a commit's files → the editor's **native diff / source**. WIP files diff
  against HEAD; commit files parent-vs-commit.
- Opening a worktree from the activity-bar view **focuses** the panel on it —
  no second forest list; `‹ forest` or Esc steps back out.

### The verbs (all reversible or preview-first)
- **Fell** — undoable removal of a worktree + merged branch (🪓 / `f`); Undo
  restores it. Deadwood/brush fell instantly; real WIP routes through a modal.
- **Salvage** — merge a worktree's WIP (tracked + untracked, as its delta from
  HEAD) into a shared preserve branch, without touching the worktree. Clean
  merges just go; a genuine collision opens a folder/file preview naming who
  it collides with, and confirming commits it with conflict markers.
- **Land** — fast-forward the trunk to a ready branch.
- **Integrate** — rebase ready branches onto the trunk and land them; conflicts
  are flagged, never left mid-rebase.
- **Compare** two worktrees; batch **fell-all deadwood** / **salvage-all WIP** /
  **land-all ready** from the section headers.

### The CLI (`lj`) and the swarm
- `lj` status, `lj branches`, `lj fell`, `lj land`, `lj integrate`, `lj compare`,
  `lj tend` (a proposed caretaker sweep), `lj claim` / `lj claims`.
- `lj --json` and `lj who-has <file>` — the fleet as agent-readable data.
- `lj mcp` — an MCP server exposing `fleet_status`, `who_has`, `tend`, `claim`,
  `land`, `salvage` so an IDE agent can see and operate the whole fleet.

### Performance & safety
- Parallel gather, lazy per-commit files, cache-first + background startup warm.
- `assess` fails **closed**; `salvage` uses compare-and-swap; the claims board
  writes under a lock; an unreadable repo errors instead of reporting "clear".
- Strict webview CSP + nonce; MCP validates paths against the fleet.
- Three test tiers (pure unit · real-git integration · VS Code host smoke).

_Pre-release development happened across 0.0.1–0.0.15; the first published
version will be 0.1.0._

# Changelog

All notable changes to **Lumberjack** are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased] — first Marketplace release

The feature set as it stands, gathering toward `0.1.0`:

### The glance
- Three-column fleet view: worktrees + loose branches, colored-square status
  (🔵 WIP · 🔴 off-trunk · 🟢 on-trunk), newest-first, wrapping.
- Sedimented sections — **needs you · uncommitted WIP · deadwood · understory
  (branches)** — with a one-line summary; only "needs you" open by default.
- Breathing WIP, amber **aging** tags for stale gems, a claim (📌) badge.
- Compact **activity-bar** view + an ambient **status-bar** tile.

### The drill
- Select a worktree → its commits → a commit's files → the editor's **native
  diff / source**. WIP files diff against HEAD; commit files parent-vs-commit.

### The verbs (all reversible or preview-first)
- **Fell** — undoable removal of a worktree + merged branch (🪓 / `f`); Undo
  restores it. Deadwood/brush fell instantly; real WIP routes through a modal.
- **Salvage** — park a worktree's WIP (tracked + untracked) onto a shared
  preserve branch for review, without touching the worktree.
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

# 🪓 Lumberjack

**See and tend the forest of git worktrees your agents leave behind.**

When you run a fleet of coding agents, each on its own worktree and branch, the
sprawl gets away from you fast — dozens of worktrees, some with live WIP, some
landed on master, some abandoned, a few hiding a gem. Lumberjack is the glance
tool for that world: one screen tells you the state of every worktree, lets you
drill into what changed, and helps you fell the deadwood.

Built for humans working *with* agents.

<!-- SCREENSHOT: the three-column fleet view. Put a PNG in media/ and reference
     it with an absolute raw-GitHub URL (the Marketplace won't render a
     repo-relative image path):
![Lumberjack fleet view](https://raw.githubusercontent.com/improvingjef/lumberjack/main/media/screenshot-fleet.png)
     A short GIF of felling + Undo would sell it even harder. -->

## Install

**From the Marketplace** (once published):

```
ext install improvingjef.lumberjack
```

Then open the 🪓 in the activity bar, or run **Lumberjack: Open Worktree
Fleet**. By default it surveys the first workspace folder; point it elsewhere
with the `lumberjack.repoPath` setting.

**From source** (development):

```bash
npm install && npm run compile
# press F5 in VS Code (Run Extension), or:  code --extensionDevelopmentPath=$PWD
```

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

## Agents & MCP

Lumberjack is the only thing in the stack that sees the whole swarm at once, so
it can hand that view to the agents too.

- **`lj --json`** — the entire fleet (per-worktree group / ahead / dirty / WIP
  files / claims / commits, plus loose branches and a summary) as structured
  data, in one call.
- **`lj who-has <file>`** — which worktrees have uncommitted changes to a file.
  Call it before editing a shared file to avoid colliding with another agent.
- **`lj mcp`** — run Lumberjack as an [MCP](https://modelcontextprotocol.io)
  server (stdio). An IDE agent then gets tools to *see and operate* the fleet:
  `fleet_status`, `who_has`, `tend`, `claim`, `land`, `salvage`.

Wire it into an MCP client:

```jsonc
// Claude Code:  claude mcp add lumberjack -- lj mcp
// Or a client's mcp.json:
{ "mcpServers": { "lumberjack": { "command": "lj", "args": ["mcp"] } } }
```

## Settings

| setting | default | what it does |
|---|---|---|
| `lumberjack.repoPath` | *(workspace folder)* | the repo whose fleet to survey |
| `lumberjack.trunk` | *(auto: master → main)* | the trunk branch to color/land against |
| `lumberjack.commitWindow` | `14` | recent commits rendered as squares per row |
| `lumberjack.salvageBranch` | `salvage` | the preserve branch salvage appends to |
| `lumberjack.warmOnStartup` | `true` | interrogate the fleet in the background at startup so the first open is instant |
| `lumberjack.cacheFreshnessSeconds` | `15` | how long a warmed cache is trusted before an open re-reads (↻ always forces) |
| `lumberjack.statusBarRefreshSeconds` | `20` | status-tile refresh cadence (`0` disables) |

## Testing

Node's built-in runner (no test framework), in three explicit tiers:

```bash
npm run test:unit    # fast base — no git, no fs, no VS Code (~0.5s)
npm run test:git     # integration — real throwaway git repos (git is the oracle)
npm test             # both
npm run test:integration   # extension host in a real VS Code (@vscode/test-electron)
```

- **Unit (`test/*.test.js`)** — the pure domain core, tested in microseconds:
  - `core.ts` — classification (needs/wip/dead), aging, fell-safety, porcelain
    & worktree-list parsing, sort, summary. The single source of truth; the
    view and the git layer both derive from it.
  - `webview` — the page rendered in jsdom and driven by the exact messages the
    host posts: navigation (a click lands on *that* worktree, collapsed
    sections reveal), the fell/salvage actions, and a fresh CSP nonce per render.
- **Git integration (`test/git/*.test.js`)** — against real repos:
  - `gather` — trunk detection (master/main), coloring, sort, loose branches,
    and that an unreadable repo *errors* rather than reporting an empty fleet.
  - `ops` — the load-bearing safety: `assess` (fails **closed** on any probe
    failure), the **fell → unfell round-trip** (incl. reusing a surviving
    branch, and `unfellMany` reporting failures), `land` (distinct reasons:
    diverged / dirty-tree / trunk-not-checked-out), `salvage` (compare-and-swap,
    history appended), the batch `fellMany` (skips unsafe, honors a configured
    trunk), and `integrate` (rebase-and-land, incl. the cascade flip).
  - `mcp` — the MCP server spoken to over **real stdio JSON-RPC**: handshake,
    `tools/list`, `tools/call`, unknown-method + notification handling, and the
    `worktree_path` fleet-validation that blocks cross-repo writes.
- **Host smoke (`test/integration/`)** — launches a real VS Code, activates,
  asserts commands register and run.

## Roadmap

- ~~**Undoable felling**~~ — **landed**. Fell with 🪓 / `f`, `Undo` restores.
- ~~**Salvage**~~ — **landed** as *Salvage & Fell*: a WIP-bearing tree can park
  its work (tracked + untracked) onto the `salvage` preserve branch before
  felling, so even dirty trees become fearless.
- ~~**Status-bar tile**~~ — **landed**. `🪓 55 · 3 dirty · 7 ahead`, ambient,
  click to open the fleet; refreshes on its own.
- ~~**Activity-bar presence**~~ — **landed**. A 🪓 icon opens a compact
  sidebar Fleet view (squares + counts); click a row to launch the full
  three-column panel. Fell right from the sidebar, too.
- **More actions on the squares** — open in new window, rebase onto master, and
  **prune** the loose-branch understory.
- ~~**`lj`** — a thin CLI sharing the same core.~~ **Landed** — see above.
  Next for it: `lj park <wt>` and `lj open <wt>`.
- **Branch hygiene** — surface and sweep loose `backup/*`, `wip/stash-*`, and
  orphaned agent branches.

## Provenance

Lumberjack grew out of a throwaway HTML dashboard for triaging ~100 agent
worktrees in a single repo. It worked well enough that it wanted to be real.

MIT licensed.

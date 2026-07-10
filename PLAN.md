# Lumberjack — the swarm's shared nervous system

Turning Lumberjack from a human-only dashboard into the fleet's shared
sensory-and-coordination organ: readable by every agent, writable by every
agent, actionable by the human. Ordered so each piece stands on the last.

Discipline: **test-first**. Pure logic lands in `core.ts` (fast unit tier);
git effects in `git.ts`/`ops.ts` (integration tier). Every item green before
the next.

## Phase A — the fleet as data (agent eyes)

- [x] **1. `lj --json`** — serialize the fleet model to a stable schema so any
      agent can `lj status --json` and know the whole fleet in one shell call.
      - `core.fleetJson(fleet, repo)` (pure) + `core.wipPaths` · CLI `--json`.
- [x] **2. `lj who-has <file>`** — collision detection. Which worktrees have a
      file dirty (agents fighting the same file, caught *before* the merge).
      - `core.whoHas(fleet, file)` (pure) · CLI `who-has` (+`--json`).
- [x] **3. claims / manifests** — a per-worktree note ("claiming gramma-w5e;
      touching seam lowering; tests green") in a central store, surfaced on
      rows. The stigmergic blackboard; mirrors the beads claim discipline.
      - `manifest.ts` (central store I/O) · `core.attachClaims` (pure merge) ·
        CLI `lj claim "<note>"` / `lj claims` · shown in webview + json.

## Phase B — the missing verbs (human hands)

- [x] **4. land** — ff-merge a clean-ahead worktree into the trunk. Turns the
      "needs you" section into a review-and-land queue with one action.
      - `ops.land(repo, branch)` (ff-only, refuses on divergence) · UI action
        on `needs` rows + "land all ready" header · CLI `lj land <wt>`.
- [x] **5. compare** — diff two worktrees against each other, for picking a
      winner among rival agent solutions (the tournament pattern).
      - `ops.compareStat(repo, a, b)` · UI "compare with…" → native diff ·
        CLI `lj compare <a> <b>`.

## Phase C — agent hands + autonomy

- [x] **6. MCP server** — `lj mcp` exposes the read model (status/who-has/
      claims) and the safe actions (fell/salvage/land) as MCP tools, so the IDE
      agent operates the fleet natively, not just sees it.
- [x] **7. caretaker** — `lj tend` composes everything into a proposed sweep
      (fell deadwood · flag aging gems · surface collisions · list ready-to-
      land), `--go` to act (safe/undoable only). Plus an agent recipe.
      - `core.tendPlan(fleet)` (pure) · CLI `lj tend [--go]`.

## Notes

- No JSON-in-the-system concern here — this is Lumberjack, a standalone tool;
  structured output is the whole point.
- Claims store lives in `<repo>/.git/lumberjack/` (inside .git, untracked) so
  it never pollutes worktrees or `git status`.
- Every destructive verb stays undoable or preview-first.

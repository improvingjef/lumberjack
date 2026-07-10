// Test harness: spin up throwaway git repos with worktrees in known states.
// Real git is the oracle — the same principle the tool itself runs on.
const { execFileSync } = require("child_process");
const { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } = require("fs");
const { tmpdir } = require("os");
const { join } = require("path");

const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "t@t",
  GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "t@t",
};

function g(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", env: ENV }).trim();
}

/** A repo under a temp parent, with room for sibling worktrees under wt/. */
function makeRepo(trunk = "master") {
  // realpath so paths match what `git worktree list` reports (macOS /var → /private/var)
  const parent = realpathSync(mkdtempSync(join(tmpdir(), "lj-")));
  const dir = join(parent, "repo");
  mkdirSync(dir);
  execFileSync("git", ["init", "-q", "-b", trunk, dir], { env: ENV });
  g(dir, "config", "user.email", "t@t");
  g(dir, "config", "user.name", "Test");
  g(dir, "config", "commit.gpgsign", "false");
  writeFileSync(join(dir, "README.md"), "root\n");
  g(dir, "add", "-A");
  g(dir, "commit", "-q", "-m", "root");
  return { parent, dir };
}

/** Commit a file on the current branch of `dir`; returns the new sha. */
function commit(dir, file, content, msg) {
  writeFileSync(join(dir, file), content);
  g(dir, "add", "-A");
  g(dir, "commit", "-q", "-m", msg);
  return g(dir, "rev-parse", "HEAD");
}

/** Add a worktree on a new branch; returns its path. */
function wt(env, name, branch, ref = "HEAD") {
  const p = join(env.parent, "wt", name);
  mkdirSync(join(env.parent, "wt"), { recursive: true });
  g(env.dir, "worktree", "add", "-q", "-b", branch, p, ref);
  return p;
}

/** Add a detached worktree at a ref; returns its path. */
function wtDetached(env, name, ref) {
  const p = join(env.parent, "wt", name);
  mkdirSync(join(env.parent, "wt"), { recursive: true });
  g(env.dir, "worktree", "add", "-q", "--detach", p, ref);
  return p;
}

function write(p, file, content) { writeFileSync(join(p, file), content); }
function cleanup(env) { try { rmSync(env.parent, { recursive: true, force: true }); } catch {} }

module.exports = { g, makeRepo, commit, wt, wtDetached, write, cleanup, join };

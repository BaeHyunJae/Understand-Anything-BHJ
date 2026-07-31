#!/usr/bin/env node
// Resolves the context every understand-* skill needs before it can do anything:
// the plugin root, the project root (redirected out of a git worktree), the data
// directory, and — with --freshness — whether the knowledge graph has gone stale.
//
// This exists as a Node script rather than a shell block because the skills run on
// platforms with different shells: one reaches the shell through bash, two execute
// PowerShell directly with no bash layer. `node <script>` is spelled identically in
// all of them, while the POSIX test/substitution syntax these routines used is not.
//
// Output is KEY=VALUE lines on stdout, one per line, values unquoted. Read them and
// substitute the absolute paths literally into later commands.
//
// Usage:
//   node <plugin-root>/scripts/ua-context.mjs [--project <path>] [--freshness]

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);

function flagValue(name) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
}

const wantFreshness = args.includes("--freshness");

// The script sits at <plugin root>/scripts/, so the plugin root is one level up.
// Deriving it here is what lets the skills stop maintaining a candidate list.
const PLUGIN_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function git(cwd, ...gitArgs) {
  try {
    return execFileSync("git", ["-C", cwd, ...gitArgs], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

// A worktree's data directory is destroyed with the worktree, taking the graph with
// it, so writes are redirected to the main checkout unless the user opts out.
function resolveProjectRoot(start) {
  const root = resolve(start);
  if (process.env.UNDERSTAND_NO_WORKTREE_REDIRECT === "1") return root;

  const commonDir = git(root, "rev-parse", "--git-common-dir");
  const gitDir = git(root, "rev-parse", "--git-dir");
  if (!commonDir || !gitDir) return root;

  const commonAbs = resolve(root, commonDir);
  const gitAbs = resolve(root, gitDir);
  if (commonAbs === gitAbs) return root;

  const mainRoot = dirname(commonAbs);
  return existsSync(mainRoot) ? mainRoot : root;
}

// The legacy directory wins when it already exists, so existing projects keep
// working with no migration; everything new lands in .ua/.
function resolveDataDir(projectRoot) {
  const legacy = join(projectRoot, ".understand-anything");
  return existsSync(legacy) ? legacy : join(projectRoot, ".ua");
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

const PROJECT_ROOT = resolveProjectRoot(flagValue("--project") ?? process.cwd());
const UA_DIR = resolveDataDir(PROJECT_ROOT);
const graphPath = join(UA_DIR, "knowledge-graph.json");

const out = [
  `PLUGIN_ROOT=${PLUGIN_ROOT}`,
  `PROJECT_ROOT=${PROJECT_ROOT}`,
  `UA_DIR=${UA_DIR}`,
  `GRAPH_EXISTS=${existsSync(graphPath)}`,
];

if (wantFreshness) {
  const meta = readJson(join(UA_DIR, "meta.json"));
  const graph = meta ? null : readJson(graphPath);
  const graphCommitRaw = meta?.gitCommitHash ?? graph?.project?.gitCommitHash ?? "";
  const head = git(PROJECT_ROOT, "rev-parse", "HEAD");

  // Resolve the recorded hash before diffing: a graph written against a commit that
  // no longer exists (rebased, pruned) must degrade to a warning, not an error.
  const graphCommit = graphCommitRaw
    ? git(PROJECT_ROOT, "rev-parse", "--verify", "--end-of-options", `${graphCommitRaw}^{commit}`)
    : "";

  // Every diff is scoped with `-- .`: a commit touching only a sibling project in the
  // same monorepo must not make this graph stale.
  const changed = new Set();
  if (graphCommit && head) {
    for (const line of git(PROJECT_ROOT, "diff", "--name-only", graphCommit, head, "--", ".").split("\n")) {
      if (line) changed.add(line);
    }
  }
  for (const extra of [
    ["diff", "--cached", "--name-only", "--", "."],
    ["diff", "--name-only", "--", "."],
    ["ls-files", "--others", "--exclude-standard", "--", "."],
  ]) {
    for (const line of git(PROJECT_ROOT, ...extra).split("\n")) {
      if (line) changed.add(line);
    }
  }

  // Generated graph artifacts are drift in the data directory, not in the project.
  const dataDirName = UA_DIR.endsWith(".understand-anything") ? ".understand-anything" : ".ua";
  const projectChanges = [...changed].filter(
    (f) => !f.startsWith(`${dataDirName}/`) && f !== dataDirName,
  );

  out.push(
    `GRAPH_COMMIT=${graphCommit || graphCommitRaw || "<none>"}`,
    `GRAPH_COMMIT_RESOLVED=${Boolean(graphCommit)}`,
    `HEAD_COMMIT=${head || "<none>"}`,
    `CHANGED_FILE_COUNT=${projectChanges.length}`,
    `STALE=${projectChanges.length > 0}`,
  );
  for (const file of projectChanges.slice(0, 20)) out.push(`CHANGED=${file}`);
  if (projectChanges.length > 20) out.push(`CHANGED_TRUNCATED=${projectChanges.length - 20}`);
}

process.stdout.write(`${out.join("\n")}\n`);

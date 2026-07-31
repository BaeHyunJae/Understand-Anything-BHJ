#!/usr/bin/env node
// Starts the dashboard dev server for a project's knowledge graph.
//
// The shell form of this was `cd "$DASHBOARD_DIR" && GRAPH_DIR="$PROJECT_DIR" npx vite`,
// which is POSIX-only twice over: the `&&` chain and the inline environment-variable
// prefix. PowerShell has neither, so the working directory and GRAPH_DIR are set here
// and vite is spawned with them already in place.
//
// Usage:
//   node <plugin-root>/scripts/ua-dashboard.mjs [--project <path>] [--host <addr>]

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);

function flagValue(name, fallback = null) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const PLUGIN_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DASHBOARD_DIR = join(PLUGIN_ROOT, "packages", "dashboard");
const PROJECT_ROOT = resolve(flagValue("--project") ?? process.cwd());

if (!existsSync(DASHBOARD_DIR)) {
  process.stderr.write(`Dashboard package not found at ${DASHBOARD_DIR}\n`);
  process.exit(1);
}

// The dev server reads GRAPH_DIR to locate the graph it should serve.
const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["--yes", "vite", "--host", flagValue("--host", "127.0.0.1")],
  {
    cwd: DASHBOARD_DIR,
    env: { ...process.env, GRAPH_DIR: PROJECT_ROOT },
    stdio: "inherit",
  },
);

child.on("exit", (code) => process.exit(code ?? 0));

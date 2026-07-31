#!/usr/bin/env node
// Filesystem and config operations on a project's data directory.
//
// These were shell blocks using `mkdir -p`, `find … -exec`, `rm -rf` and a shell
// function wrapping `node -e`. None of that syntax exists in PowerShell, which is
// the only shell on two of the three platforms these skills run on, so the logic
// lives here instead: `node <script> <subcommand>` is spelled the same everywhere.
//
// Usage:
//   node <plugin-root>/scripts/ua-workspace.mjs init [--project <path>]
//   node <plugin-root>/scripts/ua-workspace.mjs archive-intermediate [--keep <name>]...
//   node <plugin-root>/scripts/ua-workspace.mjs clean-intermediate [--keep <name>]...
//   node <plugin-root>/scripts/ua-workspace.mjs config-set '<json patch>'
//   node <plugin-root>/scripts/ua-workspace.mjs list-files [--limit <n>] [--depth <n>]
//
// Every subcommand resolves the data directory the same way ua-context.mjs does:
// the legacy .understand-anything/ when it already exists, otherwise .ua/.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";

const [subcommand, ...rest] = process.argv.slice(2);

function flagValue(name, fallback = null) {
  const i = rest.indexOf(name);
  return i !== -1 && rest[i + 1] ? rest[i + 1] : fallback;
}

function flagValues(name) {
  const out = [];
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === name && rest[i + 1]) out.push(rest[i + 1]);
  }
  return out;
}

function positional() {
  return rest.filter((a, i) => !a.startsWith("--") && !rest[i - 1]?.startsWith("--"));
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const PROJECT_ROOT = resolve(flagValue("--project") ?? process.cwd());
if (!existsSync(PROJECT_ROOT)) fail(`Project directory not found: ${PROJECT_ROOT}`);

const legacyDir = join(PROJECT_ROOT, ".understand-anything");
const UA_DIR = existsSync(legacyDir) ? legacyDir : join(PROJECT_ROOT, ".ua");
const INTERMEDIATE = join(UA_DIR, "intermediate");
const TMP = join(UA_DIR, "tmp");

const TRASH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function pruneTrash() {
  if (!existsSync(UA_DIR)) return 0;
  let pruned = 0;
  for (const entry of readdirSync(UA_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(".trash-")) continue;
    const path = join(UA_DIR, entry.name);
    try {
      if (Date.now() - statSync(path).mtimeMs > TRASH_MAX_AGE_MS) {
        rmSync(path, { recursive: true, force: true });
        pruned += 1;
      }
    } catch {
      // A trash directory we cannot stat or remove is not worth failing a run over.
    }
  }
  return pruned;
}

// Entries are moved aside rather than deleted so a failed run stays recoverable;
// pruneTrash() is what eventually reclaims the space.
function moveAsideIntermediate(keep) {
  const trash = join(UA_DIR, `.trash-${Date.now()}`);
  mkdirSync(trash, { recursive: true });
  let moved = 0;
  if (existsSync(INTERMEDIATE)) {
    for (const entry of readdirSync(INTERMEDIATE)) {
      if (keep.includes(entry)) continue;
      try {
        renameSync(join(INTERMEDIATE, entry), join(trash, entry));
        moved += 1;
      } catch {
        // Keep going: one locked file must not abandon the rest of the cleanup.
      }
    }
  }
  if (existsSync(TMP)) {
    try {
      renameSync(TMP, join(trash, "tmp"));
    } catch {
      // Same reasoning as above.
    }
  }
  return { trash, moved };
}

switch (subcommand) {
  case "init": {
    mkdirSync(INTERMEDIATE, { recursive: true });
    mkdirSync(TMP, { recursive: true });
    const pruned = pruneTrash();
    process.stdout.write(
      `UA_DIR=${UA_DIR}\nINTERMEDIATE=${INTERMEDIATE}\nTMP=${TMP}\nTRASH_PRUNED=${pruned}\n`,
    );
    break;
  }

  case "archive-intermediate": {
    const { trash, moved } = moveAsideIntermediate(flagValues("--keep"));
    process.stdout.write(`TRASH=${trash}\nMOVED=${moved}\n`);
    break;
  }

  case "clean-intermediate": {
    const keep = flagValues("--keep");
    if (!existsSync(INTERMEDIATE)) {
      process.stdout.write("REMOVED=0\n");
      break;
    }
    let removed = 0;
    if (keep.length === 0) {
      rmSync(INTERMEDIATE, { recursive: true, force: true });
      removed = 1;
    } else {
      for (const entry of readdirSync(INTERMEDIATE)) {
        if (keep.includes(entry)) continue;
        rmSync(join(INTERMEDIATE, entry), { recursive: true, force: true });
        removed += 1;
      }
    }
    process.stdout.write(`REMOVED=${removed}\n`);
    break;
  }

  // Replaces a shell function that wrapped `node -e`. Writes merge into config.json:
  // it holds independent preferences set by different steps and earlier runs, so a
  // whole-file write silently drops the others.
  case "config-set": {
    const patchArg = positional()[0];
    if (!patchArg) fail("config-set needs a JSON object argument");
    let patch;
    try {
      patch = JSON.parse(patchArg);
    } catch {
      fail(`config-set argument is not valid JSON: ${patchArg}`);
    }
    const configPath = join(UA_DIR, "config.json");
    let config = {};
    try {
      config = JSON.parse(readFileSync(configPath, "utf8"));
    } catch {
      // No config yet, or an unreadable one: start from an empty object.
    }
    mkdirSync(UA_DIR, { recursive: true });
    writeFileSync(configPath, `${JSON.stringify({ ...config, ...patch }, null, 2)}\n`);
    process.stdout.write(`CONFIG=${configPath}\n`);
    break;
  }

  // Shallow inventory used to spot entry points before the real scan runs.
  case "list-files": {
    const limit = Number(flagValue("--limit", "100"));
    const maxDepth = Number(flagValue("--depth", "2"));
    const skip = new Set(["node_modules", ".git", "dist", ".ua", ".understand-anything"]);
    const found = [];

    const walk = (dir, depth) => {
      if (found.length >= limit || depth > maxDepth) return;
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (found.length >= limit) return;
        if (skip.has(entry.name)) continue;
        const path = join(dir, entry.name);
        if (entry.isFile()) found.push(relative(PROJECT_ROOT, path));
        else if (entry.isDirectory()) walk(path, depth + 1);
      }
    };

    walk(PROJECT_ROOT, 1);
    process.stdout.write(found.length ? `${found.join("\n")}\n` : "");
    break;
  }

  default:
    fail(
      "Usage: ua-workspace.mjs <init|archive-intermediate|clean-intermediate|config-set|list-files> [options]",
    );
}

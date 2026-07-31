---
name: understand-figma
description: Analyze a Figma file via the Figma REST API and generate an interactive design knowledge graph (pages, screens, components, component sets, instances, design tokens) with a kind:"design" dashboard.
argument-hint: "<figma-file-url-or-key> [--language <lang>]"
disable-model-invocation: true
---

# /understand-figma

Analyzes a Figma file and produces an interactive design knowledge graph in the existing dashboard.

## Prerequisites

- **`FIGMA_TOKEN`** environment variable — a Figma personal access token (create one at https://www.figma.com/settings). If it is missing, STOP and tell the user:
  > Set a Figma token first: create one at figma.com/settings, then `export FIGMA_TOKEN=<token>`.
- Node ≥ 22, pnpm ≥ 10.

> **Security:** the token is read only from the environment and travels only in the `X-Figma-Token` request header. Never write it to the graph, `meta.json`, logs, or intermediate files. This skill makes outbound calls to `api.figma.com` — unlike the "understand" skill, it is not fully offline. Tell the user this once.

## Phase 0 — Pre-flight

1. Parse `$ARGUMENTS` for a Figma URL or bare file key (the non-flag token) and an optional `--language <lang>`.
2. Resolve context. Run the context helper. `<plugin-root>` is the first of these that exists: the value of the runtime's `PLUGIN_ROOT` or `CLAUDE_PLUGIN_ROOT` variable, `~/.understand-anything-plugin`, `~/.claude/skills/understand-anything`, `~/.gemini/config/plugins/understand-anything`.
   ```
   node "<plugin-root>/scripts/ua-context.mjs"
   ```
   It prints `PLUGIN_ROOT`, `PROJECT_ROOT` and `UA_DIR`. Substitute those absolute paths literally into every later command instead of re-deriving them — each phase may run in a fresh shell, and the shells this skill runs under do not share POSIX test and substitution syntax.

   Then ensure core is built. If `<PLUGIN_ROOT>/packages/core/dist/figma/index.js` is missing, run these two commands; `--dir` avoids a directory change to chain:
   ```
   pnpm --dir "<PLUGIN_ROOT>" install
   ```
   ```
   pnpm --dir "<PLUGIN_ROOT>" --filter @understand-anything/core build
   ```
3. Prepare the data directory:
   ```
   node "<PLUGIN_ROOT>/scripts/ua-workspace.mjs" init --project "<PROJECT_ROOT>"
   ```

## Phase 1 — FETCH & PARSE (deterministic)

Run the bundled scan script (`<SKILL_DIR>` is this skill's directory):

```
node "<SKILL_DIR>/figma-scan.mjs" "<PROJECT_ROOT>" "<url-or-key>"
```

`FIGMA_TOKEN` is read from the environment by the script, so it needs no inline assignment — an inline `VAR=value` command prefix is POSIX-only syntax.

It writes `<UA_DIR>/intermediate/scan-manifest.json` and prints the node counts. Relay the counts to the user. If it exits non-zero, relay stderr and STOP.

> If the scan prints `UP_TO_DATE`, report "Design graph is already up to date for this Figma file version" and STOP. To force a full rebuild, re-run with `UNDERSTAND_FIGMA_FORCE=1` set in the environment.

## Phase 2 — ANALYZE (LLM enrichment)

1. Read `scan-manifest.json`. Group nodes into batches of ~15, grouped by page when possible.
2. For each batch, dispatch a subagent using the `design-analyzer` agent definition (`agents/design-analyzer.md`). Pass:
   - the batch of nodes (`id`, `type`, `name`, `figmaMeta`, child names, token usage),
   - the full list of existing node IDs,
   - `$INTERMEDIATE_DIR = <UA_DIR>/intermediate`,
   - the batch number for output naming.
   The agent writes `analysis-batch-<N>.json`.
   Append `$LANGUAGE_DIRECTIVE` if `--language` was provided (reuse the directive text in `<PLUGIN_ROOT>/skills/understand/SKILL.md`).
3. Run up to **5 batches concurrently**. If a batch fails, log a warning and continue — the manifest is a solid base.

## Phase 3 — MERGE

```
node "<SKILL_DIR>/figma-merge.mjs" "<PROJECT_ROOT>"
```

It combines `scan-manifest.json` + `analysis-batch-*.json`, runs `mergeDesignGraph` (validates, re-attaches `kind:"design"`), and writes `knowledge-graph.json` + `meta.json`. Relay the printed stats and any non-`auto-corrected` issues.

## Phase 4 — SAVE & LAUNCH

1. Clean up intermediate files **except** `scan-manifest.json`:
   ```
   node "<PLUGIN_ROOT>/scripts/ua-workspace.mjs" clean-intermediate --project "<PROJECT_ROOT>" --keep scan-manifest.json
   ```
2. Report a summary: project name, counts by node type, edges by type, layers, tour steps, and the path `<UA_DIR>/knowledge-graph.json`.
3. Auto-launch the dashboard: read `<PLUGIN_ROOT>/skills/understand-dashboard/SKILL.md` and execute its instructions directly. Do **not** invoke it as a skill — every skill in this plugin is user-invoked only, so an invocation would not fire.

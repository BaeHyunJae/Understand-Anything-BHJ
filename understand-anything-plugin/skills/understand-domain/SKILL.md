---
name: understand-domain
description: Extract business domain knowledge from a codebase and generate an interactive domain flow graph. Works standalone (lightweight scan) or derives from a knowledge graph an earlier "understand" run produced.
argument-hint: "[--full]"
disable-model-invocation: true
---

# /understand-domain

Extracts business domain knowledge — domains, business flows, and process steps — from a codebase and produces an interactive horizontal flow graph in the dashboard.

## How It Works

- If a knowledge graph already exists (`.ua/knowledge-graph.json`, or the legacy `.understand-anything/knowledge-graph.json` when that directory is present), derives domain knowledge from it (cheap, no file scanning)
- If no knowledge graph exists, performs a lightweight scan: file tree + entry point detection + sampled files
- Use `--full` flag to force a fresh scan even if a knowledge graph exists

## Instructions

### Phase 0 — Resolve context

Run the context helper. `<plugin-root>` is the first of these that exists: the value of the runtime's `PLUGIN_ROOT` or `CLAUDE_PLUGIN_ROOT` variable, `~/.understand-anything-plugin`, `~/.claude/skills/understand-anything`, `~/.gemini/config/plugins/understand-anything`.
```
node "<plugin-root>/scripts/ua-context.mjs" --freshness
```
It prints `PLUGIN_ROOT`, `PROJECT_ROOT`, `UA_DIR`, `GRAPH_EXISTS` and the freshness fields Phase 1 acts on. Substitute those absolute paths literally into every later command instead of re-deriving them — each phase may run in a fresh shell, and the shells this skill runs under do not share POSIX test and substitution syntax.

Two things the helper settles:
- **`PROJECT_ROOT` is worktree-redirected.** A domain graph written inside an ephemeral worktree dies with it (issue #133), so `PROJECT_ROOT` reports the main checkout whenever the current directory is a linked worktree. Set `UNDERSTAND_NO_WORKTREE_REDIRECT=1` in the environment to keep the worktree instead.
- **`UA_DIR` keeps the legacy directory.** `.understand-anything/` wins when it already exists; everything else lands in `.ua/`.

Use `<PROJECT_ROOT>` for every reference to "the current project" below, and `<PLUGIN_ROOT>` for every reference to agent definitions.

### Phase 1: Detect Existing Graph

1. Phase 0's helper already reported `GRAPH_EXISTS`.
2. If the graph exists AND `--full` was NOT passed, act on the freshness fields the helper printed. It compared the graph's recorded commit against `HEAD` and inspected committed and working-tree changes, scoped to this project so a commit touching only a sibling monorepo project does not count, and ignoring the data directory's own generated artifacts:
   - `STALE=true` — warn that domain extraction may omit the `CHANGED=` files it listed. Suggest: run the "understand" skill to refresh the knowledge graph.
   - `GRAPH_COMMIT_RESOLVED=false` — the recorded commit is missing or no longer resolvable. Give a brief best-effort warning and continue; do not block.
   - A hash mismatch alone is not stale. `STALE` is false when the project diff is empty.
3. After that preflight, proceed to Phase 3 (derive from graph).
4. Otherwise, proceed to Phase 2 (lightweight scan). When `--full` is used, skip this preflight because the command performs a fresh scan instead of consuming the existing graph.

### Phase 2: Lightweight Scan (Path 1)

The preprocessing script does NOT produce a domain graph — it produces **raw material** (file tree, entry points, exports/imports) so the domain-analyzer agent can focus on the actual domain analysis instead of spending dozens of tool calls exploring the codebase. Think of it as a cheat sheet: cheap Python preprocessing → expensive LLM gets a clean, small input → better results for less cost.

1. Run the preprocessing script bundled with this skill, passing `<PROJECT_ROOT>` from Phase 0:
   ```
   python "<SKILL_DIR>/extract-domain-context.py" "<PROJECT_ROOT>"
   ```
   This outputs `<UA_DIR>/intermediate/domain-context.json` containing:
   - File tree (respecting `.gitignore`)
   - Detected entry points (HTTP routes, CLI commands, event handlers, cron jobs, exported handlers)
   - File signatures (exports, imports per file)
   - Code snippets for each entry point (signature + first few lines)
   - Project metadata (package.json, README, etc.)
2. Read the generated `domain-context.json` as context for Phase 4
3. Proceed to Phase 4

### Phase 3: Derive from Existing Graph (Path 2)

1. Read `<UA_DIR>/knowledge-graph.json`
2. Format the graph data as structured context:
   - All nodes with their types, names, summaries, and tags
   - All edges with their types (especially `calls`, `imports`, `contains`)
   - All layers with their descriptions
   - Tour steps if available
3. This is the context for the domain analyzer — no file reading needed
4. Proceed to Phase 4

### Phase 4: Domain Analysis

1. Read the domain-analyzer agent prompt from `<PLUGIN_ROOT>/agents/domain-analyzer.md`
2. Dispatch a subagent with the domain-analyzer prompt + the context from Phase 2 or 3
3. The agent writes its output to `<UA_DIR>/intermediate/domain-analysis.json`

### Phase 5: Validate and Save

1. Read the domain analysis output
2. Validate using the standard graph validation pipeline (the schema now supports domain/flow/step types)
3. If validation fails, log warnings but save what's valid (error tolerance)
4. Save to `<UA_DIR>/domain-graph.json`
5. Clean up `<UA_DIR>/intermediate/domain-analysis.json` and `<UA_DIR>/intermediate/domain-context.json`

### Phase 6: Launch Dashboard

1. Auto-launch the dashboard: read `<PLUGIN_ROOT>/skills/understand-dashboard/SKILL.md` and execute its instructions directly. Do **not** invoke it as a skill — every skill in this plugin is user-invoked only, so an invocation would not fire.
2. The dashboard will detect `domain-graph.json` and show the domain view by default

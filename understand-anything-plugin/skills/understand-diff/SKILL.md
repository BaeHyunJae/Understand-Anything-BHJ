---
name: understand-diff
description: Use when you need to analyze git diffs or pull requests to understand what changed, affected components, and risks
disable-model-invocation: true
---

# /understand-diff

Analyze the current code changes against the knowledge graph in the project's data directory (`.ua/knowledge-graph.json`, or the legacy `.understand-anything/knowledge-graph.json` when that directory is present).

## Graph Structure Reference

The knowledge graph JSON has this structure:
- `project` — {name, description, languages, frameworks, analyzedAt, gitCommitHash}
- `nodes[]` — each has {id, type, name, filePath?, summary, tags[], complexity, languageNotes?}
  - Code node types: file, function, class, module, concept
  - Non-code node types: config, document, service, table, endpoint, pipeline, schema, resource
  - Domain/knowledge node types: domain, flow, step, article, entity, topic, claim, source
  - IDs use the node type as prefix, e.g. `file:path`, `function:path:name`, `config:path`, `article:path`
- `edges[]` — each has {source, target, type, direction, weight}
  - Key types: imports, contains, calls, depends_on, configures, documents, deploys, triggers, contains_flow, flow_step, related, cites
- `layers[]` — each has {id, name, description, nodeIds[]}
- `tour[]` — each has {order, title, description, nodeIds[]}

## How to Read Efficiently

1. Use Grep to search within the JSON for relevant entries BEFORE reading the full file
2. Only read sections you need — don't dump the entire graph into context
3. Node names and summaries are the most useful fields for understanding
4. Edges tell you how components connect — follow imports and calls for dependency chains

## Instructions

1. **Resolve context.** Run the context helper. `<plugin-root>` is the first of these that exists: the value of the runtime's `PLUGIN_ROOT` or `CLAUDE_PLUGIN_ROOT` variable, `~/.understand-anything-plugin`, `~/.claude/skills/understand-anything`, `~/.gemini/config/plugins/understand-anything`.
   ```
   node "<plugin-root>/scripts/ua-context.mjs" --freshness
   ```
   It prints `KEY=VALUE` lines: `PLUGIN_ROOT`, `PROJECT_ROOT`, `UA_DIR`, `GRAPH_EXISTS`, and the freshness fields used in step 3. Substitute the printed absolute paths literally into every later command instead of re-deriving them — the shells this skill runs under do not share POSIX test and substitution syntax. If `GRAPH_EXISTS=false`, stop and tell the user to run the "understand" skill first.

2. **Get the changed files list** (do NOT read the graph yet):
   - If on a branch with uncommitted changes: `git diff --name-only`
   - If on a feature branch: `git diff main...HEAD --name-only` (or the base branch)
   - If the user specifies a PR number: get the diff from that PR

3. **Read project metadata and act on graph freshness** — use Grep or Read with a line limit to extract the `"project"` section for context. The freshness comparison is already done: step 1's helper compared the graph's recorded commit against `HEAD` and inspected committed and working-tree changes, scoped to this project so that a commit touching only a sibling monorepo project does not count, and ignoring the data directory's own generated artifacts. Act on what it printed:
   - `STALE=true` — warn before impact analysis that the graph may omit those changes. Suggest: run the "understand" skill to refresh the graph. The changed files are listed as `CHANGED=` lines.
   - `GRAPH_COMMIT_RESOLVED=false` — the recorded commit is missing or no longer resolvable. Give a brief best-effort warning and continue; do not block.
   - A hash mismatch alone is not stale. `STALE` is false when the project diff is empty.

4. **Find nodes for changed files** — for each changed file path, use Grep to search the knowledge graph for:
   - Nodes with matching `"filePath"` values (e.g., `grep "changed/file/path"`)
   - This finds file-level nodes (including non-code types) AND function/class nodes defined in those files
   - Note the `id` values of all matched nodes

5. **Find connected edges (1-hop)** — for each matched node ID, Grep for that ID in the edges to find:
   - What imports or depends on the changed nodes (upstream callers)
   - What the changed nodes import or call (downstream dependencies)
   - These are the "affected components" — things that might break or need updating

6. **Identify affected layers** — Grep for the matched node IDs in the `"layers"` section to determine which architectural layers are touched.

7. **Provide structured analysis**:
   - **Changed Components**: What was directly modified (with summaries from matched nodes)
   - **Affected Components**: What might be impacted (from 1-hop edges)
   - **Affected Layers**: Which architectural layers are touched and cross-layer concerns
   - **Risk Assessment**: Based on node `complexity` values, number of cross-layer edges, and blast radius (number of affected components)
   - Suggest what to review carefully and any potential issues

8. **Write diff overlay for dashboard** — after producing the analysis, write the diff data to `<UA_DIR>/diff-overlay.json` so the dashboard can visualize changed and affected components. The file contains:
   ```json
   {
     "version": "1.0.0",
     "baseBranch": "<the base branch used>",
     "generatedAt": "<ISO timestamp>",
     "changedFiles": ["<list of changed file paths>"],
     "changedNodeIds": ["<node IDs from step 4>"],
     "affectedNodeIds": ["<node IDs from step 5, excluding changedNodeIds>"]
   }
   ```
   After writing, tell the user they can run the "understand-dashboard" skill to see the diff overlay visually.

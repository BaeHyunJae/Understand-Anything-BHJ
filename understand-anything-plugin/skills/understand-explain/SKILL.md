---
name: understand-explain
description: Use when you need a deep-dive explanation of a specific file, function, or module in the codebase
argument-hint: "[file-path]"
disable-model-invocation: true
---

# /understand-explain

Provide a thorough, in-depth explanation of a specific code component.

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
   It prints `KEY=VALUE` lines: `PLUGIN_ROOT`, `PROJECT_ROOT`, `UA_DIR`, `GRAPH_EXISTS`, and the freshness fields below. Substitute the printed absolute paths literally into every later command instead of re-deriving them — the shells this skill runs under do not share POSIX test and substitution syntax. If `GRAPH_EXISTS=false`, stop and tell the user to run the "understand" skill first.

2. **Check graph freshness before using graph-derived context.** The helper already compared the graph's recorded commit against `HEAD` and inspected committed and working-tree changes, scoped to this project so that a commit touching only a sibling monorepo project does not count, and ignoring the data directory's own generated artifacts. Act on what it printed:
   - `STALE=true` — warn before explaining that graph-derived context may omit those changes. Suggest: run the "understand" skill to refresh the graph. The changed files are listed as `CHANGED=` lines.
   - `GRAPH_COMMIT_RESOLVED=false` — the recorded commit is missing or no longer resolvable. Give a brief best-effort warning and continue; do not block.
   - A hash mismatch alone is not stale. `STALE` is false when the project diff is empty.

3. **Find the target node** — use Grep to search the knowledge graph for the component: "$ARGUMENTS"
   - For file paths (e.g., `src/auth/login.ts`): search for `"filePath"` matches
   - For function notation (e.g., `src/auth/login.ts:verifyToken`): search for the function name in `"name"` fields filtered by the file path
   - Note the exact node `id`, `type`, `summary`, `tags`, and `complexity`

4. **Find all connected edges** — Grep for the target node's ID in the edges section:
   - `"source"` matches → things this node calls/imports/depends on (outgoing)
   - `"target"` matches → things that call/import/depend on this node (incoming)
   - Note the connected node IDs and edge types

5. **Read connected nodes** — for each connected node ID from step 4, Grep for those IDs in the nodes section to get their `name`, `summary`, and `type`. This builds the component's neighborhood.

6. **Identify the layer** — Grep for the target node's ID in the `"layers"` section to find which architectural layer it belongs to and that layer's description.

7. **Read the actual source file** — Read the source file at the node's `filePath` for the deep-dive analysis.

8. **Explain the component in context**:
   - Its role in the architecture (which layer, why it exists)
   - Internal structure (functions, classes it contains — from `contains` edges)
   - External connections (what it imports, what calls it, what it depends on — from edges)
   - Data flow (inputs → processing → outputs — from source code)
   - Explain clearly, assuming the reader may not know the programming language
   - Highlight any patterns, idioms, or complexity worth understanding

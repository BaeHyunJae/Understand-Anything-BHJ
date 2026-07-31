---
name: understand-chat
description: Use when you need to ask questions about a codebase or understand code using a knowledge graph
argument-hint: "[query]"
disable-model-invocation: true
---

# /understand-chat

Answer questions about this codebase using the knowledge graph in the project's data directory (`.ua/knowledge-graph.json`, or the legacy `.understand-anything/knowledge-graph.json` when that directory is present).

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
   - `STALE=true` — warn before answering that graph-derived context may omit those changes. Suggest: run the "understand" skill to refresh the graph. The changed files are listed as `CHANGED=` lines.
   - `GRAPH_COMMIT_RESOLVED=false` — the recorded commit is missing or no longer resolvable. Give a brief best-effort warning and continue; do not block.
   - A hash mismatch alone is not stale. `STALE` is false when the project diff is empty.

3. **Read project metadata only** — use Grep or Read with a line limit to extract just the `"project"` section from the top of the file for context (name, description, languages, frameworks).

4. **Search for relevant nodes** — use Grep to search the knowledge graph file for the user's query keywords: "$ARGUMENTS"
   - Search `"name"` fields: `grep -i "query_keyword"` in the graph file
   - Search `"summary"` fields for semantic matches
   - Search `"tags"` arrays for topic matches
   - Note the `id` values of all matching nodes

5. **Find connected edges** — for each matched node ID, Grep for that ID in the `edges` section to find:
   - What it imports or depends on (downstream)
   - What calls or imports it (upstream)
   - This gives you the 1-hop subgraph around the query

6. **Read layer context** — Grep for `"layers"` to understand which architectural layers the matched nodes belong to.

7. **Answer the query** using only the relevant subgraph:
   - Reference specific files, functions, and relationships from the graph
   - Explain which layer(s) are relevant and why
   - Be concise but thorough — link concepts to actual code locations
   - If the query doesn't match any nodes, say so and suggest related terms from the graph

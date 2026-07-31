---
name: understand-onboard
description: Use when you need to generate an onboarding guide for new team members joining a project
disable-model-invocation: true
---

# /understand-onboard

Generate a comprehensive onboarding guide from the project's knowledge graph.

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
   - `STALE=true` — warn before generating the guide that onboarding content may omit those changes. Suggest: run the "understand" skill to refresh the graph. The changed files are listed as `CHANGED=` lines.
   - `GRAPH_COMMIT_RESOLVED=false` — the recorded commit is missing or no longer resolvable. Give a brief best-effort warning and continue; do not block.
   - A hash mismatch alone is not stale. `STALE` is false when the project diff is empty.

3. **Read project metadata** — use Grep or Read with a line limit to extract the `"project"` section (name, description, languages, frameworks).

4. **Read layers** — Grep for `"layers"` to get the full layers array. These define the architecture and will structure the guide.

5. **Read the tour** — Grep for `"tour"` to get the guided walkthrough steps. These provide the recommended learning path.

6. **Read file-level structural nodes only** — use Grep to find nodes with file-level types (`file`, `config`, `document`, `service`, `pipeline`, `table`, `schema`, `resource`, `endpoint`) in the knowledge graph. Skip function-level and class-level nodes to keep the guide high-level. Extract each node's `name`, `filePath`, `summary`, and `complexity`.

7. **Identify complexity hotspots** — from the file-level nodes, find those with the highest `complexity` values. These are areas new developers should approach carefully.

8. **Generate the onboarding guide** with these sections:
   - **Project Overview**: name, languages, frameworks, description (from project metadata)
   - **Architecture Layers**: each layer's name, description, and key files (from layers + file nodes)
   - **Key Concepts**: important patterns and design decisions (from node summaries and tags)
   - **Guided Tour**: step-by-step walkthrough (from the tour section)
   - **File Map**: what each key file does (from file-level nodes, organized by layer)
   - **Complexity Hotspots**: areas to approach carefully (from complexity values)

9. Format as clean markdown
10. Offer to save the guide to `docs/ONBOARDING.md` in the project
11. Suggest the user commit it to the repo for the team

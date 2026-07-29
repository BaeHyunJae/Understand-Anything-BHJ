# Understand Anything

## Project Overview
An open-source tool combining LLM intelligence + static analysis to produce interactive dashboards for understanding codebases.

## Prerequisites
- Node.js >= 22 (developed on v24)
- pnpm >= 10 (pinned via `packageManager` field in root `package.json`)

## Architecture
- **Monorepo** with pnpm workspaces
- **understand-anything-plugin/** — Claude Code plugin containing all source code:
  - **packages/core** — Shared analysis engine (types, persistence, tree-sitter, search, schema, tours, plugins)
  - **packages/dashboard** — React + TypeScript web dashboard (React Flow, Zustand, TailwindCSS v4)
  - **src/** — Skill TypeScript source for `/understand-chat`, `/understand-diff`, `/understand-explain`, `/understand-onboard`
  - **skills/** — Skill definitions (`/understand`, `/understand-dashboard`, etc.)
  - **agents/** — Agent definitions (project-scanner, file-analyzer, architecture-analyzer, tour-builder, graph-reviewer)

## Dashboard
- Dark luxury theme: deep blacks (#0a0a0a), gold/amber accents (#d4a574), DM Serif Display typography
- Graph-first layout: 75% graph + 360px right sidebar
- No ChatPanel or Monaco Editor
- Sidebar tabs: `Info` (ProjectOverview default → NodeInfo when node selected → LearnPanel in Learn persona, composing) and `Files` (FileExplorer tree built from the structural graph)
- Code viewer: prism-react-renderer source viewer that slides up from the bottom on file node click; an expand button promotes it into a full-screen modal. Source content is fetched from the dev server's `/file-content.json` endpoint, gated by access token + a graph-derived path allowlist
- Schema validation on graph load with error banner

## Agent Pipeline
- Agents write intermediate results to the data directory's `intermediate/` subdirectory on disk (not returned to context) — `.ua/intermediate/`, or `.understand-anything/intermediate/` when that legacy directory is present
- Agent model field is omitted from frontmatter so each platform falls back to its configured default — `inherit` was a Claude Code-only keyword that opencode (and similar tools) treated as a literal model id and rejected with `ProviderModelNotFoundError` (see #167)
- After completion `/understand` launches the dashboard by **reading `$PLUGIN_ROOT/skills/understand-dashboard/SKILL.md` and executing its instructions** — not by invoking the skill. All skills carry `disable-model-invocation: true` (Codex: `agents/openai.yaml` → `policy.allow_implicit_invocation: false`), so a skill invocation would not fire. Reading by path also behaves identically on platforms whose skill-invocation semantics differ from Claude's.
- Intermediate files cleaned up after graph assembly

## Key Commands
- `pnpm install` — Install all dependencies
- `pnpm --filter @understand-anything/core build` — Build the core package
- `pnpm --filter @understand-anything/core test` — Run core tests
- `pnpm --filter @understand-anything/skill build` — Build the plugin package
- `pnpm test` — Run all tests (skill tests live at repo-root `tests/skill/`, picked up by root `vitest.config.ts`)
- `pnpm --filter @understand-anything/dashboard build` — Build the dashboard
- `pnpm dev:dashboard` — Start dashboard dev server
- `pnpm lint` — Run ESLint across the project

## Conventions
- TypeScript strict mode everywhere
- Vitest for testing
- ESM modules (`"type": "module"`)
- Knowledge graph JSON lives in the analyzed project's data directory: `.ua/` for new projects, or the legacy `.understand-anything/` directory when it already exists (if `.understand-anything/` is present it is used for both reads and writes; otherwise `.ua/`). All bundled scripts and core code self-resolve this rule.
- Core uses subpath exports (`./search`, `./types`, `./schema`) to avoid pulling Node.js modules into browser

## Gotchas
- **tree-sitter**: Uses `web-tree-sitter` (WASM) instead of native `tree-sitter` — native bindings fail on darwin/arm64 + Node 24
- **Dashboard imports**: Dashboard must only import from core's browser-safe subpath exports (`./search`, `./types`, `./schema`), never the main entry point which pulls in Node.js modules

## Scripts
- `scripts/generate-large-graph.mjs` — Generates a fake knowledge graph for performance testing (e.g. large-graph layout). Writes to the project data directory's `knowledge-graph.json` (`.ua/knowledge-graph.json`, or `.understand-anything/` when that legacy directory is present). Usage: `node scripts/generate-large-graph.mjs [nodeCount]` (default: 3000 nodes). Not part of the production pipeline.

## Viewer Package
`packages/viewer` serves a committed graph without Claude Code, via `npx <release-asset-url>`. Update it when (a) the dashboard UI changes — the tarball embeds the built `dist/` — or (b) the `vite.config.ts` dev-server middleware changes, which `bin/viewer.mjs` deliberately mirrors. On every release, repack (`pack:release` script) and re-upload the tarball to the GitHub release as `understand-anything-viewer.tgz` — exactly that name, the READMEs' `releases/latest/download/` URL depends on it.

## Versioning
When pushing to remote, bump the version in **all six** of these files (keep them in sync):
- `understand-anything-plugin/package.json` → `"version"` field
- `understand-anything-plugin/.claude-plugin/plugin.json` → `"version"` field
- `understand-anything-plugin/packages/viewer/package.json` → `"version"` field
- `.claude-plugin/plugin.json` → `"version"` field
- `.cursor-plugin/plugin.json` → `"version"` field
- `.copilot-plugin/plugin.json` → `"version"` field

Note: `.claude-plugin/marketplace.json` does **not** carry a version — the `plugins[]` entry only supports `name` and `source`, and adding other fields causes marketplace schema validation failures.

## Testing Local Plugin Changes

This fork is installed by **linking**, not by copying, so edits to this checkout are live everywhere at once. Each platform's skill root holds links back into this working tree:

| Platform | Link target | Gets |
|---|---|---|
| Claude Code | `~/.claude/skills/understand-anything` → `understand-anything-plugin/` | skills + agents + hooks |
| Codex | `~/.codex/skills/understand*` → `skills/<name>/` (per skill) | skills |
| Antigravity | `~/.gemini/config/skills/understand*` → `skills/<name>/` (per skill) | skills |
| all | `~/.understand-anything-plugin` → `understand-anything-plugin/` | `$PLUGIN_ROOT` fallback (§ Phase 0) |

To test a local change:

1. **Edit the source in this checkout.** SKILL.md / agent / hook edits need no build step.
2. **Rebuild only if TypeScript changed:**
   ```bash
   pnpm --filter @understand-anything/core build
   pnpm --filter @understand-anything/skill build
   ```
3. **Start a fresh session** — existing sessions hold the old prompts in context.
4. **Run `/understand --full`** in the target project to verify.

**Notes on linking:**
- Use **symlinks**, not junctions. Antigravity's skill scanner skips junctions but follows symlinks; Claude Code and Codex accept either. On Windows, creating a symlink requires Developer Mode (Settings → System → For developers) or an elevated shell.
- Do **not** hard-link the skill files. Hard links resolve to their own location, which breaks the `PLUGIN_ROOT = dirname(__filename)/../..` derivation in the bundled `.mjs` scripts; symlinks resolve through to this checkout, so the derivation stays correct.
- Do **not** install this fork through the Claude Code marketplace. `/plugin install` copies the payload into `~/.claude/plugins/cache/`, which reintroduces a second copy and (on Windows without Developer Mode) fails while recreating the pnpm workspace symlinks.

**To revert to upstream:** point the `origin` remote back at the upstream repository and reset, or remove the links above and install the published plugin from the marketplace.

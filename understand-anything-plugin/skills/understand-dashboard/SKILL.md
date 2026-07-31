---
name: understand-dashboard
description: Launch the interactive web dashboard to visualize a codebase's knowledge graph
argument-hint: "[project-path]"
disable-model-invocation: true
---

# /understand-dashboard

Start the Understand Anything dashboard to visualize the knowledge graph for the current project.

## Instructions

1. **Resolve context.** Run the context helper. `<plugin-root>` is the first of these that exists: the value of the runtime's `PLUGIN_ROOT` or `CLAUDE_PLUGIN_ROOT` variable, `~/.understand-anything-plugin`, `~/.claude/skills/understand-anything`, `~/.gemini/config/plugins/understand-anything`. Pass `--project` only when `$ARGUMENTS` carries a path; otherwise the current working directory is used.
   ```
   node "<plugin-root>/scripts/ua-context.mjs" --project "<path from $ARGUMENTS>"
   ```
   It prints `PLUGIN_ROOT`, `PROJECT_ROOT`, `UA_DIR` and `GRAPH_EXISTS`. Substitute those absolute paths literally into every command below — do not re-derive them with shell tests, because the shells this skill runs under do not share POSIX test and substitution syntax. If the helper exits non-zero, the project directory does not exist: report the path and stop.

2. **Require a graph.** If `GRAPH_EXISTS=false`, tell the user and stop:
   ```
   No knowledge graph found. Run the "understand" skill first to analyze this project.
   ```

3. **Try the prebuilt viewer first (no install, no build).** Each release ships a self-contained viewer tarball; run it pinned to the installed plugin version. Read the version from `<PLUGIN_ROOT>/package.json` and substitute it into the URL:
   ```
   npx --yes "https://github.com/Egonex-AI/Understand-Anything/releases/download/v<PLUGIN_VERSION>/understand-anything-viewer.tgz" "<PROJECT_ROOT>"
   ```
   Run this in the background. It prints the same `🔑  Dashboard URL` line as the dev server:
   - If the line appears, **skip steps 4-5** and continue at step 6.
   - If the process exits without printing it (no release asset for this version, or no network), fall back to steps 4-5.

4. **Fallback: install and build.** `--dir` keeps this a single command per shell, with no directory change to chain:
   ```
   pnpm --dir "<PLUGIN_ROOT>/packages/dashboard" install
   ```
   ```
   pnpm --dir "<PLUGIN_ROOT>" --filter @understand-anything/core build
   ```
   Prefer `pnpm --dir "<PLUGIN_ROOT>/packages/dashboard" install --frozen-lockfile` first, and retry without the flag if the lockfile is out of date.

5. **Fallback: start the dev server.** The launcher sets the dashboard's working directory and the `GRAPH_DIR` the server reads, so no inline environment-variable prefix is needed:
   ```
   node "<PLUGIN_ROOT>/scripts/ua-dashboard.mjs" --project "<PROJECT_ROOT>"
   ```
   Run this in the background so the user can continue working.

6. **Capture the access token URL from the server output.** The server (viewer or Vite) prints a line like:
   ```
   🔑  Dashboard URL: http://127.0.0.1:<PORT>?token=<TOKEN>
   ```
   Extract the full URL including the `?token=` parameter. The token is required to access the knowledge graph data — without it the dashboard will show an "Access Token Required" gate.

7. Report to the user, including the full tokenized URL:
   ```
   Dashboard started at http://127.0.0.1:<PORT>?token=<TOKEN>
   Viewing: <UA_DIR>/knowledge-graph.json

   The dashboard is running in the background. Press Ctrl+C in the terminal to stop it.
   ```
   **Important:** Always include the `?token=` parameter in the URL you share. If you omit it, the user will be blocked by the token gate and have to manually find the token in the terminal output.

## Notes

- The fast path (step 3) downloads a version-pinned, self-contained viewer from the GitHub release — nothing is installed into the plugin directory and no build runs
- The dashboard auto-opens in the default browser (both the viewer and Vite's `--open`)
- If port 5173 is already in use, the next available port is picked (both paths)
- In the fallback, `scripts/ua-dashboard.mjs` sets the `GRAPH_DIR` the dev server reads to locate the knowledge graph

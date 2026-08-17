import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

function readRepoFile(relPath) {
  return readFileSync(resolve(repoRoot, relPath), 'utf-8');
}

describe('skill command hardening', () => {
  it('quotes PROJECT_ROOT in shell command snippets', () => {
    const files = [
      'understand-anything-plugin/skills/understand/SKILL.md',
      'understand-anything-plugin/hooks/auto-update-prompt.md',
    ];

    const unsafePatterns = [
      /\b(?:node|python|python3|mkdir|find|rm|cat)\s+(?:-[^\n]*\s+)*\$PROJECT_ROOT\b/,
      />\s*\$PROJECT_ROOT\b/,
      /--changed-files=\$PROJECT_ROOT\b/,
      /rm\s+-rf\s+\$PROJECT_ROOT\b/,
    ];

    for (const relPath of files) {
      const content = readRepoFile(relPath);
      for (const pattern of unsafePatterns) {
        expect(content, `${relPath} should not contain ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('quotes skill and target directory placeholders in knowledge commands', () => {
    const content = readRepoFile('understand-anything-plugin/skills/understand-knowledge/SKILL.md');

    expect(content).not.toMatch(/python3\s+<SKILL_DIR>\/[^\n]+ <TARGET_DIR>/);
    expect(content).not.toMatch(/rm\s+-rf\s+<TARGET_DIR>/);
  });

  it('does not rewrite metadata for generated-only commits', () => {
    const content = readRepoFile(
      'understand-anything-plugin/hooks/auto-update-prompt.md',
    );

    expect(content).toMatch(
      /Before filtering by extension, remove every path under the selected `\$UA_DIR`/,
    );
    expect(content).toMatch(
      /If no paths remain after removing `\$UA_DIR`[\s\S]*without writing `meta\.json`/,
    );
  });

  it('does not stamp metadata when the stored commit is unreachable', () => {
    const content = readRepoFile(
      'understand-anything-plugin/hooks/auto-update-prompt.md',
    );

    // An unreachable stored commit makes `git diff` exit non-zero with empty
    // output, which reading the output alone cannot tell apart from "no changes".
    expect(content).toMatch(/Check the exit status before reading the output/);
    expect(content).toMatch(
      /Non-zero exit:[\s\S]*Do \*\*not\*\* write `meta\.json`/,
    );
    expect(content).toMatch(/Exit 0 with no files changed/);
  });

  it('patches the fingerprint store under its files key, before writing meta', () => {
    const content = readRepoFile(
      'understand-anything-plugin/hooks/auto-update-prompt.md',
    );

    // The store is nested; patching its top level leaves the real map untouched.
    expect(content).toMatch(/The store is NOT a flat path→fingerprint map/);
    expect(content).toMatch(/const all = store\.files;/);
    expect(content).toMatch(/writeFileSync\(fpPath, JSON\.stringify\(store, null, 2\)\)/);
    expect(content).not.toMatch(/writeFileSync\(fpPath, JSON\.stringify\(all, null, 2\)\)/);

    // Entries carry the whole FileFingerprint shape core declares.
    expect(content).toMatch(/hasStructuralAnalysis: false/);
    expect(content).toMatch(/totalLines: content\.split\('\\n'\)\.length/);

    // meta.json is written after the fingerprint save, so analyzedFiles can quote it.
    const fingerprintAt = content.indexOf('Update fingerprints (LOAD-PATCH-SAVE');
    const metaAt = content.indexOf('Write updated metadata to `$UA_DIR/meta.json`');
    expect(fingerprintAt).toBeGreaterThan(-1);
    expect(metaAt).toBeGreaterThan(fingerprintAt);
    expect(content).toMatch(/"analyzedFiles": <number of entries in the `files` map/);
  });

  it('sweeps tmp/ into the trash and purges it on a later run', () => {
    const content = readRepoFile(
      'understand-anything-plugin/hooks/auto-update-prompt.md',
    );

    // file-analyzer batches land in tmp/, so a cleanup that only takes
    // intermediate/ leaves them to accumulate on every run.
    expect(content).toMatch(/mv "\$UA_DIR\/tmp" "\$TRASH\/"/);
    expect(content).toMatch(/-not -name 'scan-result\.json'/);
    expect(content).not.toMatch(/rm -rf "\$INTERMEDIATE_DIR"/);

    // Moving instead of deleting needs the delayed purge, or the trash grows forever.
    expect(content).toMatch(
      /find "\$UA_DIR\/" -maxdepth 1 -type d -name '\.trash-\*' -mtime \+7/,
    );
  });

  it('quotes dashboard cd targets and GRAPH_DIR assignment', () => {
    const content = readRepoFile('understand-anything-plugin/skills/understand-dashboard/SKILL.md');

    expect(content).not.toMatch(/<(?:dashboard-dir|plugin-root|project-dir)>/);
    expect(content).not.toMatch(/\bcd <(?:dashboard-dir|plugin-root)>/);
    expect(content).not.toMatch(/GRAPH_DIR=<project-dir>/);
    expect(content).toMatch(/PROJECT_DIR=\$\(pwd -P\)/);
    expect(content).toMatch(/UA_DIR="\$PROJECT_DIR\/\.understand-anything"/);
    expect(content).toMatch(/\[ ! -f "\$UA_DIR\/knowledge-graph\.json" \]/);
    expect(content).toMatch(/DASHBOARD_DIR="\$PLUGIN_ROOT\/packages\/dashboard"/);
    expect(content).toMatch(/: "\$\{PLUGIN_ROOT:\?Run step 3 first so PLUGIN_ROOT is set\}"/);
    expect(content).toMatch(/: "\$\{PROJECT_DIR:\?Run step 1 first so PROJECT_DIR is set\}"/);
    expect(content).toMatch(/: "\$\{DASHBOARD_DIR:\?Run step 5 first so DASHBOARD_DIR is set\}"/);
    expect(content).toMatch(/cd "\$PLUGIN_ROOT" && pnpm --filter @understand-anything\/core build/);
    expect(content).toMatch(/cd "\$DASHBOARD_DIR" && GRAPH_DIR="\$PROJECT_DIR" npx vite/);
    // Fast path: the viewer URL is version-pinned and both npx arguments are quoted.
    expect(content).toMatch(/VIEWER_URL="https:\/\/github\.com\/Egonex-AI\/Understand-Anything\/releases\/download\/v\$\{PLUGIN_VERSION\}\/understand-anything-viewer\.tgz"/);
    expect(content).toMatch(/npx --yes "\$VIEWER_URL" "\$PROJECT_DIR"/);
  });

  it('marks project-controlled context as untrusted data', () => {
    const understand = readRepoFile('understand-anything-plugin/skills/understand/SKILL.md');
    const knowledge = readRepoFile('understand-anything-plugin/skills/understand-knowledge/SKILL.md');

    expect(understand).not.toMatch(/README and manifest are authoritative/i);
    expect(understand).toMatch(/untrusted project data/i);
    expect(knowledge).toMatch(/untrusted article data/i);
  });
});

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const docsRoot = fileURLToPath(new URL('..', import.meta.url));

const walkMarkdown = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '.vitepress' || entry.name === 'node_modules') {
      return [];
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walkMarkdown(path);
    return entry.name.endsWith('.md') ? [path] : [];
  });

const retiredApiPatterns = [
  /\bcraft\s*\(/,
  /\bcraftMutations\b/,
  /\bcraftMutation\b/,
  /\bcraftQuery\b/,
  /\bcraftState\b/,
  /\bcraftSources\b/,
  /\bcraftInputs\b/,
  /\bcraftComputedStates\b/,
  /\bcraftAsyncProcesses\b/,
  /\bcraftInject\b/,
  /\bcraftQueryParams\b/,
  /\bcraftSetAllQueriesParamsStandalone\b/,
];

describe('documentation API vocabulary', () => {
  it('does not publish removed store-composition APIs', () => {
    const staleReferences = walkMarkdown(docsRoot).flatMap((path) => {
      const content = readFileSync(path, 'utf8');
      return retiredApiPatterns
        .filter((pattern) => pattern.test(content))
        .map((pattern) => `${path}: ${pattern}`);
    });

    expect(staleReferences).toEqual([]);
  });
});

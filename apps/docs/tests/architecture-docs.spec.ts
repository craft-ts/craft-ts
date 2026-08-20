import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const architectureDocsRoot = fileURLToPath(
  new URL('../guide/testing/architecture', import.meta.url),
);

const architecturePages = readdirSync(architectureDocsRoot)
  .filter((name) => name.endsWith('.md'))
  .sort();

describe('architecture rule documentation', () => {
  it('shows a tested TypeScript snippet on every rule page', () => {
    const missing = architecturePages.flatMap((page) => {
      const pagePath = join(architectureDocsRoot, page);
      const pageContent = readFileSync(pagePath, 'utf8');
      const snippetName = `${basename(page, '.md')}.spec.ts`;
      const expectedImport =
        `<<< @/tests/snippets/guide/testing/architecture/${snippetName}#example`;

      return pageContent.includes(expectedImport) ? [] : [page];
    });

    expect(missing).toEqual([]);
  });
});

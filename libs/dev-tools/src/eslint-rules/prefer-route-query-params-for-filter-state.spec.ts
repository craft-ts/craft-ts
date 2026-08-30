import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./prefer-route-query-params-for-filter-state.cjs');

describe('prefer-route-query-params-for-filter-state', () => {
  it('reports component-local filter state', async () => {
    const messages = await lint(`
      import { state } from '@craft-ts/core';

      const selectedFilter = state('selectedFilter', 'all');
    `);

    expect(messages).toEqual([
      "'selectedFilter' looks like filter state. Declare it with route-level queryParams and feed the query reactively instead of keeping it in state().",
    ]);
  });

  it('allows unrelated local UI state and route queryParams', async () => {
    const messages = await lint(`
      import { state, queryParams } from '@craft-ts/core';

      const panelState = state('panelState', 'closed');
      const routeFilters = queryParams('filters', { state: {} });
    `);

    expect(messages).toEqual([]);
  });
});

async function lint(source: string): Promise<string[]> {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        },
        plugins: { local: { rules: { rule: rule as never } } },
        rules: { 'local/rule': 'error' },
      },
    ],
  });

  const [result] = await eslint.lintText(source, { filePath: 'fixture.ts' });
  return result.messages.map((message) => message.message);
}

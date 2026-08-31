import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./prefer-route-query-params-for-filter-state.cjs');

describe('prefer-route-query-params-for-filter-state', () => {
  it('reports state directly used as query params', async () => {
    const messages = await lint(`
      import { state } from '@craft-ts/core';
      import { query } from '@craft-ts/core';

      const selectedFilter = state('selectedFilter', 'all');
      query('users', { params: selectedFilter, loader: loadUsers });
    `);

    expect(messages).toEqual([
      "Resource params for query(...) depend on state 'selectedFilter'. Prefer queryParams(...) for values that should survive reloads and be represented in the URL.",
    ]);
  });

  it('reports a combination of state values through a local computed', async () => {
    const messages = await lint(`
      import { craftComputed, query, state } from '@craft-ts/core';

      const search = state('search', '');
      const page = state('page', 1);
      const params = craftComputed('params', () => ({
        search: search(),
        page: page(),
      }));
      query('users', { params, loader: loadUsers });
    `);

    expect(messages).toEqual([
      "Resource params for query(...) depend on state 'page, search'. Prefer queryParams(...) for values that should survive reloads and be represented in the URL.",
    ]);
  });

  it('reports asyncProcess params and allows unrelated state or queryParams', async () => {
    const messages = await lint(`
      import { asyncProcess, queryParams, state } from '@craft-ts/core';

      const panelState = state('panelState', 'closed');
      const search = state('search', '');
      const routeFilters = queryParams('filters', { state: {} });
      asyncProcess('search', {
        params: () => search(),
        loader: runSearch,
      });
      query('users', { params: routeFilters, loader: loadUsers });
    `);

    expect(messages).toEqual([
      "Resource params for asyncProcess(...) depend on state 'search'. Prefer queryParams(...) for values that should survive reloads and be represented in the URL.",
    ]);
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

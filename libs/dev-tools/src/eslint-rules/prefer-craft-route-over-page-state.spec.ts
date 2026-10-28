import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rule = require('./prefer-craft-route-over-page-state.cjs');
const plugin = require('./index.cjs');

const MESSAGE =
  "State 'page' stores a page-like string. If it selects which app page is shown, use provideCraftRouter(...) and CraftRouterOutlet(); keep local state for pagination or page-specific UI state.";

describe('prefer-craft-route-over-page-state', () => {
  it('is a warning in the recommended preset used by generated apps', () => {
    expect(plugin.rules['prefer-craft-route-over-page-state']).toBe(rule);
    expect(
      plugin.configs.recommended.rules[
        'craft-ts/prefer-craft-route-over-page-state'
      ],
    ).toBe('warn');
  });

  it('warns on page-named string state and explicit string unions', async () => {
    expect(
      await lintText(`
        import { state } from '@craft-ts/core';
        const currentPage = state('page', 'sessions');
        const pageBridge = createStateBridge<'sessions' | 'detail'>('page', 'sessions');
      `),
    ).toEqual([MESSAGE, MESSAGE]);
  });

  it('leaves numeric pagination and other page-local state alone', async () => {
    expect(
      await lintText(`
        import { state } from '@craft-ts/core';
        const pageNumber = state('page', 1);
        const tab = state('tab', 'details');
      `),
    ).toEqual([]);
  });
});

async function lintText(source: string): Promise<string[]> {
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
        rules: { 'local/rule': 'warn' },
      },
    ],
  });

  const [result] = await eslint.lintText(source, { filePath: 'fixture.ts' });
  return result.messages.map((message) => message.message);
}

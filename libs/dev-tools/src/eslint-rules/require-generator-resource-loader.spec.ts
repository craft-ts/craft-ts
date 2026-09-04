import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./require-generator-resource-loader.cjs');

describe('require-generator-resource-loader', () => {
  it('reports non-generator loaders for core async resources', async () => {
    const messages = await lint(`
      import { asyncProcess, mutation, query } from '@craft-ts/core';

      query('todos', {
        params: () => 'all',
        loader: ({ params }) => Promise.resolve(params),
      });

      mutation('save', {
        method: (value: string) => value,
        loader: async ({ params }) => params,
      });

      asyncProcess('refresh', {
        method: () => undefined,
        loader: function () { return undefined; },
      });
    `);

    expect(messages).toEqual([
      'Resource loaders must be generator functions: a plain or async return hides remote dependencies from the resource lifecycle and can lose cancellation and exception tracking. Use function* and yield* Craft utilities such as CraftHttpClient, CraftBinaryHttpClient, or craftSleep.',
      'Resource loaders must be generator functions: a plain or async return hides remote dependencies from the resource lifecycle and can lose cancellation and exception tracking. Use function* and yield* Craft utilities such as CraftHttpClient, CraftBinaryHttpClient, or craftSleep.',
      'Resource loaders must be generator functions: a plain or async return hides remote dependencies from the resource lifecycle and can lose cancellation and exception tracking. Use function* and yield* Craft utilities such as CraftHttpClient, CraftBinaryHttpClient, or craftSleep.',
    ]);
  });

  it('allows generator loaders and does not affect effect resources', async () => {
    const messages = await lint(`
      import { mutation, query } from '@craft-ts/core';
      import { queryEffect } from '@craft-ts/effect';

      query('todos', {
        params: () => 'all',
        loader: function* ({ params }) { return params; },
      });

      mutation('save', {
        method: (value: string) => value,
        loader: function* ({ params }) { return params; },
      });

      queryEffect('effectTodos', {
        method: () => 'all',
        loader: ({ params }) => Promise.resolve(params),
      });
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

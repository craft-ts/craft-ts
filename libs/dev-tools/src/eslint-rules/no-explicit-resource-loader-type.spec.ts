import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-explicit-resource-loader-type.cjs');

describe('no-explicit-resource-loader-type', () => {
  it('reports parameter and return annotations on a generator loader', async () => {
    const messages = await lint(`
      import { query } from '@craft-ts/core';

      type SpaceItemsClientYielded = unknown;
      type SpaceResponse = { items: string[] };

      query('spaceItems', {
        params: token,
        loader: function* ({ params }: { params: string }): Generator<SpaceItemsClientYielded, SpaceResponse, unknown> {
          return yield* getSpaceItemsClient({ token: params });
        },
      });
    `);

    expect(messages).toEqual([
      'Do not annotate resource loader parameters explicitly: query, mutation, and asyncProcess infer params from their configuration. An annotation can hide a mismatch between params, the loader, and the yielded request; fix the resource inputs instead.',
      'Do not annotate a resource loader return type explicitly: Craft infers the generator result and yielded dependencies from the loader body. A manual Generator or Promise type can hide the actual resource contract; remove it and fix the yielded operation if needed.',
    ]);
  });

  it('allows local annotations and annotations outside resource loaders', async () => {
    const messages = await lint(`
      import { mutation } from '@craft-ts/core';

      const token: string = 'token';
      const load = (value: string): string => value;

      mutation('save', {
        loader: function* ({ params }) {
          const result: string = load(params);
          return result;
        },
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

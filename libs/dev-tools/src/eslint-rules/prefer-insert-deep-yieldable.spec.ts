import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./prefer-insert-deep-yieldable.cjs');

const MESSAGE =
  'Prefer `insertDeepYieldable()` on the primitive that creates `spaceQuery`, then read `spaceQuery.items` directly instead of calling `deepYieldable(...)` here.';

describe('prefer-insert-deep-yieldable', () => {
  it('reports deepYieldable around a primitive output property', async () => {
    const messages = await lint(`
      import { deepYieldable, query } from '@craft-ts/core';

      function* test() {
        const spaceQueryGenerator = query('spaceItems', {
          loader: function* () { return { items: [] }; },
        });
        const spaceQuery = yield* spaceQueryGenerator;
        const deepItems = deepYieldable(spaceQuery.items);
        yield deepItems;
      }
    `);

    expect(messages).toEqual([MESSAGE]);
  });

  it('supports a direct primitive yield and aliased deepYieldable', async () => {
    const messages = await lint(`
      import { deepYieldable as deep, state } from '@craft-ts/core';

      function* test() {
        const catalog = yield* state('catalog', { products: [] });
        deep(catalog.products);
      }
    `);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('catalog.products');
  });

  it('keeps explicit adaptation of unrelated values valid', async () => {
    const messages = await lint(`
      import { deepYieldable, craftComputed } from '@craft-ts/core';

      const user = deepYieldable(input);
      const selected = deepYieldable(craftComputed('selected', () => input));
      const unrelated = deepYieldable(value.items);
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

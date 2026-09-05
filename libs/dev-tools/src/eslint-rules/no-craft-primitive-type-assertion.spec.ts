import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-craft-primitive-type-assertion.cjs');

const MESSAGE =
  'Do not cast a Craft primitive generator through another type (for example `as unknown as Generator<...>`). Remove the assertions and keep the primitive contract inferred from its configuration and insertions.';

describe('no-craft-primitive-type-assertion', () => {
  it('reports the chained assertion used to force a primitive generator type', async () => {
    const messages = await lint(`
      import { query } from '@craft-ts/core';

      function* test() {
        const generator = query('spaceItems', { loader: function* () { return []; } }) as unknown as Generator<unknown, { readonly items: string[] }, unknown>;
        yield generator;
      }
    `);

    expect(messages).toEqual([MESSAGE]);
  });

  it('follows aliases and supports Effect primitives', async () => {
    const messages = await lint(`
      import { query as createQuery } from '@craft-ts/core';
      import { queryEffect } from '@craft-ts/effect';

      function* test() {
        const first = createQuery('first', { loader: function* () { return []; } }) as unknown as unknown;
        const second = queryEffect('second', { loader: () => undefined }) as unknown as Generator<unknown, string, unknown>;
        yield first;
        yield second;
      }
    `);

    expect(messages).toEqual([MESSAGE, MESSAGE]);
  });

  it('allows a single assertion and unrelated chained assertions', async () => {
    const messages = await lint(`
      import { query } from '@craft-ts/core';

      const value = query('spaceItems', { loader: function* () { return []; } }) as unknown;
      const unrelated = makeValue() as unknown as string;
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

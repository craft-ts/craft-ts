import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-craft-use.cjs');

describe('no-craft-use', () => {
  it('reports craftUse anywhere in a TypeScript file', async () => {
    const result = await lintFixture(`
      import { craftUse } from '@craft-ts/core';

      const value = craftUse(source);
      function* read() {
        return craftUse(value);
      }
    `);

    expect(result.messages).toEqual([
      '`craftUse(...)` is forbidden in Craft TypeScript. Use a generator and delegate the reader with `yield*` instead.',
      '`craftUse(...)` is forbidden in Craft TypeScript. Use a generator and delegate the reader with `yield*` instead.',
    ]);
  });

  it('reports an aliased craftUse import', async () => {
    const result = await lintFixture(`
      import { craftUse as read } from '@craft-ts/core';

      const value = read(source);
    `);

    expect(result.messages).toEqual([
      '`craftUse(...)` is forbidden in Craft TypeScript. Use a generator and delegate the reader with `yield*` instead.',
    ]);
  });

  it('does not report unrelated identifiers', async () => {
    const result = await lintFixture(`
      declare function craftUseful(value: unknown): unknown;
      const value = craftUseful(source);
    `);

    expect(result.messages).toEqual([]);
  });
});

async function lintFixture(source: string) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
          },
        },
        plugins: { local: { rules: { rule: rule as never } } },
        rules: { 'local/rule': 'error' },
      },
    ],
  });

  const [result] = await eslint.lintText(source, { filePath: 'fixture.ts' });
  return {
    messages: result.messages.map((message) => message.message),
  };
}

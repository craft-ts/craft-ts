import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-craft-use.cjs');

describe('no-craft-use', () => {
  it('warns for craftUse in business code, including primitive construction', async () => {
    const result = await lintFixture(`
      import { craftComputed, craftUse } from '@craft-ts/core';

      const total = craftUse(craftComputed('total', () => 1));
      const value = craftUse(source);
    `);

    expect(result.messages).toEqual([
      '`craftUse(...)` is mainly useful at synchronous test boundaries. In business code, prefer a named Craft primitive and `yield*` in its generator; keep `craftUse` for focused synchronous tests.',
      '`craftUse(...)` is mainly useful at synchronous test boundaries. In business code, prefer a named Craft primitive and `yield*` in its generator; keep `craftUse` for focused synchronous tests.',
    ]);
  });

  it('warns for an aliased craftUse import outside test files', async () => {
    const result = await lintFixture(
      `import { craftUse as read } from '@craft-ts/core';\nconst value = read(source);`,
    );

    expect(result.messages).toHaveLength(1);
  });

  it.each([
    'src/cart.spec.ts',
    'src/cart.test.ts',
    'src/__tests__/cart.ts',
  ])('allows craftUse in test file %s', async (filename) => {
    const result = await lintFixture(
      `import { craftUse } from '@craft-ts/core';\nconst value = craftUse(source);`,
      filename,
    );

    expect(result.messages).toEqual([]);
  });

  it('still warns in business examples under the documentation snippet directory', async () => {
    const result = await lintFixture(
      `import { craftUse } from '@craft-ts/core';\nconst value = craftUse(source);`,
      'tests/snippets/business-example.ts',
    );

    expect(result.messages).toHaveLength(1);
  });

  it('does not report unrelated identifiers', async () => {
    const result = await lintFixture(`
      declare function craftUseful(value: unknown): unknown;
      const value = craftUseful(source);
    `);

    expect(result.messages).toEqual([]);
  });
});

async function lintFixture(source: string, filePath = 'fixture.ts') {
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
        rules: { 'local/rule': 'warn' },
      },
    ],
  });

  const [result] = await eslint.lintText(source, { filePath });
  return {
    messages: result.messages.map((message) => message.message),
  };
}

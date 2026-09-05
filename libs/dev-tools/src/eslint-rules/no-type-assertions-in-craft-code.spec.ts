import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-type-assertions-in-craft-code.cjs');

const MESSAGE =
  'Do not use a TypeScript type assertion here. Fix the value or API typing and let TypeScript infer the contract; use `satisfies` when you need to validate a shape without changing the value type.';

describe('no-type-assertions-in-craft-code', () => {
  it('reports all TypeScript assertion forms, including as const', async () => {
    const messages = await lint(`
      const user = value as User;
      const users = <User[]>value;
      const literal = 'all' as const;
    `);

    expect(messages).toEqual([MESSAGE, MESSAGE, MESSAGE]);
  });

  it('allows satisfies because it validates without asserting a new type', async () => {
    const messages = await lint(`
      const config = { enabled: true } satisfies { enabled: boolean };
      const inferred = value;
    `);

    expect(messages).toEqual([]);
  });

  it('allows undefined seeds whose asserted union still includes undefined', async () => {
    const messages = await lint(`
      type SpaceItem = { id: string };
      const pendingDelete = undefined as SpaceItem | undefined;
      const pendingDeleteAngle = <SpaceItem | undefined>undefined;
      const invalid = undefined as SpaceItem;
    `);

    expect(messages).toEqual([MESSAGE]);
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

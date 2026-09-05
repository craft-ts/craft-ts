import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-explicit-craft-insertion-type.cjs');

describe('no-explicit-craft-insertion-type', () => {
  it('reports parameter and return annotations on insertion callbacks', async () => {
    const messages = await lint(`
      import { insertQueryPipe } from '@craft-ts/core';

      type View = { readonly value: string };
      insertQueryPipe(
        ({ resource }: { resource: unknown }): View => ({
          value: String(resource),
        }),
      );
    `);

    expect(messages).toEqual([
      'Do not annotate an insertion callback parameter explicitly: the Craft insertion pipe provides its context and must be allowed to infer it.',
      'Do not annotate an insertion callback return type explicitly: Craft must infer the derived output so the primitive keeps its complete type.',
    ]);
  });

  it('allows inferred callbacks and unrelated function annotations', async () => {
    const messages = await lint(`
      import { insertStatePipe } from '@craft-ts/core';

      const format = (value: string): string => value;
      insertStatePipe(({ state }) => ({ value: state }));
      unrelated(({ value }: { value: string }): string => value);
    `);

    expect(messages).toEqual([]);
  });

  it('follows aliased insertion pipe imports', async () => {
    const messages = await lint(`
      import { insertMutationPipe as pipe } from '@craft-ts/core';
      pipe((context): { value: string } => ({ value: String(context) }));
    `);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('return type explicitly');
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

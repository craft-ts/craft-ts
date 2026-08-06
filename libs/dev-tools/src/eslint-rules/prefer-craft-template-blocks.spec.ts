import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rule = require('./prefer-craft-template-blocks.cjs');

describe('prefer-craft-template-blocks', () => {
  it('accepts typed Craft blocks and ordinary template reads', async () => {
    const messages = await lintText(`
      const Demo = craftComponent(
        'Demo',
        {},
        () => ({ ready: state, kind: query }),
        ({ ready, kind }) => div([
          ifBlock(ready, () => p('ready'), () => p('not ready')),
          matchBlock.exhaustive(kind, 'code', {
            OK: () => p('ok'),
            ERROR: () => p('error'),
          }),
          each(items, { track: (item) => item.id }, (item) => p(item.name)),
        ]),
      );
    `);

    expect(messages).toEqual([]);
  });

  it('reports ternaries, logical expressions, and imperative control flow', async () => {
    const messages = await lintText(`
      const Demo = craftComponent(
        'Demo',
        {},
        () => ({}),
        ({ ready, label }) => {
          if (ready()) {
            return p(label);
          }
          return div({ class: ready() ? 'yes' : 'no' }, ready() && label);
        },
      );
    `);

    expect(messages).toEqual([
      'Do not use imperative control flow in a Craft template. Use ifBlock(...), matchBlock.exhaustive(...), each(...), or defer(...) so the render contract stays type-checkable.',
      'Do not use a ternary in a Craft template. Use ifBlock(...) for boolean visibility or matchBlock.exhaustive(...) for a discriminated union.',
      'Do not use a logical expression in a Craft template. Move the derivation to state, query, or craftComputed, then render it with a Craft block.',
    ]);
  });

  it('does not inspect a nested component twice', async () => {
    const messages = await lintText(`
      const Child = craftComponent(
        'Child',
        {},
        () => ({}),
        () => p(ready ? 'yes' : 'no'),
      );
      const Parent = craftComponent(
        'Parent',
        {},
        () => ({}),
        () => Child(),
      );
    `);

    expect(messages).toHaveLength(1);
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
        rules: { 'local/rule': 'error' },
      },
    ],
  });

  const [result] = await eslint.lintText(source, { filePath: 'fixture.ts' });
  return result.messages.map((message) => message.message);
}

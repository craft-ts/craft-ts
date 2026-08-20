import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-type-assertions-in-template.cjs');

describe('no-type-assertions-in-template', () => {
  it('reports as assertions in the template, including chained assertions', async () => {
    const result = await lintFixture(`
      declare function craftComponent(...args: unknown[]): unknown;
      declare function button(...args: unknown[]): unknown;
      declare const machine: { stepState: unknown };

      craftComponent('Demo', {}, () => ({}), () => button(
        {},
        machine.stepState as unknown as () => { step: 'ready' },
      ));
    `);

    expect(result.messages).toEqual([
      'Do not use type assertions in a Craft template. Fix the type in the component logic or expose a correctly typed derived value.',
    ]);
  });

  it('reports angle-bracket assertions in the template', async () => {
    const result = await lintFixture(`
      declare function craftComponent(...args: unknown[]): unknown;
      declare function p(...args: unknown[]): unknown;
      declare const value: unknown;

      craftComponent('Demo', {}, () => ({}), () => p(<string>value));
    `);

    expect(result.messages).toEqual([
      'Do not use type assertions in a Craft template. Fix the type in the component logic or expose a correctly typed derived value.',
    ]);
  });

  it('allows assertions inside DOM event handlers', async () => {
    const result = await lintFixture(`
      declare function craftComponent(...args: unknown[]): unknown;
      declare function button(...args: unknown[]): unknown;

      craftComponent('Demo', {}, () => ({}), () => button({
        *input(event: Event) {
          (event.target as HTMLInputElement).dispatchEvent(new Event('change'));
        },
      }, 'Save'));
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

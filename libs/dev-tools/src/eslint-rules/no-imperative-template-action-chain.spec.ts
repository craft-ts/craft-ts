import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-imperative-template-action-chain.cjs');

describe('no-imperative-template-action-chain', () => {
  it('reports chained mutation, state, and query actions in a click handler', async () => {
    const messages = await lint(`
      import { craftComponent } from '@craft-ts/core';

      declare const createMutation: { mutate(value: string): Generator };
      declare const todosQuery: { call(value: string): Generator };
      declare const setTitle: (value: string) => Generator;
      declare function button(...args: unknown[]): unknown;

      craftComponent('TodoPage', {}, () => ({}), () => button({
        *click() {
          yield* createMutation.mutate('todo');
          yield* setTitle('');
          yield* todosQuery.call('all');
        },
      }));
    `);

    expect(messages).toEqual([
      'Template event handlers must not chain imperative Craft actions (mutation.mutate, setTitle, query.call). Emit one source$ event and let query, mutation, and state react through on$.',
    ]);
  });

  it('allows one action and ignores non-event template callbacks', async () => {
    const messages = await lint(`
      import { craftComponent } from '@craft-ts/core';

      declare const mutation: { mutate(value: string): Generator };
      declare function button(...args: unknown[]): unknown;
      declare function span(...args: unknown[]): unknown;

      craftComponent('Demo', {}, () => ({}), () => button({
        *click() { yield* mutation.mutate('todo'); },
        'aria-pressed': function* () {
          yield* mutation.mutate('not-an-event');
          return true;
        },
      }, span({}))); 
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

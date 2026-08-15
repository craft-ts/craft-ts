import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-craft-use-in-template.cjs');

describe('no-craft-use-in-template', () => {
  it('reports craftUse calls in a component template', async () => {
    const result = await lintFixture(`
      declare function craftComponent(...args: unknown[]): unknown;
      declare function div(children: unknown[]): unknown;
      declare function craftUse<T>(value: T): T;
      declare const usersQuery: {
        currentPageStatus: () => string;
      };

      craftComponent('Demo', {}, function* () {
        return {};
      }, () => div([
        () => craftUse(usersQuery.currentPageStatus()),
      ]));
    `);

    expect(result.messages).toEqual([
      '`craftUse(...)` is forbidden in Craft templates. Pass the reactive reader directly.',
    ]);
  });

  it('allows craftUse in component factories', async () => {
    const result = await lintFixture(`
      declare function craftComponent(...args: unknown[]): unknown;
      declare function craftUse<T>(value: T): T;
      declare const value: unknown;

      const Child = craftComponent('Child', {}, function* () {
        return { value: craftUse(value) };
      }, () => null);

      craftComponent('Parent', {}, function* () {
        return { value: craftUse(value) };
      }, () => Child({ value }));
    `);

    expect(result.messages).toEqual([]);
  });

  it('reports an aliased craftUse imported from core', async () => {
    const result = await lintFixture(`
      import { craftUse as read } from '@craft-ng/core';
      declare function craftComponent(...args: unknown[]): unknown;
      declare const value: () => string;

      craftComponent('Demo', {}, () => ({}), () => read(value()));
    `);

    expect(result.messages).toEqual([
      '`craftUse(...)` is forbidden in Craft templates. Pass the reactive reader directly.',
    ]);
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

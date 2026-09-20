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

      craftComponent('Demo', {}, () => div([
        () => craftUse(usersQuery.currentPageStatus()),
      ]));
    `);

    expect(result.messages).toEqual([
      '`craftUse(...)` is forbidden in Craft templates. Pass the reactive reader directly.',
    ]);
  });

  it('allows craftUse where a component declares what it takes', async () => {
    const result = await lintFixture(`
      declare function craftComponent(...args: unknown[]): unknown;
      declare function p(child: unknown): unknown;
      declare function state(...args: unknown[]): any;
      declare function craftUse<T>(value: T): T;

      craftComponent('Demo', {}, function* () {
        const count = yield* state('count', 0);
        const initial = craftUse(count());

        return p(String(initial));
      });
    `);

    expect(result.messages).toEqual([]);
  });

  it('allows craftUse in the service a component reads', async () => {
    const result = await lintFixture(`
      declare function craftComponent(...args: unknown[]): unknown;
      declare function craftService(...args: unknown[]): unknown;
      declare function craftUse<T>(value: T): T;
      declare const value: unknown;

      const { DemoView } = craftService(
        { name: 'demoView', providedIn: 'toProvide' },
        function* () {
          return { value: craftUse(value) };
        },
      ) as { DemoView: () => unknown };

      craftComponent('Parent', {}, function* () {
        return DemoView();
      });
    `);

    expect(result.messages).toEqual([]);
  });

  it('reports an aliased craftUse imported from core', async () => {
    const result = await lintFixture(`
      import { craftUse as read } from '@craft-ts/core';
      declare function craftComponent(...args: unknown[]): unknown;
      declare const value: () => string;

      craftComponent('Demo', {}, () => read(value()));
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

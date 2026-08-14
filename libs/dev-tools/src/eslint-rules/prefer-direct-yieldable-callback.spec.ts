import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./prefer-direct-yieldable-callback.cjs');

describe('prefer-direct-yieldable-callback', () => {
  it('reports and autofixes a generator that only delegates to a callback', async () => {
    const source = `
      declare function craftComponent(...args: unknown[]): unknown;
      declare function span(...args: unknown[]): unknown;
      declare const role: () => Generator<unknown, string, unknown>;

      craftComponent('Demo', {}, () => ({}), () =>
        span({ class: 'badge' }, function* () {
          return yield* role();
        }),
      );
    `;

    const result = await lintFixture(source);
    expect(result.messages).toEqual([
      'Pass the yieldable callback directly instead of wrapping it in a generator.',
    ]);

    const fixed = await lintFixture(source, true);
    expect(fixed.messages).toEqual([]);
    expect(fixed.output).toContain("span({ class: 'badge' }, role)");
  });

  it('does not report generators with parameters, arguments, or extra logic', async () => {
    const result = await lintFixture(`
      declare function craftComponent(...args: unknown[]): unknown;
      declare function span(...args: unknown[]): unknown;
      declare const role: (value?: string) => Generator<unknown, string, unknown>;

      craftComponent('Demo', {}, () => ({}), () => span(
        function* (value: string) {
          return yield* role(value);
        },
        function* () {
          return yield* role('admin');
        },
        function* () {
          const value = 'admin';
          return yield* role(value);
        },
      ));
    `);

    expect(result.messages).toEqual([]);
  });

  it('only inspects templates and does not report a nested component twice', async () => {
    const result = await lintFixture(`
      declare function craftComponent(...args: unknown[]): unknown;
      declare function span(...args: unknown[]): unknown;
      declare const role: () => Generator<unknown, string, unknown>;

      craftComponent('FactoryOnly', {}, function* () {
        return yield* role();
      }, () => null);

      craftComponent('Parent', {}, () => ({}), () =>
        craftComponent('Child', {}, () => ({}), () =>
          span(function* () {
            return yield* role();
          }),
        ),
      );
    `);

    expect(result.messages).toEqual([
      'Pass the yieldable callback directly instead of wrapping it in a generator.',
    ]);
  });
});

async function lintFixture(source: string, fix = false) {
  const eslint = new ESLint({
    fix,
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
    output: result.output,
  };
}

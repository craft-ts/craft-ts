import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./require-craft-computed-for-dynamic-template-lookup.cjs');

describe('require-craft-computed-for-dynamic-template-lookup', () => {
  it('reports dynamic object lookups driven by a template parameter', async () => {
    const messages = await lintText(`
      declare function craftComponent(...args: unknown[]): unknown;
      declare function span(...args: unknown[]): unknown;
      declare const STATUS_VIEW: Record<string, readonly [string, string]>;
      declare const TONE_OF_STATUS: Record<string, string>;

      const Status = craftComponent(
        'Status',
        {},
        (status: unknown) => ({ status }),
        ({ status: resourceStatus }) => span([
          span(function* () {
            return STATUS_VIEW[yield* resourceStatus()][0];
          }),
          span({ 'data-status': function* () {
            return TONE_OF_STATUS[yield* resourceStatus()];
          } }, function* () {
            return STATUS_VIEW[yield* resourceStatus()][1];
          }),
        ]),
      );
    `);

    expect(messages).toEqual([
      'Do not perform a dynamic object or array lookup in a Craft template. Move the lookup to a named craftComputed() in the component logic factory, then bind the computed value directly.',
      'Do not perform a dynamic object or array lookup in a Craft template. Move the lookup to a named craftComputed() in the component logic factory, then bind the computed value directly.',
      'Do not perform a dynamic object or array lookup in a Craft template. Move the lookup to a named craftComputed() in the component logic factory, then bind the computed value directly.',
    ]);
  });

  it('allows static lookups and direct computed bindings', async () => {
    const messages = await lintText(`
      declare function craftComponent(...args: unknown[]): unknown;
      declare function span(...args: unknown[]): unknown;
      declare const STATUS_VIEW: Record<string, readonly [string, string]>;

      craftComponent(
        'Status',
        {},
        () => ({ statusEmoji, statusTone, statusLabel }),
        ({ statusEmoji, statusTone, statusLabel }) => span([
          span(STATUS_VIEW['idle'][0]),
          span({ 'data-status': statusTone }, statusLabel),
          span(statusEmoji),
        ]),
      );
    `);

    expect(messages).toEqual([]);
  });

  it('supports destructured and aliased template parameters', async () => {
    const messages = await lintText(`
      declare function craftComponent(...args: unknown[]): unknown;
      declare function span(...args: unknown[]): unknown;
      declare const labels: Record<string, string>;

      craftComponent(
        'Status',
        {},
        () => ({}),
        ({ status: resourceStatus }) => span(labels[yield* resourceStatus()]),
      );
    `);

    expect(messages).toHaveLength(1);
  });

  it('does not inspect a nested component twice', async () => {
    const messages = await lintText(`
      declare function craftComponent(...args: unknown[]): unknown;
      declare function span(...args: unknown[]): unknown;
      declare const labels: Record<string, string>;

      const Child = craftComponent(
        'Child',
        {},
        () => ({}),
        ({ status }) => span(labels[yield* status()]),
      );
      craftComponent('Parent', {}, () => ({}), () => Child({}));
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
  return result.messages.map((message) => message.message);
}

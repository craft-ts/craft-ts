import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const plugin = require('./index.cjs');
const name = 'require-fixed-component-provider-list';
const rule = plugin.rules[name];

async function lint(code: string) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    fix: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tsParser as unknown as Linter.Parser },
        plugins: { 'craft-ts': plugin },
        rules: { [`craft-ts/${name}`]: 'error' },
      },
    ],
  });
  const [result] = await eslint.lintText(code, { filePath: 'fixture.ts' });
  return result;
}

describe(name, () => {
  it.each([
    '() => []',
    '({ id }) => [provideContext({ id })]',
    '({ id, enabled }) => [provideContext({ id, enabled }), provideOther()]',
    '({ id }) => [provideContext({ id: () => id() ? "a" : "b" })]',
    '({ id }) => [provideContext({ id: id || fallback, ...config })]',
    '() => [knownProvider, providers.context(), [provideOther()]]',
    '() => [{ provide: TOKEN, useFactory: () => enabled ? first : second }]',
  ])('accepts %s', async (factory) => {
    const result =
      await lint(`import { withComponentProviders } from '@craft-ts/component';
      withComponentProviders(${factory});`);
    expect(result.messages).toEqual([]);
  });

  it.each([
    '() => providers',
    'factory',
    'function () { return [provideContext()]; }',
    '() => { return [provideContext()]; }',
    'async () => [provideContext()]',
    '() => flag ? [provideContext()] : []',
    '() => flag && [provideContext()]',
    '() => providers || [provideContext()]',
    '() => providers ?? [provideContext()]',
    '() => [...providers]',
    '() => [[...providers]]',
    '() => [flag ? provideA() : provideB()]',
    '() => [flag && provideContext()]',
    '() => [(flag ? provideA : provideB)()]',
    '() => [providers[flag ? "a" : "b"]()]',
    '() => [provideContext()].filter(Boolean)',
    '() => providers.map(provideContext)',
    '() => [provideA()].concat([provideB()])',
    '() => Array.of(provideContext())',
    '() => [providers.map(provideContext)]',
    '() => [providers.filter(Boolean)]',
    '() => [providers.concat(others)]',
    '() => [providers.toSorted(compare)]',
    '() => [Array.from(providers)]',
    '() => [Array.of(provideContext())]',
    '() => [(flag, provideContext())]',
    '() => [, provideContext()]',
    '() => [(flag ? provideA() : provideB()) as Provider]',
    '() => [provideContext()] as const',
  ])('rejects %s without fixing it', async (factory) => {
    const result =
      await lint(`import { withComponentProviders } from '@craft-ts/component';
      withComponentProviders(${factory});`);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].messageId).toBe('fixedList');
    expect(result.messages[0].message).toContain('pass reactive readers');
    expect(result.output).toBeUndefined();
    expect(result.messages[0].suggestions).toBeUndefined();
  });

  it('recognizes renamed and namespace imports', async () => {
    const result = await lint(`
      import { withComponentProviders as bind } from '@craft-ts/component';
      import * as craft from '@craft-ts/component';
      bind(() => providers);
      craft.withComponentProviders(() => providers);
      craft['withComponentProviders'](() => providers);
    `);
    expect(result.messages.map(({ messageId }) => messageId)).toEqual([
      'fixedList',
      'fixedList',
      'fixedList',
    ]);
  });

  it('ignores local, foreign and shadowed homonyms', async () => {
    const result = await lint(`
      import { withComponentProviders as imported } from '@craft-ts/component';
      import * as craft from '@craft-ts/component';
      import { withComponentProviders as foreign } from './domain';
      const withComponentProviders = (factory) => factory();
      withComponentProviders(() => providers);
      foreign(() => providers);
      function local(imported, craft) {
        imported(() => providers);
        craft.withComponentProviders(() => providers);
      }
    `);
    expect(result.messages).toEqual([]);
  });

  it('is exported and enabled at error in the recommended and Effect presets', () => {
    expect(rule.meta.fixable).toBeUndefined();
    expect(plugin.configs.recommended.rules[`craft-ts/${name}`]).toBe('error');
    expect(plugin.configs.effect.rules[`craft-ts/${name}`]).toBe('error');
  });
});

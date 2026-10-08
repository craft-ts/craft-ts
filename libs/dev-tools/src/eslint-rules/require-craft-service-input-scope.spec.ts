import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const plugin = require('./index.cjs');
const name = 'require-craft-service-input-scope';

describe(name, () => {
  it('accepts inputs that match the service scope', async () => {
    const result = await lint(`
      import { craftService as service } from '@craft-ts/core';
      type ProviderInputs = { $provided: { userId: string } };

      service({ name: 'Global', providedIn: 'global' }, function* () {});
      service(
        { name: 'Provider', providedIn: 'toProvide' },
        function* (inputs: ProviderInputs) { void inputs.$provided; },
      );
      service(
        { name: 'Function', providedIn: 'function' },
        function* (inputs: { userId: string; locale: string }) {
          void inputs.userId;
          void inputs.locale;
        },
      );
      service(
        { name: 'ManualRoot', providedIn: 'manuallyProvidedAtRoot' },
        function* (inputs: { $provided: { userId: string } }) {
          void inputs.$provided;
        },
      );
    `);

    expect(result.messages).toEqual([]);
  });

  it('rejects direct inputs on global and provider-scoped services', async () => {
    const result = await lint(`
      import { craftService } from '@craft-ts/core';

      craftService(
        { name: 'Global', providedIn: 'global' },
        function* (inputs: { userId: string }) { void inputs.userId; },
      );
      craftService(
        { name: 'GlobalProvided', providedIn: 'global' },
        function* (inputs: { $provided: { userId: string } }) {
          void inputs.$provided;
        },
      );
      craftService(
        { name: 'Provider', providedIn: 'toProvide' },
        function* (inputs: { userId: string }) { void inputs.userId; },
      );
      craftService(
        { name: 'ManualRoot', providedIn: 'manuallyProvidedAtRoot' },
        function* (inputs: { userId: string }) { void inputs.userId; },
      );
    `);

    expect(result.messages.map(({ messageId }) => messageId)).toEqual([
      'global',
      'global',
      'provider',
      'provider',
    ]);
    expect(result.messages[2].message).toContain('withComponentProviders');
  });

  it('rejects $provided on a function service', async () => {
    const result = await lint(`
      import * as craft from '@craft-ts/core';
      craft.craftService(
        { name: 'Function', providedIn: 'function' },
        function* (inputs: { id: string; $provided: { locale: string } }) {
          void inputs;
        },
      );
    `);

    expect(result.messages.map(({ messageId }) => messageId)).toEqual([
      'function',
    ]);
  });

  it('does not let an untyped input shape bypass any scope', async () => {
    const result = await lint(`
      import { craftService } from '@craft-ts/core';
      craftService(
        { name: 'Global', providedIn: 'global' },
        function* (inputs: any) { void inputs; },
      );
      craftService(
        { name: 'Provider', providedIn: 'toProvide' },
        function* (inputs: any) { void inputs; },
      );
      craftService(
        { name: 'Function', providedIn: 'function' },
        function* (inputs: any) { void inputs; },
      );
    `);

    expect(result.messages.map(({ messageId }) => messageId)).toEqual([
      'global',
      'provider',
      'function',
    ]);
  });

  it('ignores shadowed, foreign and non-craftService homonyms', async () => {
    const result = await lint(`
      import { craftService } from './domain';
      import * as craft from './domain';
      const localCraftService = (options, factory) => factory;
      craftService(
        { providedIn: 'global' },
        function* (inputs: { id: string }) { void inputs.id; },
      );
      craft.craftService(
        { providedIn: 'global' },
        function* (inputs: { id: string }) { void inputs.id; },
      );
      localCraftService(
        { providedIn: 'global' },
        function* (inputs: { id: string }) { void inputs.id; },
      );
      function shadowed(craftService) {
        craftService(
          { providedIn: 'global' },
          function* (inputs: { id: string }) { void inputs.id; },
        );
      }
    `);

    expect(result.messages).toEqual([]);
  });

  it('is enabled at error in the recommended and Effect presets', () => {
    expect(plugin.configs.recommended.rules[`craft-ts/${name}`]).toBe('error');
    expect(plugin.configs.effect.rules[`craft-ts/${name}`]).toBe('error');
  });
});

async function lint(code: string) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        },
        plugins: { 'craft-ts': plugin },
        rules: { [`craft-ts/${name}`]: 'error' },
      },
    ],
  });
  const [result] = await eslint.lintText(code, { filePath: 'fixture.ts' });
  return result;
}

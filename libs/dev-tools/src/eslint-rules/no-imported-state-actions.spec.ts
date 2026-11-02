import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const plugin = require('./index.cjs');
const ruleName = 'no-imported-state-actions';

describe(ruleName, () => {
  it('reports imported actions captured by module-level helpers', async () => {
    const result = await lint(`
      import { status, archive } from './shared-state';
      export function fail(message: string) {
        status.set(message);
        archive.sessions.call(message);
      }
    `);

    expect(result.messages.map(({ messageId }) => messageId)).toEqual([
      'action',
      'action',
    ]);
    expect(result.messages[0].message).toContain('yield*');
    expect(result.messages[1].message).toContain('archive');
  });

  it('allows dependencies passed as parameters and local values', async () => {
    const result = await lint(`
      import { status } from './shared-state';
      export function update(dependencies: { status: { set(value: string): void } }, value: string) {
        dependencies.status.set(value);
      }
      export function local() {
        const status = { set(value: string) { void value; } };
        status.set('ready');
      }
    `);

    expect(result.messages).toEqual([]);
  });

  it('reports imported actions even when called inside a Craft factory', async () => {
    const result = await lint(`
      import { status } from './shared-state';
      import { craftService } from '@craft-ts/core';
      craftService({ name: 'StateOwner', providedIn: 'global' }, function* () {
        status.set('ready');
      });
    `);

    expect(result.messages.map(({ messageId }) => messageId)).toEqual([
      'action',
    ]);
  });

  it('ignores ordinary calls and read-only properties', async () => {
    const result = await lint(`
      import { CraftHttpClient as Http, formatStatus, status } from '@craft-ts/core';
      import type { Session } from './session';
      export function label() {
        formatStatus(status.value);
        return Http.delete(({ response }) => ({
          url: '/sessions',
          success: response<Session>(),
        }));
      }
    `);

    expect(result.messages).toEqual([]);
  });

  it('is enabled at error in the recommended and Effect presets', () => {
    expect(plugin.configs.recommended.rules[`craft-ts/${ruleName}`]).toBe(
      'error',
    );
    expect(plugin.configs.effect.rules[`craft-ts/${ruleName}`]).toBe('error');
  });
});

async function lint(source: string) {
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
        rules: { [`craft-ts/${ruleName}`]: 'error' },
      },
    ],
  });
  const [result] = await eslint.lintText(source, { filePath: 'fixture.ts' });
  return result;
}

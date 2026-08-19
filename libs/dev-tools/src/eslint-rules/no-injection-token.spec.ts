import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rule = require('./no-injection-token.cjs');

const MESSAGE =
  "Do not use InjectionToken in app code. Declare the contract with craftService({ name: '...', providedIn: 'abstract' }, abstract<Contract>()) instead.";

describe('no-injection-token', () => {
  it('reports authored InjectionToken imports and construction', async () => {
    const messages = await lintText(`
      import { InjectionToken } from '@craft-ts/core';
      export const ClaimedUserId = new InjectionToken<string>('ClaimedUserId');
    `);

    expect(messages).toEqual([MESSAGE]);
  });

  it('reports type-only and namespace usages', async () => {
    const messages = await lintText(`
      import type { InjectionToken as Token } from '@angular/core';
      import * as ng from '@angular/core';
      type CurrentUser = Token<string>;
      const Other = new ng.InjectionToken<number>('Other');
      void [CurrentUser, Other];
    `);

    expect(messages).toEqual([MESSAGE, MESSAGE]);
  });

  it('allows local symbols named InjectionToken', async () => {
    const messages = await lintText(`
      class InjectionToken<T> {
        constructor(readonly description: string) {}
      }
      const token = new InjectionToken<string>('local');
      void token;
    `);

    expect(messages).toEqual([]);
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

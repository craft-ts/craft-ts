import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rule = require('./prefer-craft-http-transport.cjs');

const FETCH_MESSAGE =
  'Do not call fetch() directly in authored Craft code. Use query() for reads or mutation() for writes, backed by CraftHttpClient.';
const XHR_MESSAGE =
  'Do not use XMLHttpRequest directly in authored Craft code. Use query() for reads or mutation() for writes, backed by CraftHttpClient.';

describe('prefer-craft-http-transport', () => {
  it('reports fetch and XMLHttpRequest transports', async () => {
    const messages = await lintText(`
      const response = fetch('/users');
      const xhr = new XMLHttpRequest();
      const otherResponse = window.fetch('/posts');
      const otherXhr = new globalThis.XMLHttpRequest();
      void [response, xhr, otherResponse, otherXhr];
    `);

    expect(messages).toEqual([
      FETCH_MESSAGE,
      XHR_MESSAGE,
      FETCH_MESSAGE,
      XHR_MESSAGE,
    ]);
  });

  it('allows CraftHttpClient and shadowed local names', async () => {
    const messages = await lintText(`
      import { CraftHttpClient, query, mutation } from '@craft-ts/core';

      const read = query('users', () => CraftHttpClient.get('/users'));
      const write = mutation('saveUser', () => CraftHttpClient.post('/users'));

      function fetch() {
        return 'test';
      }

      function createLocalRequest(fetch: () => string) {
        const XMLHttpRequest = class {};
        return [fetch(), new XMLHttpRequest()];
      }

      void [read, write, createLocalRequest];
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

import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-remote-work-in-craft-method.cjs');

describe('no-remote-work-in-craft-method', () => {
  it('reports CraftHttpClient requests inside craftMethod', async () => {
    const messages = await lint(`
      import { CraftHttpClient, craftMethod } from '@craft-ts/core';

      const toggleTodoRequest = craftMethod('toggleTodoRequest', function* (id: number) {
        return yield* CraftHttpClient.patch(() => ({ url: '/api/todos', payload: { id } }));
      });
    `);

    expect(messages).toEqual([
      'Remote work via CraftHttpClient.patch(...) is forbidden inside craftMethod. Put the request directly in a query or mutation loader.',
    ]);
  });

  it('allows a pure craftMethod and a request in a query loader', async () => {
    const messages = await lint(`
      import { CraftHttpClient, craftMethod } from '@craft-ts/core';

      const normalize = craftMethod('normalize', (value: string) => value.trim());
      declare function mutation(...args: unknown[]): unknown;
      mutation('save', {
        loader: function* () {
          return yield* CraftHttpClient.post(() => ({ url: '/api/todos' }));
        },
      });
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

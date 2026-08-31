import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rule = require('./no-raw-craft-router-url.cjs');

const MESSAGE =
  'Do not read CraftRouter.url. Use the typed route parameter helper (for example AppProductIdParams) instead of parsing the URL.';

describe('no-raw-craft-router-url', () => {
  it('reports URL reads from a yielded CraftRouter', async () => {
    const messages = await lintText(`
      import { CraftRouter } from '@craft-ts/core';

      function* page() {
        const router = yield* CraftRouter();
        return router.url.split('/').at(-1);
      }
    `);

    expect(messages).toEqual([MESSAGE]);
  });

  it('reports aliases and direct URL reads, including bracket access', async () => {
    const messages = await lintText(`
      import * as core from '@craft-ts/core';

      function* page() {
        const router = yield* core.CraftRouter();
        const route = router;
        const { url } = yield* core.CraftRouter();
        return [route['url'], url];
      }
    `);

    expect(messages).toEqual([MESSAGE, MESSAGE]);
  });

  it('allows navigation through CraftRouter and unrelated url values', async () => {
    const messages = await lintText(`
      import { CraftRouter } from '@craft-ts/core';

      function* page() {
        const router = yield* CraftRouter();
        yield* router.navigate({ to: 'home' });
        return window.location.href;
      }
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

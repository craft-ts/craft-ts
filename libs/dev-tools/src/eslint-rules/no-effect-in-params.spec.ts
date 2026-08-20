import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-effect-outside-loaders.cjs');

describe('no-effect-outside-loaders', () => {
  it('rejects Effect values returned from params', async () => {
    const messages = await lint(`
      import { queryEffect } from '@craft-ts/effect';
      import { Effect } from 'effect';

      queryEffect('profile', {
        params: () => Effect.succeed({ id: 'u-1' }),
        loader: ({ params }) => Effect.succeed(params),
      });
    `);

    expect(messages).toEqual([
      'Effect values and Effect service reads are only allowed in an Effect loader. Keep params, methods, craftComputed(...) and craftEffect(...) synchronous.',
    ]);
  });

  it('rejects Effect service reads from params', async () => {
    const messages = await lint(`
      import { queryEffect } from '@craft-ts/effect';

      queryEffect('profile', {
        params: function* () {
          const service = yield* AccessPolicyService;
          return service.currentUser();
        },
        loader: ({ params }) => params,
      });
    `);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('Effect service reads');
  });

  it('rejects Effect-valued methods', async () => {
    const messages = await lint(`
      import { queryEffect } from '@craft-ts/effect';
      import { Effect } from 'effect';

      queryEffect('profile', {
        params: function* () {
          const input = yield* someInput();
          return { id: input };
        },
        method: (id: string) => Effect.succeed({ id }),
        loader: ({ params }) => Effect.succeed(params),
      });
    `);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('only allowed in an Effect loader');
  });

  it('rejects Effect values in craftComputed and craftEffect callbacks', async () => {
    const messages = await lint(`
      import { craftComputed, craftEffect } from '@craft-ts/core';
      import { Effect } from 'effect';

      craftComputed('total', () => Effect.succeed(1));
      craftEffect('sync-effect', () => Effect.succeed(1));
    `);

    expect(messages).toHaveLength(2);
  });

  it('allows Effect values in loaders and Craft reads in params', async () => {
    const messages = await lint(`
      import { queryEffect } from '@craft-ts/effect';

      queryEffect('profile', {
        params: function* () {
          return yield* someInput();
        },
        loader: ({ params }) => Effect.succeed(params),
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
        plugins: { local: { rules: { params: rule as never } } },
        rules: { 'local/params': 'error' },
      },
    ],
  });

  const [result] = await eslint.lintText(source, { filePath: 'fixture.ts' });
  return result.messages.map((message) => message.message);
}

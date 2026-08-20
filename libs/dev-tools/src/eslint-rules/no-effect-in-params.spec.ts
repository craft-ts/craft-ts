import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-effect-in-params.cjs');

describe('no-effect-in-params', () => {
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
      '`params` must remain synchronous. Do not return an Effect or read an Effect service here; use `computedEffect(...)` or `method(...)` for asynchronous work.',
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
    expect(messages[0]).toContain('read an Effect service');
  });

  it('allows Craft reactive reads in params and Effect-valued methods', async () => {
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

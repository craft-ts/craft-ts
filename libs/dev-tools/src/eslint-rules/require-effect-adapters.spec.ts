import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./require-effect-adapters.cjs');

describe('require-effect-adapters', () => {
  it('reports direct imports and calls for every async primitive', async () => {
    const messages = await lint(
      'apps/demo-effect/src/app/example.ts',
      `
        import { query as q, mutation, asyncProcess, state } from '@craft-ts/core';
        q('users', {});
        mutation('save', {});
        asyncProcess('load', {});
        state('request', 0);
      `,
    );

    expect(messages).toHaveLength(6);
    expect(messages.filter((message) => message.includes('queryEffect'))).toHaveLength(2);
    expect(messages.filter((message) => message.includes('mutationEffect'))).toHaveLength(2);
    expect(messages.filter((message) => message.includes('asyncProcessEffect'))).toHaveLength(2);
    expect(messages.every((message) => message.includes('Effect-aware CraftTS adapters'))).toBe(true);
  });

  it('allows adapters, state, tests, and the effect library itself', async () => {
    expect(
      await lint(
        'apps/demo-effect/src/app/example.ts',
        `import { state } from '@craft-ts/core'; import { queryEffect } from '@craft-ts/effect'; state('request', 0); queryEffect('users', {});`,
      ),
    ).toEqual([]);
    expect(
      await lint(
        'apps/demo-effect/src/app/example.spec.ts',
        `import { query } from '@craft-ts/core'; query('users', {});`,
      ),
    ).toEqual([]);
    expect(
      await lint(
        'libs/effect/src/lib/internal.ts',
        `import { query } from '@craft-ts/core'; query('users', {});`,
      ),
    ).toEqual([]);
  });
});

async function lint(filename: string, source: string): Promise<string[]> {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        },
        plugins: { local: { rules: { adapters: rule as never } } },
        rules: { 'local/adapters': 'error' },
      },
    ],
  });
  const [result] = await eslint.lintText(source, { filePath: filename });
  return result.messages.map((message) => message.message);
}

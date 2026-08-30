import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-type-assertions-in-resource-loader.cjs');

describe('no-type-assertions-in-resource-loader', () => {
  it('reports assertions used to adapt a query loader promise', async () => {
    const messages = await lint(`
      import { queryEffect } from '@craft-ts/effect';

      declare const request: (id: number) => PromiseLike<string>;
      queryEffect('todosQuery', {
        method: (id: number) => id,
        loader: ({ params: id }) => request(id) as PromiseLike<string | Error>,
      });
    `);

    expect(messages).toEqual([
      'Do not use a type assertion inside a resource loader. Fix the request or adapter typing and let the query/mutation infer its result.',
    ]);
  });

  it('allows assertions outside resource loaders', async () => {
    const messages = await lint(`
      import { mutationEffect } from '@craft-ts/effect';

      const value = 'todo' as const;
      mutationEffect('save', {
        loader: ({ params }: { params: string }) => params,
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

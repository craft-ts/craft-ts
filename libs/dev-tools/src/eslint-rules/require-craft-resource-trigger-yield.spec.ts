import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./require-craft-resource-trigger-yield.cjs');
const tempDirectories: string[] = [];

describe('require-craft-resource-trigger-yield', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('requires yield* for triggers in generator functions', async () => {
    const { messages } = await lintFixture(`
      import { asyncProcess, craftGen, craftUse, mutation, query } from '@craft-ng/core';

      const { users } = craftUse(query('users', { method: (value) => value, loader: () => Promise.resolve([]) }));
      const { save } = craftUse(mutation('save', { method: (value) => value, loader: () => Promise.resolve(undefined) }));
      const { validate } = craftUse(asyncProcess('validate', { method: (value) => value, loader: () => Promise.resolve(undefined) }));

      const program = craftGen(function* (value) {
        users.call(value);
        save.mutate(value);
        validate.method(value);
      });
    `);

    expect(messages).toEqual([
      'query.call(...) must be consumed with `yield*` inside a generator function.',
      'mutation.mutate(...) must be consumed with `yield*` inside a generator function.',
      'asyncProcess.method(...) must be consumed with `yield*` inside a generator function.',
    ]);
  });

  it('accepts yield* and ordinary UI callbacks', async () => {
    const { messages } = await lintFixture(`
      import { craftUse, mutation, query } from '@craft-ng/core';

      const { users } = craftUse(query('users', { method: (value) => value, loader: () => Promise.resolve([]) }));
      const { save } = craftUse(mutation('save', { method: (value) => value, loader: () => Promise.resolve(undefined) }));

      function* generator() {
        yield* users.call('a');
        yield* save.mutate('b');
      }

      const click = () => save.mutate('from-ui');
      void generator;
      void click;
    `);

    expect(messages).toEqual([]);
  });
});

async function lintFixture(source: string): Promise<{ messages: string[] }> {
  const directory = await mkdtemp(
    join(tmpdir(), 'require-craft-resource-trigger-yield-rule-'),
  );
  tempDirectories.push(directory);
  await writeFile(join(directory, 'fixture.ts'), source);

  const eslint = new ESLint({
    cwd: directory,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        },
        plugins: { local: { rules: { trigger: rule as never } } },
        rules: { 'local/trigger': 'error' },
      },
    ],
  });

  const results = await eslint.lintFiles(['fixture.ts']);
  return {
    messages: results.flatMap((result) =>
      result.messages.map((message) => message.message),
    ),
  };
}

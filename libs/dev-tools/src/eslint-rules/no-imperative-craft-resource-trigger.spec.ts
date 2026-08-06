import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-imperative-craft-resource-trigger.cjs');
const tempDirectories: string[] = [];

describe('no-imperative-craft-resource-trigger', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('reports query.call, mutation.mutate, and asyncProcess.method in an effect', async () => {
    const { messages } = await lintFixture(`
      import { asyncProcess, craftEffect, craftUse, mutation, query } from '@craft-ng/core';

      const { users } = craftUse(query('users', { method: (value) => value, loader: () => Promise.resolve([]) }));
      const { save } = craftUse(mutation('save', { method: (value) => value, loader: () => Promise.resolve(undefined) }));
      const { validate } = craftUse(asyncProcess('validate', { method: (value) => value, loader: () => Promise.resolve(undefined) }));

      craftEffect('triggers', function* () {
        yield* users.call('a');
        yield* save.mutate('b');
        yield* validate.method('c');
        return () => undefined;
      });
    `);

    expect(messages).toEqual([
      'Imperative query.call(...) is forbidden from a craftEffect dependency graph. Trigger the resource from a declarative source or outside the effect.',
      'Imperative mutation.mutate(...) is forbidden from a craftEffect dependency graph. Trigger the resource from a declarative source or outside the effect.',
      'Imperative asyncProcess.method(...) is forbidden from a craftEffect dependency graph. Trigger the resource from a declarative source or outside the effect.',
    ]);
  });

  it('follows a craftGen dependency called by the effect', async () => {
    const { messages } = await lintFixture(`
      import { craftEffect, craftGen, craftUse, query } from '@craft-ng/core';

      const { users } = craftUse(query('users', { method: (value) => value, loader: () => Promise.resolve([]) }));
      const triggerUsers = craftGen(function* (value) {
        yield* users.call(value);
      });

      craftEffect('indirect', function* () {
        yield* triggerUsers('a');
        return () => undefined;
      });
    `);

    expect(messages).toEqual([
      'This craftEffect depends on a craftGen that imperatively calls query.call(...). Trigger the resource from a declarative source or outside the effect.',
    ]);
  });

  it('does not report triggers outside an effect or unused craftGen factories', async () => {
    const { messages } = await lintFixture(`
      import { craftGen, craftUse, query } from '@craft-ng/core';

      const { users } = craftUse(query('users', { method: (value) => value, loader: () => Promise.resolve([]) }));
      const triggerUsers = craftGen(function* (value) {
        yield* users.call(value);
      });

      users.call('outside');
      void triggerUsers('outside');
    `);

    expect(messages).toEqual([]);
  });
});

async function lintFixture(source: string): Promise<{ messages: string[] }> {
  const directory = await mkdtemp(
    join(tmpdir(), 'no-imperative-craft-resource-trigger-rule-'),
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

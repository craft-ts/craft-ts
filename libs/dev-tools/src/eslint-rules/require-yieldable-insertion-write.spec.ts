import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./require-yieldable-insertion-write.cjs');
const tempDirectories: string[] = [];

describe('require-yieldable-insertion-write', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('requires yield* for insertion-context writes in generator methods', async () => {
    const result = await lintFixture(`
      declare function insertion(
        factory: (context: {
          state: () => Generator<unknown, { page: number }, unknown>;
          patch: (value: { page: number }) => { page: number };
          update: (value: { page: number }) => { page: number };
          set: (value: { page: number }) => { page: number };
        }) => unknown,
      ): void;

      insertion(({ state, patch, update, set }) => ({
        nextPage: function* () {
          const current = yield* state();
          return patch(current);
        },
        previousPage: function* () {
          return update({ page: 1 });
        },
        reset: function* () {
          set({ page: 1 });
        },
      }));
    `);

    expect(result.messages).toEqual([
      'Insertion writes through set(...), patch(...), and update(...) must be delegated with `yield*` inside a generator function.',
      'Insertion writes through set(...), patch(...), and update(...) must be delegated with `yield*` inside a generator function.',
      'Insertion writes through set(...), patch(...), and update(...) must be delegated with `yield*` inside a generator function.',
    ]);
  });

  it('allows direct returns in ordinary callbacks and delegated writes', async () => {
    const result = await lintFixture(`
      declare function insertion(
        factory: (context: { patch: (value: { page: number }) => { page: number } }) => unknown,
      ): void;

      insertion(({ patch }) => ({
        nextPage: function* () {
          return yield* patch({ page: 2 });
        },
        updatePageSize: (pageSize: number) => patch({ page: pageSize }),
      }));
    `);

    expect(result.messages).toEqual([]);
  });
});

async function lintFixture(source: string) {
  const directory = await mkdtemp(
    join(tmpdir(), 'require-yieldable-insertion-write-rule-'),
  );
  tempDirectories.push(directory);
  await writeFile(
    join(directory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2022',
        module: 'preserve',
      },
      include: ['fixture.ts'],
    }),
  );
  await writeFile(join(directory, 'fixture.ts'), source);

  const eslint = new ESLint({
    cwd: directory,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            project: './tsconfig.json',
            tsconfigRootDir: directory,
          },
        },
        plugins: { local: { rules: { write: rule as never } } },
        rules: { 'local/write': 'error' },
      },
    ],
  });

  const [result] = await eslint.lintFiles(['fixture.ts']);
  return {
    messages: result.messages.map((message) => message.message),
  };
}

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-redundant-primitive-insertion.cjs');
const tempDirectories: string[] = [];

describe('no-redundant-primitive-insertion', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('reports native query properties re-declared by an insertion', async () => {
    const { messages } = await lintFixture(`
      import { computed } from '@angular/core';
      import { craftComputed, query } from '@craft-ts/core';

      query('users', {}, ({ resource }) => ({
        status: craftComputed('status', function* () {
          return yield* resource.status();
        }),
        isLoading: craftComputed('isLoading', function* () {
          const currentStatus = yield* resource.status();
          return currentStatus === 'loading' || currentStatus === 'reloading';
        }),
        value: computed(() => resource.value()),
        hasValue: craftComputed('hasValue', () => resource.hasValue()),
      }));
    `);

    expect(messages).toEqual([
      "'status' is already provided by the primitive; do not re-declare it in an insertion without additional logic.",
      "'isLoading' is already provided by the primitive; do not re-declare it in an insertion without additional logic.",
      "'value' is already provided by the primitive; do not re-declare it in an insertion without additional logic.",
      "'hasValue' is already provided by the primitive; do not re-declare it in an insertion without additional logic.",
    ]);
  });

  it('recognizes effect primitives and piped insertion callbacks', async () => {
    const { messages } = await lintFixture(`
      import { craftComputed, insertQueryPipe } from '@craft-ts/core';
      import { queryEffect } from '@craft-ts/effect';

      queryEffect(
        'users',
        {},
        insertQueryPipe(
          ({ resource }) => ({
            status: craftComputed('status', function* () {
              return yield* resource.status();
            }),
          }),
          ({ resource }) => ({
            isLoading: craftComputed('isLoading', () => resource.isLoading()),
          }),
        ),
      );
    `);

    expect(messages).toEqual([
      "'status' is already provided by the primitive; do not re-declare it in an insertion without additional logic.",
      "'isLoading' is already provided by the primitive; do not re-declare it in an insertion without additional logic.",
    ]);
  });

  it('allows renamed values and properties with additional logic', async () => {
    const { messages } = await lintFixture(`
      import { craftComputed, query } from '@craft-ts/core';

      query('users', {}, ({ resource }) => ({
        currentStatus: craftComputed('currentStatus', function* () {
          return yield* resource.status();
        }),
        status: craftComputed('status', function* () {
          const currentStatus = yield* resource.status();
          return currentStatus === 'resolved' ? 'ready' : currentStatus;
        }),
      }));

      const notAnInsertion = ({ resource }) => ({
        status: craftComputed('status', function* () {
          return yield* resource.status();
        }),
      });
    `);

    expect(messages).toEqual([]);
  });
});

async function lintFixture(
  source: string,
): Promise<{ messages: string[]; output: string }> {
  const directory = await mkdtemp(
    join(tmpdir(), 'no-redundant-primitive-insertion-rule-'),
  );
  tempDirectories.push(directory);
  const filePath = join(directory, 'fixture.ts');
  await writeFile(filePath, source.trimStart(), 'utf8');

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
        plugins: { local: { rules: { rule: rule as never } } },
        rules: { 'local/rule': 'error' },
      },
    ],
  });

  const [result] = await eslint.lintFiles(['fixture.ts']);
  return {
    messages: result.messages.map((message) => message.message),
    output: result.output ?? (await readFile(filePath, 'utf8')),
  };
}

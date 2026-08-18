import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-invalid-insertion-pipe.cjs');
const tempDirectories: string[] = [];

describe('no-invalid-insertion-pipe', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('reports empty callbacks for every typed insertion pipe', async () => {
    const { messages } = await lintFixture(`
      import {
        insertAsyncProcessPipe,
        insertMutationPipe,
        insertQueryParamsPipe,
        insertQueryPipe,
        insertStatePipe,
      } from '@craft-ts/core';

      insertAsyncProcessPipe(() => ({ value: 1 }), () => ({}));
      insertMutationPipe(() => ({ value: 1 }), function () { return {}; });
      insertQueryParamsPipe(() => ({ value: 1 }), () => ({}) as Record<string, never>);
      insertQueryPipe(() => ({ value: 1 }), () => { return {}; });
      insertStatePipe(() => ({ value: 1 }), () => ({}));
    `);

    expect(messages).toEqual([
      "'insertAsyncProcessPipe' cannot contain an insertion callback that returns an empty object.",
      "'insertMutationPipe' cannot contain an insertion callback that returns an empty object.",
      "'insertQueryParamsPipe' cannot contain an insertion callback that returns an empty object.",
      "'insertQueryPipe' cannot contain an insertion callback that returns an empty object.",
      "'insertStatePipe' cannot contain an insertion callback that returns an empty object.",
    ]);
  });

  it('reports a pipe with one insertion and removes its wrapper', async () => {
    const { messages, output } = await lintFixture(
      `
        import * as core from '@craft-ts/core';

        const insertion = core.insertQueryPipe(() => ({ value: 1 }));
      `,
      { fix: true },
    );

    expect(messages).toEqual([]);
    expect(output).toContain('const insertion = () => ({ value: 1 });');
  });

  it('allows meaningful multiple insertions and non-callback insertions', async () => {
    const { messages } = await lintFixture(`
      import { insertQueryPipe } from '@craft-ts/core';

      insertQueryPipe(
        () => ({ value: 1 }),
        ({ insertions }) => ({ next: insertions.value }),
      );
      insertQueryPipe(insertDeepYieldable(), () => ({ value: 1 }));
    `);

    expect(messages).toEqual([]);
  });
});

async function lintFixture(
  source: string,
  options: { fix?: boolean } = {},
): Promise<{ messages: string[]; output: string }> {
  const directory = await mkdtemp(
    join(tmpdir(), 'no-invalid-insertion-pipe-rule-'),
  );
  tempDirectories.push(directory);
  const filePath = join(directory, 'fixture.ts');
  await writeFile(filePath, source.trimStart(), 'utf8');

  const eslint = new ESLint({
    cwd: directory,
    fix: options.fix,
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

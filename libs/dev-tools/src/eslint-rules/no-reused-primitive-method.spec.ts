import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-reused-primitive-method.cjs');
const tempDirectories: string[] = [];

describe('no-reused-primitive-method', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('accepts an exposed insertion method used once', async () => {
    const { messages } = await lint(`
      import { queryParams } from '@craft-ts/core';

      const pagination = queryParams(
        'pagination',
        {},
        ({ patch }) => ({
          nextPage: () => patch({ page: 2 }),
        }),
      );

      button({ click: pagination.nextPage });
    `);

    expect(messages).toEqual([]);
  });

  it('reports a method used at two call sites', async () => {
    const { messages } = await lint(`
      import { queryParams } from '@craft-ts/core';

      const pagination = queryParams(
        'pagination',
        {},
        ({ patch }) => ({
          nextPage: () => patch({ page: 2 }),
        }),
      );

      button({ click: pagination.nextPage });
      button({ click: pagination.nextPage });
    `);

    expect(messages).toEqual([
      "Primitive method 'pagination.nextPage' is used at multiple call sites in this file. Create one method per call site.",
    ]);
  });

  it('counts an explicit generator call and supports a simple primitive alias', async () => {
    const { messages } = await lint(`
      import { state } from '@craft-ts/core';

      const counter = state(
        'counter',
        0,
        ({ update }) => ({
          increment: () => update((value) => value + 1),
        }),
      );
      const alias = counter;

      function* incrementFromMethod() {
        yield* alias.increment();
      }
      button({ click: counter.increment });
    `);

    expect(messages).toEqual([
      "Primitive method 'counter.increment' is used at multiple call sites in this file. Create one method per call site.",
    ]);
  });

  it('does not report methods bound internally with on$', async () => {
    const { messages } = await lint(`
      import { on$, source$, state } from '@craft-ts/core';

      const reset$ = source$('reset$');
      const counter = state(
        'counter',
        0,
        ({ set }) => ({
          reset: on$(reset$, () => set(0)),
        }),
      );

      void counter;
    `);

    expect(messages).toEqual([]);
  });

  it('recognizes methods inside a typed insertion pipe', async () => {
    const { messages } = await lint(`
      import { insertQueryParamsPipe, queryParams } from '@craft-ts/core';

      const pagination = queryParams(
        'pagination',
        {},
        insertQueryParamsPipe(
          ({ patch }) => ({ nextPage: () => patch({ page: 2 }) }),
        ),
      );

      button({ click: pagination.nextPage });
      button({ click: pagination.nextPage });
    `);

    expect(messages).toHaveLength(1);
  });
});

async function lint(source: string): Promise<{ messages: string[]; output: string }> {
  const directory = await mkdtemp(
    join(tmpdir(), 'no-reused-primitive-method-rule-'),
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

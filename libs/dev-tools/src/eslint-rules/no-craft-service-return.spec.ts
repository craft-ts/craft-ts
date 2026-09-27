import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const noCraftServiceReturnRule = require('./no-craft-service-return.cjs');

const tempDirectories: string[] = [];

const NO_RETURN =
  'A craftService cannot return: its API is the named primitives it yields. Remove the return (wrap what must stay internal in craftPrivate(...), expose other values with craftExpose(name, value)).';
const NOT_GENERATOR =
  'A craftService factory must be a generator (function* () { ... }): its API is the named primitives it yields.';

describe('no-craft-service-return', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('accepts a factory that only yields its primitives', async () => {
    const { messages } = await lintFixture({
      'src/app/todo.ts': `
        import { craftService, state } from '@craft-ts/core';

        export const { Todo } = craftService({ name: 'Todo', providedIn: 'global' }, function* () {
          yield* state('items', []);
        });
      `,
    });

    expect(messages).toEqual([]);
  });

  it('ignores returns of nested functions', async () => {
    const { messages } = await lintFixture({
      'src/app/todo.ts': `
        import { craftExpose, craftService } from '@craft-ts/core';

        export const { Todo } = craftService({ name: 'Todo', providedIn: 'global' }, function* () {
          yield* craftExpose('format', (value: number) => {
            return String(value);
          });
        });
      `,
    });

    expect(messages).toEqual([]);
  });

  it('ignores an abstract marker', async () => {
    const { messages } = await lintFixture({
      'src/app/user.ts': `
        import { abstract, craftService } from '@craft-ts/core';

        export const { User } = craftService({ name: 'User', providedIn: 'abstract' }, abstract<{ name: string }>());
      `,
    });

    expect(messages).toEqual([]);
  });

  it('removes a shorthand return and keeps the unreturned primitives private', async () => {
    const { messages, output } = await lintFixture(
      {
        'src/app/todo.ts': `
import { craftService, query, state } from '@craft-ts/core';

export const { Todo } = craftService({ name: 'Todo', providedIn: 'global' }, function* () {
  const draft = yield* state('draft', '');
  const todos = yield* query('todos', { params: () => true, loader: function* () { return []; } });
  yield* state('counter', 0);
  return { todos };
});
`,
      },
      { fix: true },
    );

    expect(messages).toEqual([]);
    expect(output).toBe(`import { craftService, query, state, craftPrivate } from '@craft-ts/core';

export const { Todo } = craftService({ name: 'Todo', providedIn: 'global' }, function* () {
  const draft = yield* craftPrivate(state('draft', ''));
  const todos = yield* query('todos', { params: () => true, loader: function* () { return []; } });
  yield* craftPrivate(state('counter', 0));
});
`);
  });

  it('reports a renamed key without a fix', async () => {
    const { messages, output } = await lintFixture(
      {
        'src/app/todo.ts': `
import { craftService, query } from '@craft-ts/core';

export const { Todo } = craftService({ name: 'Todo', providedIn: 'global' }, function* () {
  const todos = yield* query('todoList', { params: () => true, loader: function* () { return []; } });
  return { todos };
});
`,
      },
      { fix: true },
    );

    expect(messages).toEqual([NO_RETURN]);
    expect(output).toBe('');
  });

  it('reports a flattened member without a fix', async () => {
    const { messages } = await lintFixture({
      'src/app/todo.ts': `
        import { craftService, state } from '@craft-ts/core';

        export const { Todo } = craftService({ name: 'Todo', providedIn: 'global' }, function* () {
          const list = yield* state('list', [], ({ set }) => ({ clear: () => set([]) }));
          return { clear: list.clear };
        });
      `,
    });

    expect(messages).toEqual([NO_RETURN]);
  });

  it('reports a primitive returned alone', async () => {
    const { messages } = await lintFixture({
      'src/app/todo.ts': `
        import { craftService, state } from '@craft-ts/core';

        export const { Todo } = craftService({ name: 'Todo', providedIn: 'global' }, function* () {
          const list = yield* state('list', []);
          return list;
        });
      `,
    });

    expect(messages).toEqual([NO_RETURN]);
  });

  it('reports a non-generator factory', async () => {
    const { messages } = await lintFixture({
      'src/app/todo.ts': `
        import { craftService } from '@craft-ts/core';

        export const { Todo } = craftService({ name: 'Todo', providedIn: 'global' }, () => ({}));
      `,
    });

    expect(messages).toEqual([NOT_GENERATOR]);
  });
});

async function lintFixture(
  files: Record<string, string>,
  options: { fix?: boolean } = {},
): Promise<{ messages: string[]; output: string }> {
  const tempDirectory = await mkdtemp(
    join(tmpdir(), 'no-craft-service-return-rule-'),
  );
  tempDirectories.push(tempDirectory);

  await writeFixtureFiles(tempDirectory, {
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: { module: 'preserve', strict: true, target: 'ES2022' },
        include: ['src/**/*.ts'],
      },
      null,
      2,
    ),
    ...files,
  });

  const eslint = new ESLint({
    cwd: tempDirectory,
    fix: options.fix,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        },
        plugins: {
          local: {
            rules: {
              'no-craft-service-return': noCraftServiceReturnRule as never,
            },
          },
        },
        rules: {
          'local/no-craft-service-return': 'error',
        },
      },
    ],
  });

  const results = await eslint.lintFiles(['src/**/*.ts']);

  return {
    messages: results.flatMap((result) =>
      result.messages.map((message) => message.message),
    ),
    output: results.map((result) => result.output ?? '').join('\n'),
  };
}

async function writeFixtureFiles(
  rootDirectory: string,
  files: Record<string, string>,
): Promise<void> {
  for (const [relativePath, source] of Object.entries(files)) {
    const filePath = join(rootDirectory, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, source.trimStart(), 'utf8');
  }
}

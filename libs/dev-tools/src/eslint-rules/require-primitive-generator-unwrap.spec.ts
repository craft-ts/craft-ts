import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const requireUnwrapRule = require('./require-primitive-generator-unwrap.cjs');

const tempDirectories: string[] = [];

describe('require-primitive-generator-unwrap', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('reports a bare primitive call inside a craftService generator factory', async () => {
    const { messages } = await lintFixture({
      'src/app/auth.ts': `
        import { craftService, mutation } from '@craft-ts/core';

        export const auth = craftService({ name: 'Auth', scope: 'global' }, function* () {
          const register = mutation({
            method: (p) => p,
            loader: () => Promise.resolve(p),
          });
          return { register };
        });
      `,
    });

    expect(messages).toEqual([
      "'mutation(...)' returns a primitive generator that must be consumed: use `yield* mutation(...)` inside a generator factory, or `craftUse(mutation(...))` elsewhere.",
    ]);
  });

  it('reports a bare primitive call in a component field', async () => {
    const { messages } = await lintFixture({
      'src/app/counter.ts': `
        import { state } from '@craft-ts/core';

        export class CounterComponent {
          readonly counter = state(0);
        }
      `,
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("'state(...)'");
  });

  it('does not report a consumed primitive (yield* or craftUse)', async () => {
    const { messages } = await lintFixture({
      'src/app/ok.ts': `
        import { craftService, craftUse, query, state } from '@craft-ts/core';

        export const users = craftService({ name: 'Users', scope: 'global' }, function* () {
          const list = yield* query({ params: () => true, loader: () => Promise.resolve([]) });
          return { list };
        });

        export class C {
          readonly s = craftUse(state(0));
        }
      `,
    });

    expect(messages).toEqual([]);
  });

  it('does not report a direct factory return or a queryParams concise body', async () => {
    const { messages } = await lintFixture({
      'src/app/routes.ts': `
        import { craftService, query, queryParams } from '@craft-ts/core';

        export const slow = craftService({ name: 'Slow', scope: 'global' }, () =>
          query({ params: () => true, loader: () => Promise.resolve(1) }),
        );

        export const routes = [
          {
            path: 'list',
            queryParams: () => queryParams({ state: {} }),
          },
        ];
      `,
    });

    expect(messages).toEqual([]);
  });

  it('does not report a direct primitive return from a craftComponent factory', async () => {
    const { messages } = await lintFixture({
      'src/app/counter.ts': `
        import { craftComponent } from '@craft-ts/component';
        import { state } from '@craft-ts/core';

        export const Counter = craftComponent(
          'Counter',
          {},
          () => state('counter', 0),
          ({ counter }) => counter(),
        );
      `,
    });

    expect(messages).toEqual([]);
  });

  it('still reports a bare primitive inside a craftComponent generator factory', async () => {
    const { messages } = await lintFixture({
      'src/app/counter.ts': `
        import { craftComponent } from '@craft-ts/component';
        import { state } from '@craft-ts/core';

        export const Counter = craftComponent(
          'Counter',
          {},
          function* () {
            const counter = state('counter', 0);
            return { counter };
          },
          ({ counter }) => counter(),
        );
      `,
    });

    expect(messages).toEqual([
      "'state(...)' returns a primitive generator that must be consumed: use `yield* state(...)` inside a generator factory, or `craftUse(state(...))` elsewhere.",
    ]);
  });

  it('does not treat the craftComponent template as a primitive factory', async () => {
    const { messages } = await lintFixture({
      'src/app/counter.ts': `
        import { craftComponent } from '@craft-ts/component';
        import { state } from '@craft-ts/core';

        export const Counter = craftComponent(
          'Counter',
          {},
          () => ({}),
          () => state('counter', 0),
        );
      `,
    });

    expect(messages).toEqual([
      "'state(...)' returns a primitive generator that must be consumed: use `yield* state(...)` inside a generator factory, or `craftUse(state(...))` elsewhere.",
    ]);
  });

  it('does not report destructured readers or non-imported identifiers', async () => {
    const { messages } = await lintFixture({
      'src/app/reader.ts': `
        import { state as craftState } from '@craft-ts/core';

        export const selectors = ({ patch, state }) => state().page;

        const state = (value) => value;
        export const local = state(1);
      `,
    });

    expect(messages).toEqual([]);
  });

  it('autofixes with yield* inside a generator factory', async () => {
    const { output } = await lintFixture(
      {
        'src/app/auth.ts': `
        import { craftService, mutation } from '@craft-ts/core';

        export const auth = craftService({ name: 'Auth', scope: 'global' }, function* () {
          const register = mutation({
            method: (p) => p,
            loader: () => Promise.resolve(p),
          });
          return { ...mutation({ method: (p) => p, loader: () => Promise.resolve(p) }), register };
        });
      `,
      },
      { fix: true },
    );

    expect(output).toContain('const register = yield* mutation({');
    expect(output).toContain('...(yield* mutation({');
  });

  it('autofixes with craftUse outside a generator and imports it', async () => {
    const { output } = await lintFixture(
      {
        'src/app/counter.ts': `
        import { state } from '@craft-ts/core';

        export class CounterComponent {
          readonly counter = state(0);
        }
      `,
      },
      { fix: true },
    );

    expect(output).toContain('readonly counter = craftUse(state(0));');
    expect(output).toContain("import { state, craftUse } from '@craft-ts/core';");
  });
});

async function lintFixture(
  files: Record<string, string>,
  options: { fix?: boolean } = {},
): Promise<{ messages: string[]; output: string }> {
  const tempDirectory = await mkdtemp(
    join(tmpdir(), 'require-primitive-generator-unwrap-rule-'),
  );
  tempDirectories.push(tempDirectory);

  await writeFixtureFiles(tempDirectory, {
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: {
          module: 'preserve',
          strict: true,
          target: 'ES2022',
        },
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
          parserOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
          },
        },
        plugins: {
          local: {
            rules: {
              'require-primitive-generator-unwrap': requireUnwrapRule as never,
            },
          },
        },
        rules: {
          'local/require-primitive-generator-unwrap': 'error',
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

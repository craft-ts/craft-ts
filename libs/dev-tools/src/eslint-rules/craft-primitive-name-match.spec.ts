import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const primitiveNameMatchRules = require('./craft-primitive-name-match.cjs');

const tempDirectories: string[] = [];

describe('craft primitive name-match rules', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it.each([
    ['state', "state('count', 0)"],
    ['query', "query('count', { params: () => 1, loader: function* () { return 1; } })"],
    ['mutation', "mutation('count', { method: (x: number) => x, loader: function* () { return 1; } })"],
    ['asyncProcess', "asyncProcess('count', { method: (x: number) => x, loader: function* () { return 1; } })"],
    ['queryParams', "queryParams('count', { page: { parse: Number, serialize: String } })"],
  ])('accepts a %s whose name matches its binding', async (_, call) => {
    const { messages } = await lintFixture(`
      import { asyncProcess, mutation, query, queryParams, state } from '@craft-ts/core';

      function* setup() {
        const count = yield* ${call};
      }
    `);

    expect(messages).toEqual([]);
  });

  it.each([
    ['state', "state('total', 0)"],
    ['query', "query('total', { params: () => 1, loader: function* () { return 1; } })"],
    ['mutation', "mutation('total', { method: (x: number) => x, loader: function* () { return 1; } })"],
    ['asyncProcess', "asyncProcess('total', { method: (x: number) => x, loader: function* () { return 1; } })"],
    ['queryParams', "queryParams('total', { page: { parse: Number, serialize: String } })"],
  ])('reports and fixes a %s whose name differs from its binding', async (callee, call) => {
    const { messages, output } = await lintFixture(
      `
import { asyncProcess, mutation, query, queryParams, state } from '@craft-ts/core';

function* setup() {
  const count = yield* ${call};
}
`,
      { fix: true },
    );

    expect(messages).toEqual([]);
    expect(output).toContain(`const count = yield* ${callee}('count',`);
  });

  it('names an unnamed state after its binding', async () => {
    const { output } = await lintFixture(
      `
import { craftUse, state } from '@craft-ts/core';

export class Page {
  readonly draft = craftUse(state(''));
}
`,
      { fix: true },
    );

    expect(output).toContain("readonly draft = craftUse(state('draft', ''));");
  });

  it('sees through craftPrivate', async () => {
    const { messages } = await lintFixture(`
      import { craftPrivate, state } from '@craft-ts/core';

      function* setup() {
        const draft = yield* craftPrivate(state('text', ''));
      }
    `);

    expect(messages).toEqual([
      "state first argument 'text' must match the declared name 'draft'.",
    ]);
  });

  it('does not rename a primitive a craftService exposes', async () => {
    const { messages, output } = await lintFixture(
      `
import { craftService, query } from '@craft-ts/core';

export const { Users } = craftService({ name: 'Users', providedIn: 'global' }, function* () {
  const users = yield* query('userList', { params: () => 1, loader: function* () { return []; } });
});
`,
      { fix: true },
    );

    expect(messages).toEqual([
      "query first argument 'userList' must match the declared name 'users'.",
    ]);
    expect(output).toContain("query('userList',");
  });

  it('ignores a destructured state reader of an insertion', async () => {
    const { messages } = await lintFixture(`
      import { state } from '@craft-ts/core';

      function* setup() {
        const counter = yield* state('counter', 0, ({ state }) => ({
          double: () => {
            const current = state();
            return current;
          },
        }));
      }
    `);

    expect(messages).toEqual([]);
  });
});

async function lintFixture(
  source: string,
  options: { fix?: boolean } = {},
): Promise<{ messages: string[]; output: string }> {
  const tempDirectory = await mkdtemp(
    join(tmpdir(), 'craft-primitive-name-match-rule-'),
  );
  tempDirectories.push(tempDirectory);

  const filePath = join(tempDirectory, 'src/app/demo.ts');
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, source.trimStart(), 'utf8');

  const rules = primitiveNameMatchRules as Record<string, never>;
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
        plugins: { local: { rules } },
        rules: Object.fromEntries(
          Object.keys(rules).map((name) => [`local/${name}`, 'error']),
        ),
      },
    ],
  });

  const results = await eslint.lintFiles(['src/**/*.ts']);
  if (options.fix) await ESLint.outputFixes(results);

  return {
    messages: results.flatMap((result) =>
      result.messages.map((message) => message.message),
    ),
    output: await readFile(filePath, 'utf8'),
  };
}

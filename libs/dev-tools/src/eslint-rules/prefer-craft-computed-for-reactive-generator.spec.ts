import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./prefer-craft-computed-for-reactive-generator.cjs');
const tempDirectories: string[] = [];

describe('prefer-craft-computed-for-reactive-generator', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it('reports a zero-argument generator exposed as a reactive reader', async () => {
    const result = await lintFixture(`
      function* view() {
        const system = function* () {
          return DEMO_CLIENTS[yield* clientCurrency.client()].units;
        };
        yield* craftExpose('system', system);
      }
    `);

    expect(result.messages).toEqual([
      'This zero-argument generator only returns a value derived from yielded reads. Declare it with `yield* craftComputed("system", function* () { ... })` so it is modeled as a reactive computed value.',
    ]);
  });

  it('reports a generator wrapped in craftGen', async () => {
    const result = await lintFixture(`
      function* view() {
        yield* craftExpose('system', craftGen(function* () {
          return yield* clientCurrency.client();
        }));
      }
    `);

    expect(result.messages).toHaveLength(1);
  });

  it('allows parameterized generators, actions, and plain generators', async () => {
    const result = await lintFixture(`
      function* view() {
        yield* craftExpose('byId', function* (id: string) {
          return yield* users.get(id);
        });
        yield* craftExpose('refresh', function* () {
          yield* resource.refresh();
          return resource.value();
        });
        yield* craftExpose('constant', function* () {
          return 'metric';
        });
      }
    `);

    expect(result.messages).toEqual([]);
  });
});

async function lintFixture(source: string): Promise<{ messages: string[] }> {
  const directory = await mkdtemp(
    join(tmpdir(), 'prefer-craft-computed-for-reactive-generator-'),
  );
  tempDirectories.push(directory);
  const file = join(directory, 'src/fixture.ts');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(
    file,
    `
      declare const RAW_REACTIVE_VALUE: unique symbol;
      type Reader<T> = (() => Generator<unknown, T, unknown>) & {
        readonly [RAW_REACTIVE_VALUE]: () => T;
      };
      declare const clientCurrency: { client: Reader<string> };
      declare const users: { get: (id: string) => Generator<unknown, string, unknown> };
      declare const resource: {
        refresh: () => Generator<unknown, void, unknown>;
        value: () => string;
      };
      declare function craftExpose(name: string, value: unknown): Generator<unknown, void, unknown>;
      declare function craftGen<GenFn extends (...args: any[]) => Generator<any, any, any>>(
        generator: GenFn,
      ): (...args: Parameters<GenFn>) => Generator<unknown, ReturnType<GenFn>, unknown>;
      ${source}
    `,
  );
  await writeFile(
    join(directory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { strict: true },
      include: ['src/**/*.ts'],
    }),
  );

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
        plugins: { local: { rules: { rule: rule as never } } },
        rules: { 'local/rule': 'error' },
      },
    ],
  });

  const [result] = await eslint.lintFiles(['src/**/*.ts']);
  return { messages: result.messages.map((message) => message.message) };
}

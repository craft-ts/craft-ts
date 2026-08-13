import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./require-yieldable-reactive-read.cjs');
const tempDirectories: string[] = [];

describe('require-yieldable-reactive-read', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it('requires yield* and accepts direct propagation', async () => {
    const messages = await lintFixture(`
      declare const RAW_REACTIVE_VALUE: unique symbol;
      type Reader<T> = (() => Generator<unknown, T, unknown>) & {
        readonly [RAW_REACTIVE_VALUE]: () => T;
      };
      declare const counter: Reader<number>;

      function* invalid() { return counter(); }
      function invalidBlock() { const value = counter(); return value; }
      function* valid() { return yield* counter(); }
      function testBoundary() { return craftUse(counter()); }
      declare function craftUse<T>(value: Generator<unknown, T, unknown>): T;
    `);

    expect(messages).toEqual([
      'Craft reactive values must be read with `yield*` inside a generator function.',
      'A function that reads a Craft reactive value must be a generator and delegate the read with `yield*`.',
    ]);
  });
});

async function lintFixture(source: string): Promise<string[]> {
  const directory = await mkdtemp(
    join(tmpdir(), 'require-yieldable-reactive-read-'),
  );
  tempDirectories.push(directory);
  const file = join(directory, 'src/fixture.ts');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, source);
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
            project: './tsconfig.json',
            tsconfigRootDir: directory,
          },
        },
        plugins: { local: { rules: { reactive: rule as never } } },
        rules: { 'local/reactive': 'error' },
      },
    ],
  });

  const results = await eslint.lintFiles(['src/**/*.ts']);
  return results.flatMap((result) =>
    result.messages.map((message) => message.message),
  );
}

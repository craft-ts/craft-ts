import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./prefer-craft-computed-for-reactive-array-length.cjs');
const recommended = require('./recommended-config.cjs');
const tempDirectories: string[] = [];

describe('prefer-craft-computed-for-reactive-array-length', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it('reports direct and nested reactive array length reads', async () => {
    const result = await lintFixture(`
      function* template() {
        const hidden = (yield* view.messages()).length === 0;
        const label = plural((yield* (yield* ReplayResumesViewModel()).derived()).length);
      }
    `);

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toContain('Expose a scalar `craftComputed`');
    expect(result.messages[1]).toContain('Expose a scalar `craftComputed`');
  });

  it('allows local arrays and length reads within a computed declaration', async () => {
    const result = await lintFixture(`
      function* service() {
        yield* craftComputed('count', function* () {
          return (yield* view.messages()).length;
        });
        const local = [1, 2];
        return local.length;
      }
    `);

    expect(result.messages).toEqual([]);
  });

  it('is enabled as an error by the recommended preset', () => {
    expect(
      recommended['craft-ts/prefer-craft-computed-for-reactive-array-length'],
    ).toBe('error');
  });
});

async function lintFixture(source: string): Promise<{ messages: string[] }> {
  const directory = await mkdtemp(
    join(tmpdir(), 'prefer-craft-computed-for-reactive-array-length-'),
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
      declare const view: { messages: Reader<string[]> };
      declare function ReplayResumesViewModel(): Generator<unknown, { derived: Reader<string[]> }, unknown>;
      declare function plural(count: number): string;
      declare function craftComputed<T>(name: string, generator: () => Generator<unknown, T, unknown>): Generator<unknown, Reader<T>, unknown>;
      ${source}
    `,
  );
  await writeFile(
    join(directory, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { strict: true }, include: ['src/**/*.ts'] }),
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

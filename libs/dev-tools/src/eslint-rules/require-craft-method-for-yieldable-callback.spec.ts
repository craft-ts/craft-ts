import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./require-craft-method-for-yieldable-callback.cjs');
const tempDirectories: string[] = [];

describe('require-craft-method-for-yieldable-callback', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('reports a bound callback that calls a yieldable method', async () => {
    const result = await lintFixture(`
      declare const YIELDABLE_METHOD: unique symbol;
      type YieldableMethod = ((
        value: number,
      ) => Generator<void, void, unknown>) & {
        readonly [YIELDABLE_METHOD]: true;
      };
      declare const pagination: { updatePageSize: YieldableMethod };
      declare function craftComponent(...args: unknown[]): unknown;
      declare function select(...args: unknown[]): unknown;

      craftComponent('Demo', {}, function* () {
        const updatePageSize = (event: Event) =>
          pagination.updatePageSize(Number((event.target as HTMLSelectElement).value));
        return select({ change: updatePageSize });
      });
    `);

    expect(result.messages).toEqual([
      "Callback 'updatePageSize' calls a yieldable Craft method and must be created with `craftMethod(...)`.",
    ]);
  });

  it('reports an inline bound callback', async () => {
    const result = await lintFixture(`
      declare const YIELDABLE_METHOD: unique symbol;
      type YieldableMethod = (() => Generator<void, void, unknown>) & {
        readonly [YIELDABLE_METHOD]: true;
      };
      declare const action: YieldableMethod;
      declare function craftComponent(...args: unknown[]): unknown;
      declare function button(...args: unknown[]): unknown;

      craftComponent('Demo', {}, function* () {
        return button({ run: () => action() });
      });
    `);

    expect(result.messages).toEqual([
      "Callback 'run' calls a yieldable Craft method and must be created with `craftMethod(...)`.",
    ]);
  });

  it('accepts a callback created with craftMethod', async () => {
    const result = await lintFixture(`
      declare const YIELDABLE_METHOD: unique symbol;
      type YieldableMethod = ((
        value: number,
      ) => Generator<void, void, unknown>) & {
        readonly [YIELDABLE_METHOD]: true;
      };
      declare const pagination: { updatePageSize: YieldableMethod };
      declare function craftComponent(...args: unknown[]): unknown;
      declare function craftMethod(name: string, factory: Function): Function;
      declare function select(...args: unknown[]): unknown;

      craftComponent('Demo', {}, function* () {
        const updatePageSize = craftMethod('updatePageSize', function* (value: number) {
          yield* pagination.updatePageSize(value);
        });
        return select({ change: updatePageSize });
      });
    `);

    expect(result.messages).toEqual([]);
  });

  it('ignores ordinary bound callbacks and nested functions', async () => {
    const result = await lintFixture(`
      declare const YIELDABLE_METHOD: unique symbol;
      type YieldableMethod = (() => Generator<void, void, unknown>) & {
        readonly [YIELDABLE_METHOD]: true;
      };
      declare const action: YieldableMethod;
      declare function craftComponent(...args: unknown[]): unknown;
      declare function button(...args: unknown[]): unknown;

      craftComponent('Demo', {}, function* () {
        const nested = () => action();
        return button({ log: () => console.log('ok') });
      });
    `);

    expect(result.messages).toEqual([]);
  });
});

async function lintFixture(source: string) {
  const directory = await mkdtemp(
    join(tmpdir(), 'require-craft-method-for-yieldable-callback-rule-'),
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
        plugins: { local: { rules: { rule: rule as never } } },
        rules: { 'local/rule': 'error' },
      },
    ],
  });

  const [result] = await eslint.lintFiles(['fixture.ts']);
  return {
    messages: result.messages.map((message) => message.message),
  };
}

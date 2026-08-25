import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-craft-computed-side-effects.cjs');
const tempDirectories: string[] = [];

describe('no-craft-computed-side-effects', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('allows reactive reads, pure transformations, and settled', async () => {
    const result = await lintFixture(`
      declare const RAW_REACTIVE_VALUE: unique symbol;
      type Read<T> = (() => Generator<never, T, unknown>) & {
        readonly [RAW_REACTIVE_VALUE]: true;
      };
      declare const state: Read<number>;
      declare const resource: { settledValue: Read<number> };
      declare function settled(value: unknown): Generator<never, number, unknown>;
      declare function find(value: number): number;
      declare function craftComputed(name: string, factory: Function): unknown;

      craftComputed('allowed', function* () {
        const current = yield* state();
        const ready = yield* settled(resource);
        return find(current + ready) + Math.max(current, ready);
      });
    `);

    expect(result.messages).toEqual([]);
  });

  it('allows a declared-synchronous Effect run through syncEffect', async () => {
    const result = await lintFixture(`
      declare const RAW_REACTIVE_VALUE: unique symbol;
      type Read<T> = (() => Generator<never, T, unknown>) & {
        readonly [RAW_REACTIVE_VALUE]: true;
      };
      declare const state: Read<number>;
      declare function cartTotal(qty: number): unknown;
      declare function syncEffect(effect: unknown): Generator<never, string, unknown>;
      declare function craftComputed(name: string, factory: Function): unknown;

      craftComputed('totalLabel', function* () {
        const qty = yield* state();
        return yield* syncEffect(cartTotal(qty));
      });
    `);

    expect(result.messages).toEqual([]);
  });

  it('allows component input reads as reactive dependencies', async () => {
    const result = await lintFixture(`
      declare const INPUT_BRAND: unique symbol;
      type Input<T> = (() => Generator<never, T, unknown>) & {
        readonly [INPUT_BRAND]: T;
      };
      declare const photoId: Input<string>;
      declare function craftComputed(name: string, factory: Function): unknown;

      craftComputed('hasPhoto', function* () {
        return (yield* photoId()) === 'aurora';
      });
    `);

    expect(result.messages).toEqual([]);
  });

  it('reports yieldable writes, async generators, and promise-returning calls', async () => {
    const result = await lintFixture(`
      declare const YIELDABLE_METHOD: unique symbol;
      type Write = (() => void) & {
        readonly [YIELDABLE_METHOD]: true;
      };
      declare const state: { unset: Write };
      declare const CraftHttpClient: { get: () => Generator<never, number, unknown> };
      declare function craftSleep(ms: number): Generator<never, void, unknown>;
      declare function load(): Promise<number>;
      declare function craftComputed(name: string, factory: Function): unknown;

      craftComputed('forbidden', function* () {
        state.unset();
        yield* CraftHttpClient.get();
        yield* craftSleep(100);
        return yield* load();
      });
    `);

    expect(result.messages).toEqual([
      'Craft computed callbacks may only read reactive Craft values or use `settled(...)` / `syncEffect(...)`; `state.unset()` is not allowed because it can write or perform asynchronous work.',
      'Craft computed callbacks may only read reactive Craft values or use `settled(...)` / `syncEffect(...)`; `CraftHttpClient.get()` is not allowed because it can write or perform asynchronous work.',
      'Craft computed callbacks may only read reactive Craft values or use `settled(...)` / `syncEffect(...)`; `craftSleep()` is not allowed because it can write or perform asynchronous work.',
      'Craft computed callbacks may only read reactive Craft values or use `settled(...)` / `syncEffect(...)`; `load()` is not allowed because it can write or perform asynchronous work.',
    ]);
  });

  it('reports update-like methods even without type information about their result', async () => {
    const result = await lintFixture(`
      declare const state: { update: (value: number) => void; unset: () => void };
      declare function craftComputed(name: string, factory: Function): unknown;

      craftComputed('forbidden', () => {
        state.update(1);
        return state.unset();
      });
    `);

    expect(result.messages).toEqual([
      'Craft computed callbacks may only read reactive Craft values or use `settled(...)` / `syncEffect(...)`; `state.update()` is not allowed because it can write or perform asynchronous work.',
      'Craft computed callbacks may only read reactive Craft values or use `settled(...)` / `syncEffect(...)`; `state.unset()` is not allowed because it can write or perform asynchronous work.',
    ]);
  });

  it('reports await inside a computed callback', async () => {
    const result = await lintFixture(`
      declare function craftComputed(name: string, factory: Function): unknown;

      craftComputed('forbidden', async () => await 1);
    `);

    expect(result.messages).toEqual([
      'Craft computed callbacks may only read reactive Craft values or use `settled(...)` / `syncEffect(...)`; `await` is not allowed because it can write or perform asynchronous work.',
    ]);
  });

  it('does not inspect calls outside craftComputed callbacks', async () => {
    const result = await lintFixture(`
      declare const state: { update: (value: number) => void };
      declare function craftComputed(name: string, factory: Function): unknown;

      function outside() {
        state.update(1);
      }

      craftComputed('allowed', () => 1);
      void outside;
    `);

    expect(result.messages).toEqual([]);
  });
});

async function lintFixture(source: string) {
  const directory = await mkdtemp(
    join(tmpdir(), 'no-craft-computed-side-effects-rule-'),
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

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./require-yieldable-template-method.cjs');
const tempDirectories: string[] = [];

describe('require-yieldable-template-method', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('reports a branded yieldable method called without yield*', async () => {
    const result = await lintFixture(`
      declare const YIELDABLE_METHOD: unique symbol;
      type YieldableMethod = ((id: number) => void) & {
        readonly [YIELDABLE_METHOD]: true;
      };
      declare const store: { remove: { mutate: YieldableMethod } };
      declare function craftComponent(...args: unknown[]): unknown;

      craftComponent('Demo', {}, () => ({}), () =>
        button({ click: () => store.remove.mutate(1) }, 'Remove'),
      );
    `);

    expect(result.messages).toEqual([
      'Yieldable Craft method calls in templates must be delegated with `yield*`.',
    ]);
  });

  it('does not report ordinary methods or an already delegated call', async () => {
    const result = await lintFixture(`
      declare const YIELDABLE_METHOD: unique symbol;
      type YieldableMethod = ((id: number) => void) & {
        readonly [YIELDABLE_METHOD]: true;
      };
      declare const store: {
        remove: { mutate: YieldableMethod; log: (id: number) => void };
      };
      declare function craftComponent(...args: unknown[]): unknown;

      craftComponent('Demo', {}, () => ({}), () =>
        button({
          click: function* () {
            yield* store.remove.mutate(1);
            store.remove.log(1);
          },
        }, 'Remove'),
      );
    `);

    expect(result.messages).toEqual([]);
  });

  it('quick-fixes an arrow callback into a generator callback', async () => {
    const result = await lintFixture(
      `
        type YieldableMethod = (id: number) => Generator<void, void, unknown>;
        declare const store: { remove: { mutate: YieldableMethod } };
        declare function craftComponent(...args: unknown[]): unknown;

        craftComponent('Demo', {}, () => ({}), () =>
          button({ click: () => store.remove.mutate(1) }, 'Remove'),
        );
      `,
      true,
    );

    expect(result.output).toContain(
      "click: function* () { yield* store.remove.mutate(1); }",
    );
    expect(result.messages).toEqual([]);
  });

  it('quick-fixes a local wrapper used by the template', async () => {
    const result = await lintFixture(
      `
        type YieldableMethod = (id: number) => Generator<void, void, unknown>;
        declare const store: { remove: { mutate: YieldableMethod } };
        declare function craftComponent(...args: unknown[]): unknown;

        craftComponent('Demo', {}, function* () {
          const remove = (id: number) => {
            store.remove.mutate(id);
          };

          return { remove };
        }, ({ remove }) =>
          button({ click: () => remove(1) }, 'Remove'),
        );
      `,
      true,
    );

    expect(result.output).toContain(
      'const remove = function* (id: number) {',
    );
    expect(result.output).toContain('yield* store.remove.mutate(id);');
    expect(result.output).toContain(
      'click: function* () { yield* remove(1); }',
    );
    expect(result.messages).toEqual([]);
  });
});

async function lintFixture(source: string, fix = false) {
  const directory = await mkdtemp(
    join(tmpdir(), 'require-yieldable-template-method-rule-'),
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
    fix,
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
    output: result.output ?? '',
  };
}

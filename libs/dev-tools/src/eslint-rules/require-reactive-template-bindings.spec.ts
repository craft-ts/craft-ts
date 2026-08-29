import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./require-reactive-template-bindings.cjs');
const tempDirectories: string[] = [];

describe('require-reactive-template-bindings', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('reports direct reactive reads in text and element properties', async () => {
    const messages = await lintFixture(`
      declare const SIGNAL: unique symbol;
      type Signal<T> = (() => T) & { readonly [SIGNAL]: true };
      declare const count: Signal<number>;
      declare const disabled: Signal<boolean>;
      declare function craftComponent(...args: unknown[]): unknown;

      craftComponent('Demo', {}, () => ({}), () =>
        div({ class: { disabled: disabled() } }, [
          p(\`Count: \${count()}\`),
        ]),
      );
    `);

    expect(messages).toEqual([
      'Do not read a reactive value directly while building a Craft template. Wrap the rendered expression in a binding callback, for example `() => value()`.',
      'Do not read a reactive value directly while building a Craft template. Wrap the rendered expression in a binding callback, for example `() => value()`.',
    ]);
  });

  it('allows granular bindings, events, outputs, and static values', async () => {
    const messages = await lintFixture(`
      declare const YIELDABLE_VALUE: unique symbol;
      type CraftValue<T> = (() => T) & { readonly [YIELDABLE_VALUE]: 'value' };
      declare const value: CraftValue<string>;
      declare function craftComponent(...args: unknown[]): unknown;

      craftComponent('Demo', {}, () => ({}), () =>
        div({
          title: () => value(),
          click: () => console.log(value()),
        }, [
          p('Static'),
          p(() => value()),
          Child({ onReset: () => console.log(value()) }),
        ]),
      );
    `);

    expect(messages).toEqual([]);
  });

  it('reports derived business calls inside reactive bindings', async () => {
    const messages = await lintFixture(`
      declare const YIELDABLE_VALUE: unique symbol;
      type CraftValue<T> = (() => T) & { readonly [YIELDABLE_VALUE]: 'value' };
      type Answers = { readonly selected: string };
      declare const store: { readonly answers: CraftValue<Answers> };
      declare function isChoiceSelected(
        answers: Answers,
        questionId: string,
        choiceValue: string,
      ): boolean;
      declare function craftComponent(...args: unknown[]): unknown;

      craftComponent('Demo', {}, () => ({}), () =>
        button({
          'data-selected': function* () {
            return isChoiceSelected(
              yield* store.answers(),
              'question',
              'choice',
            );
          },
        }, 'Choice'),
      );
    `);

    expect(messages).toEqual([
      'Do not call a derived business helper from a reactive Craft template binding. Move the derivation to state(), craftComputed(), or query(), then bind the resulting value.',
    ]);
  });

  it('allows presentation conversion around reactive reads', async () => {
    const messages = await lintFixture(`
      declare const YIELDABLE_VALUE: unique symbol;
      type CraftValue<T> = (() => T) & { readonly [YIELDABLE_VALUE]: 'value' };
      declare const value: CraftValue<number>;
      declare function safeResourceUrl(value: unknown): string;
      declare function craftComponent(...args: unknown[]): unknown;

      craftComponent('Demo', {}, () => ({}), () =>
        p({
          'data-value': function* () {
            return String(yield* value());
          },
        }, 'Value'),
        img({
          src: function* () {
            return safeResourceUrl(yield* value());
          },
        }),
      );
    `);

    expect(messages).toEqual([]);
  });

  it('checks structural branch templates but not their nested bindings', async () => {
    const messages = await lintFixture(`
      declare const INPUT_BRAND: unique symbol;
      type Input<T> = (() => T) & { readonly [INPUT_BRAND]: T };
      declare const value: Input<string>;
      declare function craftComponent(...args: unknown[]): unknown;

      craftComponent('Demo', {}, () => ({}), () =>
        ifNode(condition,
          () => p(value()),
          () => p(() => value()),
        ),
      );
    `);

    expect(messages).toEqual([
      'Do not read a reactive value directly while building a Craft template. Wrap the rendered expression in a binding callback, for example `() => value()`.',
    ]);
  });

  it('checks eager collection templates and allows reactive block sources', async () => {
    const messages = await lintFixture(`
      declare const SIGNAL: unique symbol;
      type Signal<T> = (() => T) & { readonly [SIGNAL]: true };
      declare const value: Signal<string>;
      declare function craftComponent(...args: unknown[]): unknown;

      craftComponent('Demo', {}, () => ({}), () => [
        [1].map((item) => option({ selected: item === value() }, item)),
        matchNode.exhaustive(() => value(), 'code', {
          failure: () => p(value()),
        }),
      ]);
    `);

    expect(messages).toEqual([
      'Do not read a reactive value directly while building a Craft template. Wrap the rendered expression in a binding callback, for example `() => value()`.',
      'Do not read a reactive value directly while building a Craft template. Wrap the rendered expression in a binding callback, for example `() => value()`.',
    ]);
  });
});

async function lintFixture(source: string): Promise<string[]> {
  const directory = await mkdtemp(
    join(tmpdir(), 'require-reactive-template-bindings-rule-'),
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
  return result.messages.map((message) => message.message);
}

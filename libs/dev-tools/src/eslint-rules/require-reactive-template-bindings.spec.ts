import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./require-reactive-template-bindings.cjs');
const plugin = require('./index.cjs');
const tempDirectories: string[] = [];

describe('require-reactive-template-bindings', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('is enabled as an error by the recommended preset', () => {
    expect(
      plugin.configs.recommended.rules[
        'craft-ts/require-reactive-template-bindings'
      ],
    ).toBe('error');
  });

  it('reports direct reactive reads in text and element properties', async () => {
    const messages = await lintFixture(`
      declare const SIGNAL: unique symbol;
      type Signal<T> = (() => T) & { readonly [SIGNAL]: true };
      declare const count: Signal<number>;
      declare const disabled: Signal<boolean>;
      declare function craftComponent(...args: unknown[]): unknown;

      craftComponent('Demo', {}, () =>
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

      craftComponent('Demo', {}, () =>
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

      craftComponent('Demo', {}, () =>
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
      'Do not call a derived helper or data transformation from a reactive Craft template binding. Expose the value through an insertion or service computed, then bind that value.',
    ]);
  });

  it('reports derived calls after a reactive value has been assigned locally', async () => {
    const messages = await lintFixture(`
      declare const YIELDABLE_VALUE: unique symbol;
      type CraftValue<T> = (() => T) & { readonly [YIELDABLE_VALUE]: 'value' };
      type Saved = { readonly createdAt: string };
      declare const item: CraftValue<Saved>;
      declare const sessionDate: { format(date: Date): string };
      declare function craftComponent(...args: unknown[]): unknown;

      craftComponent('Demo', {}, () =>
        span(function* () {
          const saved = yield* item();
          return sessionDate.format(new Date(saved.createdAt));
        }),
      );
    `);

    expect(messages).toEqual([
      'Do not call a derived helper or data transformation from a reactive Craft template binding. Expose the value through an insertion or service computed, then bind that value.',
    ]);
  });

  it('reports joining derived names inside a reactive binding', async () => {
    const messages = await lintFixture(`
      declare const YIELDABLE_VALUE: unique symbol;
      type CraftValue<T> = (() => T) & { readonly [YIELDABLE_VALUE]: 'value' };
      declare const selectedNames: CraftValue<readonly string[]>;
      declare function craftComponent(...args: unknown[]): unknown;

      craftComponent('Demo', {}, () =>
        span(function* () {
          return (yield* selectedNames()).join(', ');
        }),
      );
    `);

    expect(messages).toEqual([
      'Do not call a derived helper or data transformation from a reactive Craft template binding. Expose the value through an insertion or service computed, then bind that value.',
    ]);
  });

  it('reports zero-argument derived helpers but allows renderer and structural callbacks', async () => {
    const messages = await lintFixture(`
      declare function loadLabel(): string;
      declare function craftComponent(...args: unknown[]): unknown;

      craftComponent('Demo', {}, () => [
        span(function* () { return loadLabel(); }),
        ifNode('ready', () => true, () => p('Ready'), () => p('Waiting')),
      ]);
    `);

    expect(messages).toEqual([
      'Do not call a derived helper or data transformation from a reactive Craft template binding. Expose the value through an insertion or service computed, then bind that value.',
    ]);
  });

  it('allows presentation conversion around reactive reads', async () => {
    const messages = await lintFixture(`
      declare const YIELDABLE_VALUE: unique symbol;
      type CraftValue<T> = (() => T) & { readonly [YIELDABLE_VALUE]: 'value' };
      declare const value: CraftValue<number>;
      declare function safeResourceUrl(value: unknown): string;
      declare function assign(token: unknown, value: unknown): object;
      declare const fill: unknown;
      declare const unit: { pct(value: number): unknown };
      declare function craftComponent(...args: unknown[]): unknown;

      craftComponent('Demo', {}, () => [
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
        div({
          style: function* () {
            return assign(fill, yield* value());
          },
        }),
        div({
          style: function* () {
            return assign(fill, unit.pct(yield* value()));
          },
        }),
      ]);
    `);

    expect(messages).toEqual([]);
  });

  it('allows message interpolation helpers around reactive reads', async () => {
    const messages = await lintFixture(`
      declare const YIELDABLE_VALUE: unique symbol;
      type CraftValue<T> = (() => T) & { readonly [YIELDABLE_VALUE]: 'value' };
      type Messages = { queueSummary(items: number): string };
      declare const t: CraftValue<Messages>;
      declare const count: CraftValue<number>;
      declare function craftComponent(...args: unknown[]): unknown;

      craftComponent('Demo', {}, () =>
        p({ title: function* () {
          return (yield* t()).queueSummary(yield* count());
        }}, 'Queue'),
      );
    `);

    expect(messages).toEqual([]);
  });

  it('reads a heading content function as its text binding', async () => {
    const messages = await lintFixture(`
      declare const YIELDABLE_VALUE: unique symbol;
      type CraftValue<T> = (() => T) & { readonly [YIELDABLE_VALUE]: 'value' };
      type Messages = { title: string };
      declare const t: CraftValue<Messages>;
      declare function craftComponent(...args: unknown[]): unknown;

      craftComponent('Demo', {}, () => [
        heading(function* () {
          return (yield* t()).title;
        }),
        heading({ id: 'title' }, function* () {
          return (yield* t()).title;
        }),
      ]);
    `);

    expect(messages).toEqual([]);
  });

  it('checks structural branch templates but not their nested bindings', async () => {
    const messages = await lintFixture(`
      declare const INPUT_BRAND: unique symbol;
      type Input<T> = (() => T) & { readonly [INPUT_BRAND]: T };
      declare const value: Input<string>;
      declare function craftComponent(...args: unknown[]): unknown;

      craftComponent('Demo', {}, () =>
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

      craftComponent('Demo', {}, () => [
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

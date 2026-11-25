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
        return button({ click: () => action() });
      });
    `);

    expect(result.messages).toEqual([
      "Callback 'click' calls a yieldable Craft method and must be created with `craftMethod(...)`.",
    ]);
  });

  it('reports every event prop form the runtime binds as a listener', async () => {
    const result = await lintFixture(`
      declare const YIELDABLE_METHOD: unique symbol;
      type YieldableMethod = (() => Generator<void, void, unknown>) & {
        readonly [YIELDABLE_METHOD]: true;
      };
      declare const action: YieldableMethod;
      declare function craftComponent(...args: unknown[]): unknown;
      declare function input(...args: unknown[]): unknown;
      declare function form(...args: unknown[]): unknown;

      craftComponent('Demo', {}, () =>
        form(
          { onSubmit: () => action(), 'keydown': () => action() },
          input({ input: () => action(), change: () => action(), onDragStart: () => action() }),
        ),
      );
    `);

    expect(result.messages).toEqual([
      "Callback 'onSubmit' calls a yieldable Craft method and must be created with `craftMethod(...)`.",
      "Callback 'keydown' calls a yieldable Craft method and must be created with `craftMethod(...)`.",
      "Callback 'input' calls a yieldable Craft method and must be created with `craftMethod(...)`.",
      "Callback 'change' calls a yieldable Craft method and must be created with `craftMethod(...)`.",
      "Callback 'onDragStart' calls a yieldable Craft method and must be created with `craftMethod(...)`.",
    ]);
  });

  // Issue #50: a matchNode handler map renders nodes; it binds no event.
  it('ignores the render handlers of matchNode', async () => {
    const result = await lintFixture(`
      declare const YIELDABLE_METHOD: unique symbol;
      type YieldableMethod<Args extends unknown[], Result> = ((
        ...args: Args
      ) => Generator<unknown, Result, unknown>) & {
        readonly [YIELDABLE_METHOD]: true;
      };
      declare const Job: {
        readonly phase: YieldableMethod<[], 'running' | 'finished'>;
        readonly t: YieldableMethod<[key: 'loading' | 'done'], string>;
      };
      declare const matchNode: {
        (...args: unknown[]): unknown;
        exhaustive(...args: unknown[]): unknown;
      };
      declare function craftComponent(...args: unknown[]): unknown;
      declare function p(...args: unknown[]): unknown;

      export const JobStatus = craftComponent('JobStatus', {}, () =>
        matchNode.exhaustive(Job.phase, {
          running: () => p(Job.t('loading')),
          finished: () => p(Job.t('done')),
        }),
      );

      export const JobStatusLoose = craftComponent('JobStatusLoose', {}, () =>
        matchNode(Job.phase, { running: () => p(Job.t('loading')) }),
      );
    `);

    expect(result.messages).toEqual([]);
  });

  it('ignores other render callbacks and slots', async () => {
    const result = await lintFixture(`
      declare const YIELDABLE_METHOD: unique symbol;
      type YieldableMethod<Args extends unknown[], Result> = ((
        ...args: Args
      ) => Generator<unknown, Result, unknown>) & {
        readonly [YIELDABLE_METHOD]: true;
      };
      declare const View: {
        readonly visible: YieldableMethod<[], boolean>;
        readonly items: YieldableMethod<[], readonly string[]>;
        readonly label: YieldableMethod<[id: string], string>;
      };
      declare function craftComponent(...args: unknown[]): unknown;
      declare function ifNode(...args: unknown[]): unknown;
      declare function forNode(...args: unknown[]): unknown;
      declare function catchNode(...args: unknown[]): unknown;
      declare function p(...args: unknown[]): unknown;
      declare function Card(...args: unknown[]): unknown;

      craftComponent('Demo', {}, () => [
        ifNode(View.visible, { then: () => p(View.label('a')), else: () => p(View.label('b')) }),
        forNode(View.items, { key: (item: string) => item, render: (item: string) => p(View.label(item)) }),
        catchNode({ try: () => p(View.label('c')), catch: () => p(View.label('d')) }),
        Card({ header: () => p(View.label('header')), body: () => p(View.label('body')) }),
      ]);
    `);

    expect(result.messages).toEqual([]);
  });

  it('reports a component output bound to an uncrafted yieldable callback', async () => {
    const result = await lintFixture(`
      declare const YIELDABLE_METHOD: unique symbol;
      type YieldableMethod = (() => Generator<void, void, unknown>) & {
        readonly [YIELDABLE_METHOD]: true;
      };
      declare const OUTPUT_BRAND: unique symbol;
      type Output<Handler extends (...args: any[]) => unknown> = Handler & {
        readonly [OUTPUT_BRAND]: Handler;
      };
      declare const CRAFT_COMPONENT: unique symbol;
      type Inputs = {
        readonly label: string;
        readonly press: Output<() => void>;
        readonly onPick?: Output<(id: number) => void>;
        readonly footer: () => unknown;
      };
      declare const DsButton: ((props: {
        label: string;
        press: () => void;
        onPick?: (id: number) => void;
        footer: () => unknown;
      }) => unknown) & {
        // Like CraftComponent: the generic ComponentTemplate signature comes
        // before the authored one.
        readonly [CRAFT_COMPONENT]: {
          readonly template: ((...args: any[]) => unknown) & ((inputs: Inputs) => unknown);
        };
      };
      declare const action: YieldableMethod;
      declare function craftComponent(...args: unknown[]): unknown;

      craftComponent('Demo', {}, () =>
        DsButton({
          label: 'Save',
          press: () => action(),
          onPick: (_id: number) => action(),
          footer: () => action(),
        }),
      );
    `);

    expect(result.messages).toEqual([
      "Callback 'press' calls a yieldable Craft method and must be created with `craftMethod(...)`.",
      "Callback 'onPick' calls a yieldable Craft method and must be created with `craftMethod(...)`.",
    ]);
  });

  it('ignores a non-event prop of an element', async () => {
    const result = await lintFixture(`
      declare const YIELDABLE_METHOD: unique symbol;
      type YieldableMethod = (() => Generator<void, void, unknown>) & {
        readonly [YIELDABLE_METHOD]: true;
      };
      declare const action: YieldableMethod;
      declare function craftComponent(...args: unknown[]): unknown;
      declare function button(...args: unknown[]): unknown;

      craftComponent('Demo', {}, function* () {
        return button({ run: () => action(), online: () => action() });
      });
    `);

    expect(result.messages).toEqual([]);
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

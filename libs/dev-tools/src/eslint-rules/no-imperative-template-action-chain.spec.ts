import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-imperative-template-action-chain.cjs');

const tempDirectories: string[] = [];

const TYPED_PRELUDE = `
  import { craftComponent } from '@craft-ts/core';

  declare const RAW_REACTIVE_VALUE: unique symbol;
  type Reader<T> = (() => Generator<unknown, T, unknown>) & {
    readonly [RAW_REACTIVE_VALUE]: () => T;
  };
  declare const View: {
    readonly lastActionLabel: {
      recordConfirm(): Generator<unknown, void, unknown>;
      readonly text: Reader<string>;
    };
    readonly dialogOpen: {
      closeFromConfirmation(): Generator<unknown, void, unknown>;
      readonly isOpen: Reader<boolean>;
    };
    readonly user: Reader<{ id: number }>;
    readonly save: (id: number) => Generator<unknown, void, unknown>;
  };
  declare function toolbarAction(...args: unknown[]): unknown;
  declare function button(...args: unknown[]): unknown;
`;

describe('no-imperative-template-action-chain', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it('reports chained mutation, state, and query actions in a click handler', async () => {
    const messages = await lint(`
      import { craftComponent } from '@craft-ts/core';

      declare const createMutation: { mutate(value: string): Generator };
      declare const todosQuery: { call(value: string): Generator };
      declare const setTitle: (value: string) => Generator;
      declare function button(...args: unknown[]): unknown;

      craftComponent('TodoPage', {}, () => button({
        *click() {
          yield* createMutation.mutate('todo');
          yield* setTitle('');
          yield* todosQuery.call('all');
        },
      }));
    `);

    expect(messages).toEqual([
      'Template event handlers must not chain imperative Craft actions (mutation.mutate, setTitle, query.call). Emit one source$ event and let query, mutation, and state react through on$. Reading a reactive value with yield* is allowed.',
    ]);
  });

  it('allows one action and ignores non-event template callbacks', async () => {
    const messages = await lint(`
      import { craftComponent } from '@craft-ts/core';

      declare const mutation: { mutate(value: string): Generator };
      declare function button(...args: unknown[]): unknown;
      declare function span(...args: unknown[]): unknown;

      craftComponent('Demo', {}, () => button({
        *click() { yield* mutation.mutate('todo'); },
        'aria-pressed': function* () {
          yield* mutation.mutate('not-an-event');
          return true;
        },
      }, span({}))); 
    `);

    expect(messages).toEqual([]);
  });

  it('reports two service methods chained in a component trigger', async () => {
    const messages = await lintTyped(`${TYPED_PRELUDE}
      craftComponent('Demo', {}, () => toolbarAction({
        trigger: function* () {
          yield* View.lastActionLabel.recordConfirm();
          yield* View.dialogOpen.closeFromConfirmation();
        },
      }));
    `);

    expect(messages).toEqual([
      'Template event handlers must not chain imperative Craft actions (lastActionLabel.recordConfirm, dialogOpen.closeFromConfirmation). Emit one source$ event and let query, mutation, and state react through on$. Reading a reactive value with yield* is allowed.',
    ]);
  });

  it('allows reading reactive values around a single action', async () => {
    const messages = await lintTyped(`${TYPED_PRELUDE}
      craftComponent('Demo', {}, () => button({
        *click() {
          const user = yield* View.user();
          const label = yield* View.lastActionLabel.text();
          if (label) yield* View.save(user.id);
        },
      }));
    `);

    expect(messages).toEqual([]);
  });

  it('allows a trigger that only reads', async () => {
    const messages = await lintTyped(`${TYPED_PRELUDE}
      craftComponent('Demo', {}, () => toolbarAction({
        trigger: function* () {
          yield* View.lastActionLabel.text();
          yield* View.dialogOpen.isOpen();
        },
      }));
    `);

    expect(messages).toEqual([]);
  });

  it('does not inspect a non-generator prop callback', async () => {
    const messages = await lintTyped(`${TYPED_PRELUDE}
      craftComponent('Demo', {}, () => toolbarAction({
        content: () => 'Confirm',
        role: function* () { return 'admin'; },
      }));
    `);

    expect(messages).toEqual([]);
  });
});

async function lint(source: string): Promise<string[]> {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        },
        plugins: { local: { rules: { rule: rule as never } } },
        rules: { 'local/rule': 'error' },
      },
    ],
  });

  const [result] = await eslint.lintText(source, { filePath: 'fixture.ts' });
  return result.messages.map((message) => message.message);
}

async function lintTyped(source: string): Promise<string[]> {
  const directory = await mkdtemp(join(tmpdir(), 'action-chain-rule-'));
  tempDirectories.push(directory);
  await writeFile(
    join(directory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { strict: true, target: 'ES2022', module: 'preserve' },
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

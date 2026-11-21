import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-transition-actions.cjs');
const tempDirectories: string[] = [];

describe('no-transition-actions', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('reports resource actions inside transitionStep callbacks', async () => {
    const { messages } = await lintFixture(`
      import {
        asyncProcess,
        craftStateMachine,
        mutation,
        query,
        transitionStep as step,
      } from '@craft-ts/core';

      declare const save: ReturnType<typeof mutation>;
      declare const users: ReturnType<typeof query>;
      declare const validate: ReturnType<typeof asyncProcess>;
      declare const draft: { restore(value: string): Generator };
      declare const saveRequest$: { emit(value: string): void };

      craftStateMachine('editor', () => ({}), function* () {
        return {
          saving: step(function* () {
            yield* save.mutate('profile');
            yield* users.call('profile');
            yield* validate.method('profile');
            yield* draft.restore('profile');
            saveRequest$.emit('profile');
          }),
        };
      });
    `);

    expect(messages).toEqual([
      'mutation.mutate(...) performs an action while a transition step is active. Declare the triggering event with on$(source$, ...), let the machine enter a step with transit(), and let state or resources react to that source instead of calling the action from the transition.',
      'query.call(...) performs an action while a transition step is active. Declare the triggering event with on$(source$, ...), let the machine enter a step with transit(), and let state or resources react to that source instead of calling the action from the transition.',
      'asyncProcess.method(...) performs an action while a transition step is active. Declare the triggering event with on$(source$, ...), let the machine enter a step with transit(), and let state or resources react to that source instead of calling the action from the transition.',
      'state.restore(...) performs an action while a transition step is active. Declare the triggering event with on$(source$, ...), let the machine enter a step with transit(), and let state or resources react to that source instead of calling the action from the transition.',
      'source$.emit(...) imperatively forwards an event from transitionStep(...). First trace its producer: if it is external, emit there and consume it with on$(source$, ...). If it comes from afterRecomputation(...), keep the value in the machine: register that recomputation under the destination transitionStep(...), then use transit(value).pipe(transitionGuard(({ from, event }) => ...)). transit() targets its declaring step. If choosing a destination or applying state changes requires an insertion-level currentStep() router, stop: the machine needs a declarative event/action API. Do not add a relay source or suppress this rule. See the state-machine guide.',
    ]);
  });

  it('also catches namespace transitionStep calls and computed action names', async () => {
    const { messages } = await lintFixture(`
      import * as core from '@craft-ts/core';

      declare const save: { mutate(value: string): Generator };

      core.transitionStep(() => {
        save['mutate']('profile');
      });
    `);

    expect(messages).toEqual([
      'mutation.mutate(...) performs an action while a transition step is active. Declare the triggering event with on$(source$, ...), let the machine enter a step with transit(), and let state or resources react to that source instead of calling the action from the transition.',
    ]);
  });

  it('does not report actions outside transitionStep callbacks', async () => {
    const { messages } = await lintFixture(`
      declare const save: { mutate(value: string): Generator };

      save.mutate('outside');
      function* handler() {
        yield* save.mutate('outside');
      }
    `);

    expect(messages).toEqual([]);
  });
});

async function lintFixture(source: string): Promise<{ messages: string[] }> {
  const directory = await mkdtemp(
    join(tmpdir(), 'no-transition-actions-rule-'),
  );
  tempDirectories.push(directory);
  await writeFile(join(directory, 'fixture.ts'), source);

  const eslint = new ESLint({
    cwd: directory,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        },
        plugins: { local: { rules: { transition: rule as never } } },
        rules: { 'local/transition': 'error' },
      },
    ],
  });

  const results = await eslint.lintFiles(['fixture.ts']);
  return {
    messages: results.flatMap((result) =>
      result.messages.map((message) => message.message),
    ),
  };
}

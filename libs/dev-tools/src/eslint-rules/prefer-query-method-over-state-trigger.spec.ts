import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./prefer-query-method-over-state-trigger.cjs');
const tempDirectories: string[] = [];

describe('prefer-query-method-over-state-trigger', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('reports a state() only used to feed params into queryEffect', async () => {
    const { messages } = await lintFixture(`
      import { state } from '@craft-ts/core';
      import { queryEffect } from '@craft-ts/effect';

      function* body() {
        const request = yield* state(
          'request',
          { scenario: 'success', attempt: 0 },
          ({ update }) => ({
            run: (scenario) =>
              update((previous) => ({ scenario, attempt: previous.attempt + 1 })),
          }),
        );

        const profileQuery = yield* queryEffect(
          'profileQuery',
          {
            params: request,
            loader: ({ params }) => loadUserProfile(params.scenario),
          },
          ({ resource }) => ({
            hasProfile: resource.hasValue,
          }),
        );

        function* click() {
          yield* request.run('success');
        }
      }
    `);

    expect(messages).toEqual([
      "'request' is only used to feed 'params' into queryEffect(...); it is never read for anything else. Drop the state() and trigger queryEffect directly with its own \`method\` option instead.",
    ]);
  });

  it('allows the state() when it is also read elsewhere (e.g. displayed in the template)', async () => {
    const { messages } = await lintFixture(`
      import { state } from '@craft-ts/core';
      import { queryEffect } from '@craft-ts/effect';

      function* body() {
        const request = yield* state(
          'request',
          { scenario: 'success', attempt: 0 },
          ({ update }) => ({
            run: (scenario) =>
              update((previous) => ({ scenario, attempt: previous.attempt + 1 })),
          }),
        );

        const profileQuery = yield* queryEffect(
          'profileQuery',
          {
            params: request,
            loader: ({ params }) => loadUserProfile(params.scenario),
          },
          ({ resource }) => ({
            hasProfile: resource.hasValue,
          }),
        );

        const attemptCount = craftComputed('attemptCount', () => request().attempt);
      }
    `);

    expect(messages).toEqual([]);
  });

  it('allows a query triggered directly with its own method option', async () => {
    const { messages } = await lintFixture(`
      import { queryEffect } from '@craft-ts/effect';

      function* body() {
        const profileQuery = yield* queryEffect(
          'profileQuery',
          {
            method: (scenario) => scenario,
            loader: ({ params }) => loadUserProfile(params),
          },
          ({ resource }) => ({
            hasProfile: resource.hasValue,
          }),
        );
      }
    `);

    expect(messages).toEqual([]);
  });
});

async function lintFixture(
  source: string,
): Promise<{ messages: string[]; output: string }> {
  const directory = await mkdtemp(
    join(tmpdir(), 'prefer-query-method-over-state-trigger-rule-'),
  );
  tempDirectories.push(directory);
  const filePath = join(directory, 'fixture.ts');
  await writeFile(filePath, source.trimStart(), 'utf8');

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
        plugins: { local: { rules: { rule: rule as never } } },
        rules: { 'local/rule': 'error' },
      },
    ],
  });

  const [result] = await eslint.lintFiles(['fixture.ts']);
  return {
    messages: result.messages.map((message) => message.message),
    output: result.output ?? (await readFile(filePath, 'utf8')),
  };
}

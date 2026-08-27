import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-server-function-outside-resource.cjs');
const temporaryDirectories: string[] = [];

describe('no-server-function-outside-resource', () => {
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it('reports a server-function call from a synchronous callback', async () => {
    const messages = await lintFixture(`
      import { getUsers } from './users/list.fn-client';
      const verify = (event: Event) => {
        void getUsers({ filter: 'ada' });
      };
    `);

    expect(messages).toEqual([
      'Server-function calls must be returned by a query, mutation, or asyncProcess loader. The client facade is yieldable and must not be fired from an event handler or another synchronous callback.',
    ]);
  });

  it('allows a direct call returned by a query loader', async () => {
    const messages = await lintFixture(`
      import { getUsers } from './users/list.fn-client';
      import { query } from '@craft-ts/core';
      const users = query('users', {
        params: () => 'ada',
        loader: ({ params }) => getUsers({ filter: params }),
      });
    `);

    expect(messages).toEqual([]);
  });

  it('allows namespaced server-function clients and effect resource loaders', async () => {
    const messages = await lintFixture(`
      import * as users from './users/list.fn-client';
      import * as craft from '@craft-ts/core';
      const result = craft.asyncProcess('users', {
        loader: () => users.getUsers({ filter: 'ada' }),
      });
    `);

    expect(messages).toEqual([]);
  });

  it('does not report calls in test files', async () => {
    const messages = await lintFixture(
      `
        import { getUsers } from './users/list.fn-client';
        void getUsers({ filter: 'ada' });
      `,
      'src/example.spec.ts',
    );

    expect(messages).toEqual([]);
  });
});

async function lintFixture(source: string, filename = 'src/example.ts') {
  const directory = await mkdtemp(
    join(tmpdir(), 'no-server-function-outside-resource-rule-'),
  );
  temporaryDirectories.push(directory);
  await writeFile(
    join(directory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { module: 'preserve', strict: true, target: 'ES2022' },
      include: ['src/**/*.ts'],
    }),
  );
  await mkdir(dirname(join(directory, filename)), { recursive: true });
  await writeFile(join(directory, filename), source);

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
        plugins: { local: { rules: { target: rule } } },
        rules: { 'local/target': 'error' },
      },
    ],
  });

  const results = await eslint.lintFiles([filename]);
  return results.flatMap((result) =>
    result.messages.map((message) => message.message),
  );
}

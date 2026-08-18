import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./server-function-client-match.cjs');
const temporaryDirectories: string[] = [];

describe('server-function-client-match', () => {
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it('accepts a client facade tied to its server definition', async () => {
    const messages = await lintFixture({
      'users/list.fn-serveur.ts': `
        declare function serverFunction(...args: unknown[]): { handler(fn: unknown): unknown };
        export const listUsers = serverFunction('users.list', {}).handler(() => []);
      `,
      'users/list.fn-client.ts': `
        declare function craftUnique<T>(value: T): T;
        declare function createServerFunctionClient<T>(id: string): unknown;
        import type { listUsers as ServerListUsers } from './list.fn-serveur';
        export const getUsers = createServerFunctionClient<typeof ServerListUsers>(
          craftUnique('users.list'),
        );
      `,
    });

    expect(messages).toEqual([]);
  });

  it('requires a static craftUnique key', async () => {
    const messages = await lintFixture({
      'users/list.fn-serveur.ts': `
        declare function serverFunction(...args: unknown[]): { handler(fn: unknown): unknown };
        export const listUsers = serverFunction('users.list', {}).handler(() => []);
      `,
      'users/list.fn-client.ts': `
        declare function craftUnique<T>(value: T): T;
        declare function createServerFunctionClient<T>(id: string): unknown;
        import type { listUsers as ServerListUsers } from './list.fn-serveur';
        const id = 'users.list';
        export const getUsers = createServerFunctionClient<typeof ServerListUsers>(id);
      `,
    });

    expect(messages).toContain(
      'createServerFunctionClient must receive craftUnique(<static server function id>).',
    );
  });

  it('rejects a client id that differs from the server id', async () => {
    const messages = await lintFixture({
      'users/list.fn-serveur.ts': `
        declare function serverFunction(...args: unknown[]): { handler(fn: unknown): unknown };
        export const listUsers = serverFunction('users.list', {}).handler(() => []);
      `,
      'users/list.fn-client.ts': `
        declare function craftUnique<T>(value: T): T;
        declare function createServerFunctionClient<T>(id: string): unknown;
        import type { listUsers as ServerListUsers } from './list.fn-serveur';
        export const getUsers = createServerFunctionClient<typeof ServerListUsers>(
          craftUnique('users.wrong'),
        );
      `,
    });

    expect(messages).toContain(
      'The client facade id "users.wrong" does not match server definition id "users.list".',
    );
  });

  it('rejects a client facade without a server definition type', async () => {
    const messages = await lintFixture({
      'users/list.fn-serveur.ts': `
        declare function serverFunction(...args: unknown[]): { handler(fn: unknown): unknown };
        export const listUsers = serverFunction('users.list', {}).handler(() => []);
      `,
      'users/list.fn-client.ts': `
        declare function craftUnique<T>(value: T): T;
        declare function createServerFunctionClient<T>(id: string): unknown;
        export const getUsers = createServerFunctionClient<typeof NotImported>(
          craftUnique('users.list'),
        );
      `,
    });

    expect(messages).toContain(
      'createServerFunctionClient must reference a server definition with a typeof import from the same family.',
    );
  });

  it('rejects a server definition imported from another family', async () => {
    const messages = await lintFixture({
      'users/list.fn-serveur.ts': `
        declare function serverFunction(...args: unknown[]): { handler(fn: unknown): unknown };
        export const listUsers = serverFunction('users.list', {}).handler(() => []);
      `,
      'users/authenticated.fn-serveur.ts': `
        declare function serverFunction(...args: unknown[]): { handler(fn: unknown): unknown };
        export const authenticatedUsers = serverFunction('users.authenticated', {}).handler(() => []);
      `,
      'users/list.fn-client.ts': `
        declare function craftUnique<T>(value: T): T;
        declare function createServerFunctionClient<T>(id: string): unknown;
        import type { authenticatedUsers as ServerAuthenticatedUsers } from './authenticated.fn-serveur';
        export const getUsers = createServerFunctionClient<typeof ServerAuthenticatedUsers>(
          craftUnique('users.authenticated'),
        );
      `,
    });

    expect(messages).toContain(
      'The client facade server definition does not belong to its *.fn-client.ts family.',
    );
  });

  it('rejects a dynamic craftUnique id', async () => {
    const messages = await lintFixture({
      'users/list.fn-serveur.ts': `
        declare function serverFunction(...args: unknown[]): { handler(fn: unknown): unknown };
        export const listUsers = serverFunction('users.list', {}).handler(() => []);
      `,
      'users/list.fn-client.ts': `
        declare function craftUnique<T>(value: T): T;
        declare function createServerFunctionClient<T>(id: string): unknown;
        import type { listUsers as ServerListUsers } from './list.fn-serveur';
        const id = 'users.list';
        export const getUsers = createServerFunctionClient<typeof ServerListUsers>(
          craftUnique(id),
        );
      `,
    });

    expect(messages).toContain(
      'createServerFunctionClient craftUnique(...) must wrap a string literal server function id.',
    );
  });
});

async function lintFixture(files: Record<string, string>): Promise<string[]> {
  const root = await mkdtemp(join('/tmp', 'server-function-client-match-'));
  temporaryDirectories.push(root);

  await writeFile(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { module: 'preserve', target: 'ES2022', strict: true },
      include: ['src/**/*.ts'],
    }),
    'utf8',
  );

  for (const [relativePath, source] of Object.entries(files)) {
    const filePath = join(root, 'src', relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, source.trimStart(), 'utf8');
  }

  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.fn-client.ts'],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        },
        plugins: { local: { rules: { 'server-function-client-match': rule } } },
        rules: { 'local/server-function-client-match': 'error' },
      },
    ],
  });

  const results = await eslint.lintFiles(['src/**/*.fn-client.ts']);
  return results.flatMap((result) =>
    result.messages.map((message) => message.message),
  );
}

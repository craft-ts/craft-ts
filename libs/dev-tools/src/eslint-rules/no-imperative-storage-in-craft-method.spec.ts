import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-imperative-storage-in-craft-method.cjs');
const tempDirectories: string[] = [];

describe('no-imperative-storage-in-craft-method', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('reports storage access and imperative location changes', async () => {
    const messages = await lintFixture(`
      import {
        BrowserLocation,
        LocalStorage,
        LocalStorageService,
        craftMethod,
      } from '@craft-ts/core';

      const signOut = craftMethod('signOut', function* () {
        const storage = yield* LocalStorageService();
        yield* LocalStorage.getItem('session');
        storage.removeItem('session');
        yield* BrowserLocation.reload();
      });
    `);

    expect(messages).toEqual([
      'Direct storage access is forbidden inside a craftMethod. React to the mutation from the affected query with insertReactOnMutation(...), use optimisticUpdate: () => undefined when the value must be cleared, and let persistence follow the query state.',
      'Direct storage access is forbidden inside a craftMethod. React to the mutation from the affected query with insertReactOnMutation(...), use optimisticUpdate: () => undefined when the value must be cleared, and let persistence follow the query state.',
      'Imperative BrowserLocation.reload(...) is forbidden inside a craftMethod. React to the authentication or query state instead of reloading or navigating from the handler.',
    ]);
  });

  it('reports direct browser globals in the craftMethod context', async () => {
    const messages = await lintFixture(`
      import { craftMethod } from '@craft-ts/core';

      const signOut = craftMethod('signOut', function* () {
        localStorage.removeItem('session');
        location.reload();
      });
    `);

    expect(messages).toEqual([
      'Direct storage access is forbidden inside a craftMethod. React to the mutation from the affected query with insertReactOnMutation(...), use optimisticUpdate: () => undefined when the value must be cleared, and let persistence follow the query state.',
      'Imperative BrowserLocation.reload(...) is forbidden inside a craftMethod. React to the authentication or query state instead of reloading or navigating from the handler.',
    ]);
  });

  it('allows storage adapters inside craftService', async () => {
    const messages = await lintFixture(`
      import {
        BrowserLocationService,
        LocalStorageService,
        craftMethod,
        craftService,
      } from '@craft-ts/core';

      const Service = craftService(
        { name: 'Service', providedIn: 'global' },
        function* () {
          const storage = yield* LocalStorageService();
          const location = yield* BrowserLocationService();
          const signOut = craftMethod('signOut', function* () {
            storage.removeItem('session');
            location.reload();
          });
          return { signOut };
        },
      );
    `);

    expect(messages).toEqual([]);
  });
});

async function lintFixture(source: string): Promise<string[]> {
  const directory = await mkdtemp(
    join(tmpdir(), 'no-imperative-storage-in-craft-method-rule-'),
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
        plugins: { local: { rules: { rule: rule as never } } },
        rules: { 'local/rule': 'error' },
      },
    ],
  });

  const results = await eslint.lintFiles(['fixture.ts']);
  return results.flatMap((result) =>
    result.messages.map((message) => message.message),
  );
}

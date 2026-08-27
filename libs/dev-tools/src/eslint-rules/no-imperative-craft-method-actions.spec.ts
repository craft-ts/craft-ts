import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-imperative-craft-method-actions.cjs');
const tempDirectories: string[] = [];

describe('no-imperative-craft-method-actions', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('reports multiple imperative actions and points to declarative reactions', async () => {
    const messages = await lintFixture(`
      import { craftMethod } from '@craft-ts/core';

      declare const logout: { mutate(value: undefined): Generator };
      declare const storage: { removeItem(key: string): void };
      declare const location: { reload(): void };

      const signOut = craftMethod('signOut', function* () {
        yield* logout.mutate(undefined);
        storage.removeItem('session');
        location.reload();
      });
    `);

    expect(messages).toEqual([
      'craftMethod composes multiple imperative actions (mutation.mutate, storage.removeItem, resource.reload). Emit a source$ event and let the affected query react with insertReactOnMutation(...).',
    ]);
  });

  it('allows event normalization, pure transformations, and one mutation', async () => {
    const messages = await lintFixture(`
      import { craftMethod } from '@craft-ts/core';

      declare const saveAnimal: { mutate(value: unknown): Generator };
      declare const name: () => string;

      const save = craftMethod('save', function* (event: Event) {
        event.preventDefault();
        yield* saveAnimal.mutate({ name: name().trim() });
      });
    `);

    expect(messages).toEqual([]);
  });

  it('does not constrain actions outside craftMethod or inside craftService', async () => {
    const messages = await lintFixture(`
      import { craftMethod, craftService } from '@craft-ts/core';

      declare const logout: { mutate(value: undefined): Generator };
      declare const storage: { removeItem(key: string): void };

      logout.mutate(undefined);

      const Service = craftService(
        { name: 'Service', providedIn: 'global' },
        function* () {
          const signOut = craftMethod('signOut', function* () {
            yield* logout.mutate(undefined);
            storage.removeItem('session');
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
    join(tmpdir(), 'no-imperative-craft-method-actions-rule-'),
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

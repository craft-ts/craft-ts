import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-event-only-craft-method.cjs');
const recommended = require('./recommended-config.cjs');

async function lint(source: string): Promise<string[]> {
  const directory = await mkdtemp(join(tmpdir(), 'event-only-method-'));
  try {
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
    return (await eslint.lintFiles(['fixture.ts'])).flatMap((result) =>
      result.messages.map((message) => message.message),
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

describe('no-event-only-craft-method', () => {
  it('is an error in the recommended preset', () => {
    expect(recommended['craft-ts/no-event-only-craft-method']).toBe('error');
  });

  it('rejects a method that only stops an event and delegates', async () => {
    const messages = await lint(`
      import { craftMethod } from '@craft-ts/core';
      declare const navOpen: { toggle(): Generator };
      const toggleNav = craftMethod('toggleNav', function* (event?: Event) {
        event?.stopPropagation();
        yield* navOpen.toggle();
      });
    `);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('eventAction');
  });

  it('allows a method with additional domain logic', async () => {
    const messages = await lint(`
      import { craftMethod } from '@craft-ts/core';
      declare const navOpen: { toggle(): Generator };
      const toggleNav = craftMethod('toggleNav', function* (event: Event) {
        event.preventDefault();
        auditNavigation();
        yield* navOpen.toggle();
      });
    `);
    expect(messages).toEqual([]);
  });
});

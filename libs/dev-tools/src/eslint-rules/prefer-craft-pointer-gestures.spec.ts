import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./prefer-craft-pointer-gestures.cjs');
const recommended = require('./recommended-config.cjs');
const plugin = require('./index.cjs');
const tempDirectories: string[] = [];

describe('prefer-craft-pointer-gestures', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it('is exported and enabled by the recommended config at error severity', () => {
    expect(plugin.rules['prefer-craft-pointer-gestures']).toBe(rule);
    expect(recommended['craft-ts/prefer-craft-pointer-gestures']).toBe('error');
  });

  it('reports hand-written pointer coordinate tracking', async () => {
    expect(
      await lint(`
        element.addEventListener('pointerdown', start);
        element.addEventListener('pointermove', (event) => {
          offset.x += event.clientX - startX;
        });
        element.addEventListener('pointerup', finish);
      `),
    ).toEqual([
      'This code tracks a pointer gesture with native events and coordinates. Use `drag` or `swipe` from `@craft-ts/core` for shared pointer handling and semantic replay markers; keep high-frequency preview work presentation-only. No autofix is available because gesture intent and callbacks need a human choice.',
    ]);
  });

  it('allows visual pointer listeners without gesture tracking', async () => {
    expect(
      await lint(`
        element.addEventListener('pointerdown', focus);
        element.addEventListener('pointerup', blur);
        element.addEventListener('pointermove', updateCursor);
      `),
    ).toEqual([]);
  });
});

async function lint(source: string): Promise<string[]> {
  const directory = await mkdtemp(
    join(tmpdir(), 'prefer-craft-pointer-gestures-'),
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

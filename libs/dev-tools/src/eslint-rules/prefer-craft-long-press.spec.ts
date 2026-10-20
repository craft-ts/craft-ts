import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./prefer-craft-long-press.cjs');
const recommended = require('./recommended-config.cjs');
const plugin = require('./index.cjs');
const tempDirectories: string[] = [];

describe('prefer-craft-long-press', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it('is exported and enabled by the recommended config at error severity', () => {
    expect(plugin.rules['prefer-craft-long-press']).toBe(rule);
    expect(recommended['craft-ts/prefer-craft-long-press']).toBe('error');
  });

  it('reports a hand-written pointer hold with a timer and cancellation', async () => {
    const messages = await lint(`
      function mount(element: Element) {
        let timer: number;
        element.addEventListener('pointerdown', () => {
          timer = setTimeout(onLongPress, 450);
        });
        element.addEventListener('pointerup', () => clearTimeout(timer));
        element.addEventListener('pointercancel', () => clearTimeout(timer));
      }
    `);

    expect(messages).toEqual([
      'This code implements a press-and-hold gesture with native pointer or touch events and a timer. Use `longPress` from `@craft-ts/core` for shared cancellation, click suppression, and replay behavior. For a different semantic gesture, wrap its handler with `runCraftReplayTrigger`.',
    ]);
  });

  it('allows ordinary pointer listeners without a timer', async () => {
    expect(
      await lint(`
        element.addEventListener('pointerdown', startDrag);
        element.addEventListener('pointerup', endDrag);
      `),
    ).toEqual([]);
  });

  it('allows a hand-written timer under a non-pointer event', async () => {
    expect(
      await lint(`
        window.addEventListener('keydown', () => setTimeout(refresh, 100));
        window.addEventListener('keyup', cancel);
      `),
    ).toEqual([]);
  });

  it('still reports a copied implementation when Craft longPress is imported', async () => {
    const messages = await lint(`
      import { longPress } from '@craft-ts/core';
      function mount(element: Element) {
        element.addEventListener('pointerdown', () => setTimeout(onLongPress, 450));
        element.addEventListener('pointerup', cancel);
        element.addEventListener('pointercancel', cancel);
        void longPress;
      }
    `);

    expect(messages).toEqual([
      'This code implements a press-and-hold gesture with native pointer or touch events and a timer. Use `longPress` from `@craft-ts/core` for shared cancellation, click suppression, and replay behavior. For a different semantic gesture, wrap its handler with `runCraftReplayTrigger`.',
    ]);
  });
});

async function lint(source: string): Promise<string[]> {
  const directory = await mkdtemp(join(tmpdir(), 'prefer-craft-long-press-'));
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

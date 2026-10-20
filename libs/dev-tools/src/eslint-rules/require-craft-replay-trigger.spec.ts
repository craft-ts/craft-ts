import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./require-craft-replay-trigger.cjs');
const recommended = require('./recommended-config.cjs');
const plugin = require('./index.cjs');
const tempDirectories: string[] = [];

describe('require-craft-replay-trigger', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it('is exported and enabled by the recommended config at error severity', () => {
    expect(plugin.rules['require-craft-replay-trigger']).toBe(rule);
    expect(recommended['craft-ts/require-craft-replay-trigger']).toBe('error');
  });

  it('reports native gesture listeners that execute Craft generators', async () => {
    expect(
      await lint(`
        element.addEventListener('pointerup', function* (event) {
          yield* View.selection.finish(event);
        });
      `),
    ).toEqual([
      'This native pointerup listener contains Craft work that invocation replay cannot associate with a gesture. Wrap the semantic handler in `runCraftReplayTrigger(...)`, or bind the action through a Craft template event.',
    ]);
  });

  it('allows a replay-aware native handler', async () => {
    expect(
      await lint(`
        import { runCraftReplayTrigger } from '@craft-ts/core';
        element.addEventListener('pointerup', (event) =>
          runCraftReplayTrigger(injector, { name: 'dragEnd', target: element }, () =>
            executeYieldable(View.selection.finish, [event], injector),
          ),
        );
      `),
    ).toEqual([]);
  });

  it('allows visual-only native listeners and ordinary template bindings', async () => {
    expect(
      await lint(`
        button({
          *click() { yield* View.selection.finish(); },
        });
        element.addEventListener('pointermove', updateCursor);
      `),
    ).toEqual([]);
  });

  it('resolves named local handlers passed to Renderer.listen', async () => {
    expect(
      await lint(`
        function finishDrag() { return executeYieldable(View.finish, [], injector); }
        renderer.listen(element, 'touchend', finishDrag);
      `),
    ).toEqual([
      'This native touchend listener contains Craft work that invocation replay cannot associate with a gesture. Wrap the semantic handler in `runCraftReplayTrigger(...)`, or bind the action through a Craft template event.',
    ]);
  });
});

async function lint(source: string): Promise<string[]> {
  const directory = await mkdtemp(
    join(tmpdir(), 'require-craft-replay-trigger-'),
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

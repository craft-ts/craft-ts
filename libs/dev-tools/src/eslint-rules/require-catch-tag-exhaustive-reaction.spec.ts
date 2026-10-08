import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rule = require('./require-catch-tag-exhaustive-reaction.cjs');

describe('require-catch-tag-exhaustive-reaction', () => {
  it('reports empty handlers and bare returns', async () => {
    const messages = await lintText(`
      catchTag.exhaustive({
        EMPTY: function* () {},
        SILENT: function* () { return; },
      });
    `);

    expect(messages).toEqual([
      'This catchTag.exhaustive handler does not react to the exception. Handle it with a meaningful side effect, or leave it for catchNode.exhaustive / matchNode.exhaustive to display.',
      'Do not use a bare return in a catchTag.exhaustive handler. Perform the intended handling and let the generator finish naturally.',
    ]);
  });

  it('accepts handled exceptions and value-returning transformations', async () => {
    const messages = await lintText(`
      catchTag.exhaustive({
        LOGGED: function* () { yield* audit.log('logged'); },
        RECOVERED: function* () { return cachedValue; },
      });
    `);

    expect(messages).toEqual([]);
  });

  it('does not report a bare return inside a nested callback', async () => {
    const messages = await lintText(`
      catchTag.exhaustive({
        SCHEDULED: function* () {
          yield* scheduler.run(function* () { return; });
        },
      });
    `);

    expect(messages).toEqual([]);
  });

  it('recognizes aliases imported from the core program operators', async () => {
    const messages = await lintText(`
      import { catchTag as catchProgramTag } from '@craft-ts/core';
      catchProgramTag.exhaustive({
        SILENT: function* () { return; },
      });
    `);

    expect(messages).toEqual([
      'Do not use a bare return in a catchTag.exhaustive handler. Perform the intended handling and let the generator finish naturally.',
    ]);
  });
});

async function lintText(code: string) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        },
        plugins: { local: { rules: { rule } } },
        rules: { 'local/rule': 'error' },
      },
    ],
  });
  const [result] = await eslint.lintText(code, { filePath: 'fixture.ts' });
  return result.messages.map((message) => message.message);
}

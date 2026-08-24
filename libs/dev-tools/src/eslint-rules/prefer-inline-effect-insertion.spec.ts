import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./prefer-inline-effect-insertion.cjs');

describe('prefer-inline-effect-insertion', () => {
  it('reports and autofixes an extracted typed insertion helper', async () => {
    const result = await lint(
      `
        import { craftComputed, settled, type InsertionParams } from '@craft-ts/core';
        import { queryEffect } from '@craft-ts/effect';
        type DataInsertionContext = InsertionParams<string, true, unknown, unknown, 'data'>;
        const createDataInsertion = ({ resource }: DataInsertionContext) => ({
          value: craftComputed('value', function* () {
            return yield* settled(resource);
          }),
        });
        queryEffect('data', { loader: () => value }, createDataInsertion);
      `,
      true,
    );

    expect(result.messages).toEqual([]);
    expect(result.output).not.toContain('DataInsertionContext');
    expect(result.output).not.toContain('createDataInsertion');
    expect(result.output).not.toContain('InsertionParams');
    expect(result.output).toContain(
      `queryEffect('data', { loader: () => value }, ({ resource }) => ({`,
    );
  });

  it('allows an inline insertion callback', async () => {
    const result = await lint(`
      import { queryEffect } from '@craft-ts/effect';
      queryEffect('data', { loader: () => value }, ({ resource }) => ({ resource }));
    `);

    expect(result.messages).toEqual([]);
  });
});

async function lint(source: string, fix = false) {
  const eslint = new ESLint({
    fix,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        },
        plugins: { local: { rules: { insertion: rule as never } } },
        rules: { 'local/insertion': 'error' },
      },
    ],
  });

  const [result] = await eslint.lintText(source, { filePath: 'fixture.ts' });
  return result;
}

import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-explicit-effect-type.cjs');

describe('no-explicit-effect-type', () => {
  it('reports and autofixes an annotated Effect.gen variable', async () => {
    const result = await lint(
      `
        import { Effect } from 'effect';
        declare const Database: { readonly key: unique symbol };
        export const getData: Effect.Effect<readonly string[], never, typeof Database> =
          Effect.gen(function* () {
            return ['value'];
          });
      `,
      true,
    );

    expect(result.messages).toEqual([]);
    expect(result.output).toContain(
      `export const getData =\n          Effect.gen`,
    );
  });

  it('reports and autofixes an annotated function returning Effect.gen', async () => {
    const result = await lint(
      `
        import { Effect } from 'effect';
        export const load = (): Effect.Effect<string> =>
          Effect.gen(function* () {
            return 'value';
          });
      `,
      true,
    );

    expect(result.messages).toEqual([]);
    expect(result.output).toContain(
      `export const load = () =>\n          Effect.gen`,
    );
  });

  it('keeps explicit Effect types used as contracts', async () => {
    const result = await lint(`
      import { Effect } from 'effect';
      type Repository = {
        readonly load: () => Effect.Effect<string>;
      };
      declare const repository: Repository;
      const load: Effect.Effect<string> = repository.load();
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
        plugins: { local: { rules: { effect: rule as never } } },
        rules: { 'local/effect': 'error' },
      },
    ],
  });

  const [result] = await eslint.lintText(source, { filePath: 'fixture.ts' });
  return result;
}

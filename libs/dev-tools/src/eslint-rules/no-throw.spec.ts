import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const rule = require('./no-throw.cjs');

describe('no-throw', () => {
  it('reports throw statements and auto-fixes them to craftException returns', async () => {
    const eslint = createEslint(true);
    const [result] = await eslint.lintText(
      `
        import { craftGen } from '@craft-ng/core';

        const load = craftGen(function* () {
          throw new Error('failed');
        });

        function* refresh() {
          throw new Error('refresh failed');
        }
      `,
      { filePath: 'demo.ts' },
    );

    expect(result.messages).toEqual([]);
    expect(result.output).toContain(
      "import { craftGen, craftException } from '@craft-ng/core';",
    );
    expect(result.output).toContain(
      "return craftException({ code: 'UNEXPECTED_ERROR' }, { error: new Error('failed') });",
    );
  });

  it('adds the Craft import when the file has no core import', async () => {
    const eslint = createEslint(true);
    const [result] = await eslint.lintText(
      `function* load() { throw error; }`,
      { filePath: 'demo.ts' },
    );

    expect(result.messages).toEqual([]);
    expect(result.output).toContain(
      "import { craftException } from '@craft-ng/core';",
    );
    expect(result.output).toContain(
      "return craftException({ code: 'UNEXPECTED_ERROR' }, { error: error });",
    );
  });

  it('does not reuse a type-only craftException import as a runtime binding', async () => {
    const eslint = createEslint(true);
    const [result] = await eslint.lintText(
      `
        import type { craftException } from '@craft-ng/core';
        function* load() { throw error; }
      `,
      { filePath: 'demo.ts' },
    );

    expect(result.messages).toEqual([]);
    expect(result.output).toContain(
      "import { craftException } from '@craft-ng/core';",
    );
  });

  it('reports but does not auto-fix throws outside a function body', async () => {
    const eslint = createEslint(true);
    const [result] = await eslint.lintText(`throw new Error('failed');`, {
      filePath: 'demo.ts',
    });

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].message).toContain('throw is forbidden');
    expect(result.output).toBeUndefined();
  });

  it('allows code without throw statements', async () => {
    const eslint = createEslint(false);
    const [result] = await eslint.lintText(
      `function* load() { return craftException({ code: 'FAILED' }); }`,
      { filePath: 'demo.ts' },
    );

    expect(result.messages).toEqual([]);
  });
});

function createEslint(fix: boolean) {
  return new ESLint({
    fix,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        },
        plugins: { local: { rules: { 'no-throw': rule as never } } },
        rules: { 'local/no-throw': 'error' },
      },
    ],
  });
}

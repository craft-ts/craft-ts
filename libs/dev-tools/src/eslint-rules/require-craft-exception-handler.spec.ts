import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const rule = require('./require-craft-exception-handler.cjs');

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
        plugins: { local: { rules: { required: rule } } },
        rules: { 'local/required': 'error' },
      },
    ],
  });
  return (await eslint.lintText(source, { filePath: 'app.routes.ts' }))[0];
}

describe('require-craft-exception-handler', () => {
  it('wraps a simple handler and adds the import', async () => {
    const result = await lint(
      `import { craftRoute } from '@craft-ts/core';\ncraftRoute('x', {}, { X: ({ noop }) => noop() });`,
      true,
    );
    expect(result.output).toContain(
      'craftExceptionHandler(function* ({ noop })',
    );
    expect(result.output).toContain('craftExceptionHandler');
  });

  it('requires manual conversion for raw redirect()', async () => {
    const result = await lint(
      `craftRoute('x', {}, { X: ({ redirect }) => redirect('/x') });`,
    );
    expect(result.messages[0]?.message).toContain('redirectTo(...)');
    expect(result.output).toBeUndefined();
  });
});

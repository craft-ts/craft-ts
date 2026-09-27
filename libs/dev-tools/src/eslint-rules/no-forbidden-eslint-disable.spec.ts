import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';
import rule from './no-forbidden-eslint-disable.cjs';

describe('no-forbidden-eslint-disable', () => {
  it('reports a protected rule and allows unrelated disables', async () => {
    const [result] = await createEslint().lintText(
      [
        '// eslint-disable-next-line no-console -- temporary adapter',
        'const value = 1;',
        '// eslint-disable-next-line no-alert',
        'const other = 2;',
      ].join('\n'),
      { filePath: 'fixture.ts' },
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.message).toContain(
      "The ESLint rule 'no-console' is protected",
    );
  });

  it('reports protected rules in line and block directives', async () => {
    const [result] = await createEslint().lintText(
      [
        'const value = 1; /* eslint-disable-line no-console */',
        '/* eslint-disable-next-line no-console */',
        'const other = 2;',
      ].join('\n'),
      { filePath: 'fixture.ts' },
    );

    expect(result.messages).toHaveLength(2);
    expect(
      result.messages.every((message) =>
        message.message.includes("'no-console' is protected"),
      ),
    ).toBe(true);
  });
});

function createEslint() {
  return new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        linterOptions: { reportUnusedDisableDirectives: 0 },
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        },
        plugins: { local: { rules: { 'no-forbidden-eslint-disable': rule } } },
        rules: {
          'local/no-forbidden-eslint-disable': [
            'error',
            { forbiddenRules: ['no-console'] },
          ],
        },
      },
    ],
  });
}

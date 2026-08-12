import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

async function messages(
  ruleName: string,
  source: string,
  filePath = 'fixture.ts',
) {
  const rule = require(`./${ruleName}.cjs`);
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
  const [result] = await eslint.lintText(source, { filePath });
  return result.messages.map((message) => message.message);
}

describe('Craft CSS variable ESLint rules', () => {
  it('checks an external stylesheet contract and resolves the CSS import', async () => {
    const result = await messages(
      'craft-css-vars-contract',
      `import styles from './css-vars-external.css' with { loader: 'text' };
       craftComponent('External', { stylesUrl: styles }, () => ({}), () => div());`,
      new URL('./fixtures/fixture.ts', import.meta.url).pathname,
    );
    expect(result).toContain(
      'External styles use CSS variables but ComponentMeta.cssVars is missing.',
    );
  });

  it('reports dynamic CSS instead of treating it as empty', async () => {
    expect(
      await messages(
        'craft-css-vars-contract',
        `craftComponent('Dynamic', { styles: makeCss() }, () => ({}), () => div());`,
      ),
    ).toContain(
      'Craft component styles are dynamic and their CSS variable contract cannot be checked.',
    );
  });

  it('mirrors scope safety checks', async () => {
    const result = await messages(
      'craft-styles-scope-safe',
      "craftComponent('Spinner', { styles: '@keyframes spin {to{opacity:1}}' }, () => ({}), () => div());",
    );
    expect(result[0]).toContain('Spinner-spin');
  });

  it('enforces component variable namespaces', async () => {
    const result = await messages(
      'craft-css-var-naming',
      "craftComponent('Card', { styles: ':scope { --gap: 1rem }' }, () => ({}), () => div());",
    );
    expect(result[0]).toContain('--card-');
  });

  it('reports hard-coded design colors and !important', async () => {
    expect(
      await messages(
        'no-hardcoded-design-values',
        "craftComponent('Card', { styles: '.x { color: #fff }' }, () => ({}), () => div());",
      ),
    ).toHaveLength(1);
    expect(
      await messages(
        'no-important-in-component-styles',
        "craftComponent('Card', { styles: '.x { color: red !important }' }, () => ({}), () => div());",
      ),
    ).toHaveLength(1);
  });
});

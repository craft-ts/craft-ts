import { createRequire } from 'node:module';
import { ESLint } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const plugin = require('./index.cjs');

async function lint(code: string, filePath = 'src/app/page.ts') {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tsParser },
        plugins: { 'craft-ts': plugin },
        rules: { 'craft-ts/require-i18n-text': 'error' },
      },
    ],
  });
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages;
}

describe('require-i18n-text', () => {
  it('reports hard-coded visible helper text', async () => {
    const messages = await lint(
      "heading('Administration'); button({ type: 'button' }, 'Save');",
    );
    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.message)).toEqual([
      expect.stringContaining('Visible text must come from i18n.t'),
      expect.stringContaining('Visible text must come from i18n.t'),
    ]);
  });

  it('accepts translated text and dynamic business values', async () => {
    const messages = await lint(`
      heading(i18n.t('admin.title'));
      input({ placeholder: i18n.t('admin.search') });
      option({ value: animal.id }, animal.name);
    `);
    expect(messages).toEqual([]);
  });

  it('checks visible attributes', async () => {
    const messages = await lint(
      "input({ placeholder: 'Search', 'aria-label': 'Search' });",
    );
    expect(messages.map((message) => message.message)).toEqual([
      expect.stringContaining('placeholder value must come from i18n.t'),
      expect.stringContaining('aria-label value must come from i18n.t'),
    ]);
  });

  it('does not inspect catalogues, tests or server files', async () => {
    await expect(
      lint("heading('Catalogue');", 'src/i18n/catalog.ts'),
    ).resolves.toEqual([]);
    await expect(
      lint("heading('Fixture');", 'src/page.spec.ts'),
    ).resolves.toEqual([]);
    await expect(
      lint("heading('Server log');", 'src/server/server.ts'),
    ).resolves.toEqual([]);
  });

  it('is part of the opt-in i18n preset', () => {
    expect(plugin.configs.i18n.rules['craft-ts/require-i18n-text']).toBe(
      'error',
    );
  });
});

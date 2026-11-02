import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./e2e-user-facing-locators.cjs');
const plugin = require('./index.cjs');

describe('e2e-user-facing-locators', () => {
  it.each([
    "page.locator('.admin-row')",
    "page.locator('#checkout')",
    "row.locator('div.stock-control > span')",
    "page.locator(`.price`)",
    "page.$('.cart')",
    "page.$$eval('ul .item', (items) => items.length)",
    "page.waitForSelector('main #total')",
    "page.locator('css=.legacy')",
  ])('refuses a class or id selector: %s', async (code) => {
    expect(await lint(code)).toEqual([
      expect.stringContaining('getByRole, getByLabel ou getByText'),
    ]);
  });

  it.each([
    "page.getByRole('button', { name: 'Payer' })",
    "page.locator('[data-testid=\"cart\"]')",
    "page.locator('input[name=\"email\"]')",
    "page.locator('text=Total 3.50 €')",
    "page.locator('role=listitem')",
    "page.locator('main')",
    "page.locator('a[href=\"/docs/v1.2\"]')",
    'page.locator(selector)',
    "page.locator(`.${dynamic}`)",
  ])('accepts %s', async (code) => {
    expect(await lint(code)).toEqual([]);
  });

  it('is enabled by the e2e preset', () => {
    expect(plugin.configs.e2e.rules['craft-ts/e2e-user-facing-locators']).toBe('error');
  });
});

async function lint(source: string): Promise<string[]> {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        },
        plugins: { local: { rules: { locators: rule as never } } },
        rules: { 'local/locators': 'error' },
      },
    ],
  });
  const [result] = await eslint.lintText(source, { filePath: 'e2e/cart.spec.ts' });
  return result.messages.map((message) => message.message);
}

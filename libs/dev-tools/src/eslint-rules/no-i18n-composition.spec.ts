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
        rules: { 'craft-ts/no-i18n-composition': 'error' },
      },
    ],
  });
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages;
}

describe('no-i18n-composition', () => {
  it('reports a translated sentence followed by a formatted value', async () => {
    const messages = await lint(
      "span(function* () { return `${i18n.t('ui.space.expires')} ${formatDate(yield* item.expiresAt())}`; });",
    );

    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain(
      'Put the complete message in the i18n catalogue',
    );
    expect(messages[0].message).toContain(
      "i18n.t('ui.space.expires', { expiresAt })",
    );
    expect(messages[0].message).toContain(
      'https://craft-ts.github.io/craft/guide/i18n/#translation-parameters',
    );
  });

  it('reports concatenation in either order and in visible attributes', async () => {
    const messages = await lint(
      "p(i18n.t('cart.total') + ': ' + total); label('Status: ' + translate('status')); input({ placeholder: `${i18n.t('search.label')} ${query}` });",
    );

    expect(messages).toHaveLength(3);
    expect(
      messages.every(
        (message) => message.ruleId === 'craft-ts/no-i18n-composition',
      ),
    ).toBe(true);
  });

  it('accepts a translation with parameters and a standalone translation', async () => {
    const messages = await lint(
      "span(i18n.t('ui.space.expires', { expiresAt })); span(`${i18n.t('ui.space.expires', { expiresAt })}`); p(value);",
    );

    expect(messages).toEqual([]);
  });

  it('does not inspect catalogues, tests or server files', async () => {
    const code = "span(i18n.t('ui.space.expires') + ' ' + expiresAt);";

    await expect(lint(code, 'src/i18n/catalog.ts')).resolves.toEqual([]);
    await expect(lint(code, 'src/page.spec.ts')).resolves.toEqual([]);
    await expect(lint(code, 'src/server/server.ts')).resolves.toEqual([]);
  });

  it('is part of the i18n preset', () => {
    expect(plugin.configs.i18n.rules['craft-ts/no-i18n-composition']).toBe(
      'error',
    );
  });
});

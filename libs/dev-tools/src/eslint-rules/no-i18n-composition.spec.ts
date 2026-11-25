import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

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

const tempDirectories: string[] = [];

/** Lints `source` with type information (typed lint, as in an app). */
async function lintTyped(source: string) {
  const directory = await mkdtemp(join(tmpdir(), 'no-i18n-composition-'));
  tempDirectories.push(directory);
  const file = join(directory, 'src/page.ts');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(
    file,
    `
      type CraftNode = { readonly kind: 'node' };
      declare function button(props: object, children: unknown): CraftNode;
      declare function span(props?: object, children?: unknown): CraftNode;
      declare function p(children: unknown): CraftNode;
      declare function Icon(props: { name: string }): CraftNode;
      declare function t(key: string, params?: object): string;
      declare function formatDate(value: Date): string;
      ${source}
    `,
  );
  await writeFile(
    join(directory, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { strict: true }, include: ['src/**/*.ts'] }),
  );

  const eslint = new ESLint({
    cwd: directory,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            project: './tsconfig.json',
            tsconfigRootDir: directory,
          },
        },
        plugins: { 'craft-ts': plugin },
        rules: { 'craft-ts/no-i18n-composition': 'error' },
      },
    ],
  });
  const [result] = await eslint.lintFiles(['src/**/*.ts']);
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

  describe('children arrays: element nodes are separate positions (#53)', () => {
    afterEach(async () => {
      await Promise.all(
        tempDirectories
          .splice(0)
          .map((directory) => rm(directory, { recursive: true, force: true })),
      );
    });

    it('accepts a decorative element or icon component next to one complete translation', async () => {
      const messages = await lint(`
        button({ type: 'button', disabled: true }, [span({ 'aria-hidden': 'true' }), t('saving')]);
        p([Icon({ name: 'check' }), t('saved')]);
        p([t('saved'), Icon({ name: 'check', label: t('icon.check') })]);
        button([ifNode(saving, () => span({ class: spinner })), i18n.t('save')]);
        span([forNode(items, (item) => span(item.name)), translate('items')]);
        p([spinner, t('saving')]);
      `);

      expect(messages).toEqual([]);
    });

    it('still reports a translation completed by adjacent text', async () => {
      const messages = await lint(`
        button([span({ 'aria-hidden': 'true' }), 'Saving ', t('progress')]);
        p(['Saving ', t('progress')]);
        p([t('items'), 3]);
        p([t('items'), \`\${count} \`]);
        p([\`\${count} \` + t('items')]);
        p([Icon({ name: 'check' }), \`\${count} \${t('items')}\`]);
        p([t('title'), t('subtitle')]);
        p([t('status'), done ? 'yes' : 'no']);
      `);

      expect(messages.map((message) => message.line)).toEqual([
        2, 3, 4, 5, 6, 7, 8, 9,
      ]);
      expect(
        messages.every(
          (message) => message.ruleId === 'craft-ts/no-i18n-composition',
        ),
      ).toBe(true);
    });

    it('reports a text-typed value next to a translation with typed lint', async () => {
      const messages = await lintTyped(`
        declare const count: number;
        declare const user: { name: string };
        declare const expiresAt: Date;
        p([t('items'), count]);
        p([user.name, t('greeting')]);
        p([t('expires'), formatDate(expiresAt)]);
      `);

      expect(messages.map((message) => message.line)).toEqual([13, 14, 15]);
    });

    it('accepts node-typed values next to a translation with typed lint', async () => {
      const messages = await lintTyped(`
        const spinner = span({ 'aria-hidden': 'true' });
        declare function Spinner(): CraftNode;
        button({ type: 'button', disabled: true }, [span({ 'aria-hidden': 'true' }), t('saving')]);
        p([Icon({ name: 'check' }), t('saved')]);
        p([spinner, t('saving')]);
        p([Spinner(), t('saving')]);
      `);

      expect(messages).toEqual([]);
    });
  });

  it('is part of the i18n preset', () => {
    expect(plugin.configs.i18n.rules['craft-ts/no-i18n-composition']).toBe(
      'error',
    );
  });
});

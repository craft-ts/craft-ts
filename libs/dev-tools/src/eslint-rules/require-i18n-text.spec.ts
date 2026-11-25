import { createRequire } from 'node:module';
import { ESLint } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const plugin = require('./index.cjs');

const CHOICE =
  'If this is text shown to a user, use i18n.t(...). If it is a technical state or discriminant, declare it with craftLiteral(...) and reuse that value.';

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
      expect.stringContaining(CHOICE),
      expect.stringContaining(CHOICE),
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

  it('reports copy sitting next to a translated value', async () => {
    const messages = await lint(`
      p('Total: ' + i18n.t('cart.total', { amount }));
      span(\`Total: \${amount}\`);
      label(isNew ? 'New' : 'Returning');
      p(userName || 'Anonymous');
      p([i18n.t('cart.total'), ' and more']);
      button({ type: 'button' }, 'Save ' + label);
    `);
    expect(messages).toHaveLength(7);
    expect(
      messages.every((message) =>
        message.message.includes(CHOICE),
      ),
    ).toBe(true);
  });

  it('reports copy nested in a visible attribute', async () => {
    const messages = await lint(
      "input({ placeholder: 'Search ' + scope, title: isNew ? 'New' : label });",
    );
    expect(messages.map((message) => message.message)).toEqual([
      expect.stringContaining('placeholder value must come from i18n.t'),
      expect.stringContaining('title value must come from i18n.t'),
    ]);
  });

  it('checks generator return text while leaving glue and values alone', async () => {
    const messages = await lint(`
      p(first + ' ' + last);
      span(count + ' / ' + total);
      p(function* () { return i18n.t('api.title') + (yield* query.value()); });
      p(i18n.t('cart.total', { amount: 'not copy' }));
      option({ value: animal.id }, animal.name);
    `);
    expect(messages).toEqual([]);
    const untranslated = await lint(`p(function* () { return 'API title: ' + (yield* query.value()); });`);
    expect(untranslated).toHaveLength(1);
  });

  it('follows computed readers and local text helpers into visible content', async () => {
    const messages = await lint(`
      function summary() { return 'Chargement…'; }
      const title = craftComputed('title', () => summary());
      p(title);
    `);
    expect(messages).toHaveLength(1);
  });

  it('flags opaque imported text helpers in computed visible output', async () => {
    const messages = await lint(`
      import { describeSessionTraceFinding } from './compare';
      const copy = craftComputed('copy', () => describeSessionTraceFinding(finding));
      p(copy);
    `);
    expect(messages).toHaveLength(1);
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

  it('does not treat palette color values as visible copy', async () => {
    const messages = await lint(`
      const palette = definePalette('page', {
        text: {
          strong: { light: '#172033', dark: '#f2f4f8' },
          muted: { light: '#5c677d', dark: '#98a2b3' },
        },
      });
    `);
    expect(messages).toEqual([]);
  });

  it('is part of the opt-in i18n preset', () => {
    expect(plugin.configs.i18n.rules['craft-ts/require-i18n-text']).toBe(
      'error',
    );
  });

  it('reads a token-like kind as a discriminant, and catalog definitions as no copy', async () => {
    const messages = await lint(`
      const events = [{ kind: 'transport', phase: 'failed' }];
      const sequence = defineToken({ name: 'sequence', kind: 'text', format: String });
    `);
    expect(messages).toEqual([]);
  });

  it('still reports copy in a kind field', async () => {
    const messages = await lint("const row = { kind: 'Exception HTTP' };");
    expect(messages).toHaveLength(1);
  });

  it('follows only the copy fields of a view-model row', async () => {
    const messages = await lint(`const row = {
  side: 'baseline',
  label: 'Green reference',
};
const other = { label: i18n.t('row'), side: 'observed' };`);
    expect(messages.map((message) => message.line)).toEqual([3]);
  });

  describe('technical values declared with craftLiteral (#49)', () => {
    const TECHNICAL = 'declared as a technical value with craftLiteral(...)';

    it('asks a computed returning bare strings to choose between i18n and craftLiteral', async () => {
      const messages = await lint(`
        import { craftComputed, craftService, state } from '@craft-ts/core';

        export const { Drawer } = craftService({ name: 'Drawer', providedIn: 'global' }, function* () {
          const open = yield* state('open', false);
          yield* craftComputed('drawerState', function* () {
            return (yield* open()) ? 'open' : 'closed';
          });
        });
      `);
      expect(messages.map((message) => message.message)).toEqual([
        expect.stringContaining(CHOICE),
        expect.stringContaining(CHOICE),
      ]);
    });

    it('accepts a computed returning values declared with craftLiteral', async () => {
      const messages = await lint(`
        import { craftComputed, craftLiteral, craftService, state } from '@craft-ts/core';

        const drawerOpen = craftLiteral('open');
        const drawerClosed = craftLiteral('closed');

        export const { Drawer } = craftService({ name: 'Drawer', providedIn: 'global' }, function* () {
          const open = yield* state('open', false);
          const drawerState = yield* craftComputed('drawerState', function* () {
            return (yield* open()) ? drawerOpen : drawerClosed;
          });
          const running = yield* craftComputed('running', () => craftLiteral('running'));
          const tone = yield* craftComputed('tone', () => craftLiteral('neutral') as const);
          div({ 'data-state': drawerState });
        });
      `);
      expect(messages).toEqual([]);
    });

    it('recognises renamed and namespace imports of craftLiteral', async () => {
      const messages = await lint(`
        import { craftComputed, craftLiteral as technical } from '@craft-ts/core';
        import * as core from '@craft-ts/core';

        const finished = core.craftLiteral('finished');
        const status = craftComputed('status', () => (done ? finished : technical('running')));
        p(finished);
        span(technical('running'));
      `);
      expect(messages.map((message) => message.line)).toEqual([7, 8]);
      expect(
        messages.every((message) => message.message.includes(TECHNICAL)),
      ).toBe(true);
    });

    it('still requires i18n when a marked value reaches visible text', async () => {
      const messages = await lint(`
        import { craftComputed, craftLiteral } from '@craft-ts/core';

        const drawerOpen = craftLiteral('open');
        const drawerClosed = craftLiteral('closed');
        const drawerState = craftComputed('drawerState', () => (open() ? drawerOpen : drawerClosed));

        p(drawerOpen);
        span(isOpen ? drawerOpen : drawerClosed);
        p(craftLiteral('closed'));
        p(drawerState);
        const row = { label: drawerOpen, kind: drawerClosed };
      `);
      expect(messages.map((message) => [message.line, message.column])).toEqual([
        [8, 11],
        [9, 23],
        [9, 36],
        [10, 11],
        [11, 11],
        [12, 30],
      ]);
      expect(
        messages.every((message) => message.message.includes(TECHNICAL)),
      ).toBe(true);
      expect(messages[0]?.message).toContain('i18n.t(...)');
    });

    it('still requires i18n when a marked value reaches a visible attribute', async () => {
      const messages = await lint(`
        import { craftLiteral } from '@craft-ts/core';

        const drawerOpen = craftLiteral('open');
        input({ placeholder: drawerOpen, title: isOpen ? drawerOpen : i18n.t('drawer.closed') });
      `);
      expect(messages.map((message) => message.message)).toEqual([
        expect.stringContaining('The placeholder value comes from craftLiteral(...)'),
        expect.stringContaining('The title value comes from craftLiteral(...)'),
      ]);
    });

    it('does not treat a craftLiteral that is not the @craft-ts/core helper as technical', async () => {
      const messages = await lint(`
        import { craftLiteral } from './local';

        const drawerOpen = craftLiteral('open');
        p(drawerOpen);
      `);
      expect(messages).toEqual([]);
    });
  });

  it('keeps axisPoint driver metadata out of copy in a style file (#49)', async () => {
    const messages = await lint(
      `
        import { axisPoint } from '@craft-ts/style';
        import * as style from '@craft-ts/style';

        export const ariaExpanded = {
          true: axisPoint('ariaExpanded', 'true', "&[aria-expanded='true']", { kind: 'setAttribute', name: 'aria-expanded', value: 'true' }),
          false: style.axisPoint('ariaExpanded', 'false', "&[aria-expanded='false']", { kind: 'setAttribute', name: 'aria-expanded', value: 'false' }),
        };
      `,
      'src/aria.style.ts',
    );
    expect(messages).toEqual([]);
  });
});

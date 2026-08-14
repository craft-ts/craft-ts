import { ESLint } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const plugin = require('./index.cjs');

async function lint(code: string, rule: string) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tsParser },
        plugins: { 'craft-ng': plugin },
        rules: { [`craft-ng/${rule}`]: 'error' },
      },
    ],
  });
  return eslint.lintText(code, { filePath: 'fixture.ts' });
}

function messages(result: ESLint.LintResult) {
  return result.messages.map((message) => message.message);
}

describe('craft-ng a11y', () => {
  describe('prefer-named-html-helpers', () => {
    it('rejects h() when a named helper exists', async () => {
      const [result] = await lint(`h('img', { alt: '' });`, 'prefer-named-html-helpers');
      expect(messages(result)).toEqual([
        "Use the named helper img(...) instead of h('img'). Named helpers carry a11y types and lint.",
      ]);
    });

    it('allows h() for tags without a helper', async () => {
      const [result] = await lint(`h('video', { src: 'clip.mp4' });`, 'prefer-named-html-helpers');
      expect(result.messages).toEqual([]);
    });
  });

  describe('img-has-alt', () => {
    it('rejects img without alt, including via h()', async () => {
      const [result] = await lint(`img({ src: 'x.png' }); h('img', { src: 'y.png' });`, 'img-has-alt');
      expect(messages(result)).toEqual([
        "<img> must have an alt attribute (use alt: '' for decorative images).",
        "<img> must have an alt attribute (use alt: '' for decorative images).",
      ]);
    });

    it('allows empty decorative alt', async () => {
      const [result] = await lint(`img({ src: 'x.png', alt: '' });`, 'img-has-alt');
      expect(result.messages).toEqual([]);
    });
  });

  describe('control-has-accessible-name', () => {
    it('rejects a nameless button', async () => {
      const [result] = await lint(`button({ type: 'button' });`, 'control-has-accessible-name');
      expect(messages(result)[0]).toContain('<button> must have an accessible name');
    });

    it('allows a button with text children', async () => {
      const [result] = await lint(`button({ type: 'button' }, 'Save');`, 'control-has-accessible-name');
      expect(result.messages).toEqual([]);
    });

    it('allows a button whose name is an ifBlock', async () => {
      const [result] = await lint(
        `button({ type: 'button' }, ifBlock(loading, () => 'Saving', () => 'Save'));`,
        'control-has-accessible-name',
      );
      expect(result.messages).toEqual([]);
    });

    it('allows aria-label', async () => {
      const [result] = await lint(
        `button({ type: 'button', 'aria-label': 'Close' });`,
        'control-has-accessible-name',
      );
      expect(result.messages).toEqual([]);
    });
  });

  describe('label-has-associated-control', () => {
    it('rejects a label with neither htmlFor nor a nested control', async () => {
      const [result] = await lint(`label('Email');`, 'label-has-associated-control');
      expect(messages(result)[0]).toContain('label must be associated');
    });

    it('allows wrapping and htmlFor', async () => {
      const [result] = await lint(
        `label([input({ id: 'email' })]); label({ htmlFor: 'name' }, 'Name'); input({ id: 'name' });`,
        'label-has-associated-control',
      );
      expect(result.messages).toEqual([]);
    });
  });

  describe('no-noninteractive-element-interactions', () => {
    it('rejects click on a div', async () => {
      const [result] = await lint(
        `div({ click: () => undefined }, 'press');`,
        'no-noninteractive-element-interactions',
      );
      expect(messages(result)[0]).toContain('Do not add click to <div>');
    });

    it('allows an explicit widget pattern', async () => {
      const [result] = await lint(
        `div({ role: 'button', tabIndex: 0, click: () => undefined, keydown: () => undefined }, 'press');`,
        'no-noninteractive-element-interactions',
      );
      expect(result.messages).toEqual([]);
    });
  });

  describe('anchor-has-href', () => {
    it('rejects a bare anchor', async () => {
      const [result] = await lint(`a('Home');`, 'anchor-has-href');
      expect(messages(result)[0]).toContain('<a> must have href');
    });

    it('allows href and craftRouterLink', async () => {
      const [result] = await lint(
        `a({ href: '/' }, 'Home'); a({ craftRouterLink: { to: 'home' } }, 'Home');`,
        'anchor-has-href',
      );
      expect(result.messages).toEqual([]);
    });
  });

  describe('button-has-type', () => {
    it('requires type', async () => {
      const [result] = await lint(`button('Save');`, 'button-has-type');
      expect(messages(result)[0]).toContain('button() must set type');
    });

    it('allows an explicit type', async () => {
      const [result] = await lint(`button({ type: 'submit' }, 'Save');`, 'button-has-type');
      expect(result.messages).toEqual([]);
    });

    it('fixes a missing type', async () => {
      const eslint = new ESLint({
        fix: true,
        overrideConfigFile: true,
        overrideConfig: [
          {
            files: ['**/*.ts'],
            languageOptions: { parser: tsParser },
            plugins: { 'craft-ng': plugin },
            rules: { 'craft-ng/button-has-type': 'error' },
          },
        ],
      });
      const [result] = await eslint.lintText(`button('Save');`, { filePath: 'fixture.ts' });
      expect(result.output).toContain("type: 'button'");
    });
  });

  describe('iframe-has-title', () => {
    it('requires title', async () => {
      const [result] = await lint(`iframe({ src: 'about:blank' });`, 'iframe-has-title');
      expect(messages(result)[0]).toContain('<iframe> must have a title');
    });
  });

  describe('heading-has-content', () => {
    it('rejects empty headings', async () => {
      const [result] = await lint(`h1(); heading({ class: 'x' });`, 'heading-has-content');
      expect(messages(result)).toHaveLength(2);
    });

    it('allows text', async () => {
      const [result] = await lint(`h1('Title'); heading('Title');`, 'heading-has-content');
      expect(result.messages).toEqual([]);
    });

    it('allows a generator child', async () => {
      const [result] = await lint(
        `heading(function* () { return title(); });`,
        'heading-has-content',
      );
      expect(result.messages).toEqual([]);
    });
  });

  describe('no-positive-tabindex', () => {
    it('rejects tabIndex > 0', async () => {
      const [result] = await lint(`button({ type: 'button', tabIndex: 2 }, 'Go');`, 'no-positive-tabindex');
      expect(messages(result)[0]).toContain('tabIndex must not be greater than 0');
    });
  });

  describe('valid-aria', () => {
    it('rejects unknown aria attributes', async () => {
      const [result] = await lint(`div({ 'aria-foo': 'x' });`, 'valid-aria');
      expect(messages(result)[0]).toContain('not a valid ARIA attribute');
    });

    it('allows aria-label', async () => {
      const [result] = await lint(`div({ 'aria-label': 'Panel' });`, 'valid-aria');
      expect(result.messages).toEqual([]);
    });
  });

  describe('role-has-required-aria', () => {
    it('requires aria-checked on checkbox role', async () => {
      const [result] = await lint(`div({ role: 'checkbox' });`, 'role-has-required-aria');
      expect(messages(result)[0]).toContain('aria-checked');
    });
  });

  describe('target-blank-noopener', () => {
    it('requires noopener', async () => {
      const [result] = await lint(`a({ href: 'https://x', target: '_blank' }, 'x');`, 'target-blank-noopener');
      expect(messages(result)[0]).toContain('noopener');
    });

    it('allows noreferrer', async () => {
      const [result] = await lint(
        `a({ href: 'https://x', target: '_blank', rel: 'noreferrer' }, 'x');`,
        'target-blank-noopener',
      );
      expect(result.messages).toEqual([]);
    });
  });

  describe('prefer-relative-heading', () => {
    it('rejects absolute heading helpers', async () => {
      const [result] = await lint(`h2('Section');`, 'prefer-relative-heading');
      expect(messages(result)[0]).toContain('Use heading(...)');
    });
  });

  describe('require-route-heading-outline', () => {
    it('skips lazy import() factories', async () => {
      const [result] = await lint(
        `craftRoutes('demo', [{ path: 'x', loadComponent: () => import('./page').then(m => m.Page) }]);`,
        'require-route-heading-outline',
      );
      expect(result.messages).toEqual([]);
    });

    it('rejects an inline factory without heading', async () => {
      const [result] = await lint(
        `craftRoutes('demo', [{ path: 'x', loadComponent: () => div('page') }]);`,
        'require-route-heading-outline',
      );
      expect(messages(result)[0]).toContain('heading outline');
    });
  });

  describe('no-heading-level-skip', () => {
    it('rejects h1 followed by h3 in a craftComponent template', async () => {
      const [result] = await lint(
        `craftComponent('Page', {}, () => ({}), () => [h1('A'), h3('C')]);`,
        'no-heading-level-skip',
      );
      expect(messages(result)[0]).toContain('Heading level skips');
    });
  });

  it('exports the a11y preset as error', () => {
    expect(plugin.configs.a11y.rules['craft-ng/img-has-alt']).toBe('error');
    expect(plugin.configs.a11y.rules['craft-ng/button-has-type']).toBe('error');
  });
});

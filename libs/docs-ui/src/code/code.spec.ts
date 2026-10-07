import { describe, expect, it } from 'vitest';
import { renderCraftComponent } from '@craft-ts/component';
import {
  registeredAtoms,
  registeredFonts,
  registeredGlobalRules,
  registeredKeyframes,
} from '@craft-ts/style';
import { renderCss } from '@craft-ts/style/vite';
import { DocCode, type CodeLine } from './code.ts';

const lines: readonly CodeLine[] = [
  {
    tokens: [
      { text: 'const', kind: 'keyword' },
      { text: ' count = ' },
      { text: 'state', kind: 'function' },
      { text: '(', kind: 'punctuation' },
      { text: '0', kind: 'number' },
      { text: ');', kind: 'punctuation' },
    ],
    mark: 'highlight',
  },
  { tokens: [{ text: 'legacy();' }], mark: 'remove' },
  { tokens: [{ text: 'next();' }], mark: 'add' },
  { tokens: [{ text: '// done', kind: 'comment' }] },
];

const render = (
  options: {
    numbered?: boolean;
    filename?: string;
    lang?: string;
    start?: number;
  } = {},
) =>
  renderCraftComponent(DocCode as never, {
    props: {
      lines: function* () {
        return lines;
      },
      filename: function* () {
        return options.filename ?? '';
      },
      language: function* () {
        return options.lang ?? '';
      },
      numbered: function* () {
        return options.numbered ?? false;
      },
      firstLine: function* () {
        return options.start ?? 1;
      },
    } as never,
  });

describe('DocCode', () => {
  it('reproduces the code exactly, one line per line', async () => {
    const rendered = await render();
    const code = rendered.element.querySelector('pre code') as HTMLElement;
    const text = (code.textContent ?? '').replace(/[+\- ]?(?=\S)/, '');

    expect(code.querySelectorAll('[data-mark]').length).toBeGreaterThan(0);
    expect(code.textContent).toContain('const count = state(0);');
    expect(code.textContent).toContain('// done');
    expect(text.length).toBeGreaterThan(0);
    rendered.destroy();
  });

  it('is reachable and named for the keyboard, since it scrolls sideways', async () => {
    const rendered = await render({ filename: 'counter.ts' });
    const pre = rendered.element.querySelector('pre') as HTMLElement;

    expect(pre.getAttribute('tabindex')).toBe('0');
    expect(pre.getAttribute('aria-label')).toBe('counter.ts');
    rendered.destroy();
  });

  it('says what a mark means with a glyph, not only with a colour', async () => {
    const rendered = await render();
    const glyphs = [
      ...rendered.element.querySelectorAll('[aria-hidden="true"][data-mark]'),
    ].map((node) => node.textContent?.trim());

    expect(glyphs).toContain('+');
    expect(glyphs).toContain('-');
    rendered.destroy();
  });

  it('hides the gutter from assistive technology and numbers from `firstLine`', async () => {
    const rendered = await render({ numbered: true, start: 3 });
    const numbers = [
      ...rendered.element.querySelectorAll('[aria-hidden="true"]'),
    ]
      .map((node) => node.textContent?.trim())
      .filter((text) => /^\d+$/.test(text ?? ''));

    expect(numbers).toEqual(['3', '4', '5', '6']);
    rendered.destroy();
  });

  it('shows a header only when there is something to put in it', async () => {
    const bare = await render();
    expect(bare.element.textContent).not.toContain('counter.ts');
    bare.destroy();

    const named = await render({ filename: 'counter.ts', lang: 'ts' });
    expect(named.element.textContent).toContain('counter.ts');
    expect(named.element.textContent).toContain('ts');
    named.destroy();
  });

  it('owns its horizontal scroll port, the only road to overflow', () => {
    const css = renderCss(registeredAtoms(), [], {
      reset: true,
      base: true,
      globals: registeredGlobalRules(),
      fonts: registeredFonts(),
      keyframes: registeredKeyframes(),
    });

    expect(css).toContain('overflow-inline:auto');
    expect(css).toContain("[data-syntax='keyword']");
    expect(css).toContain("[data-mark='add']");
    expect(css).toContain("[data-mark='dim']");
  });
});

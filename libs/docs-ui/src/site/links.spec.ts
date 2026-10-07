import { describe, expect, it } from 'vitest';
import type { ParsedPage } from '../markdown/tree.ts';
import { rebaseHref, rebasePage } from './links.ts';

const at = (route: string, base = '/craft/') => ({ route, base });

describe('rebaseHref', () => {
  it.each([
    ['/guide/state/query', '/guide/state/local-state', '/craft/guide/state/query'],
    ['./tokens.md', '/guide/style/define', '/craft/guide/style/tokens'],
    ['../setup', '/guide/style/define', '/craft/guide/setup'],
    ['./unique-identities', '/guide/testing/architecture/', '/craft/guide/testing/architecture/unique-identities'],
    ['./index.md', '/guide/style/define', '/craft/guide/style/'],
    ['/guide/x.md#part', '/', '/craft/guide/x#part'],
    ['/assets/craft-ts-logo.png', '/guide/', '/craft/assets/craft-ts-logo.png'],
    ['sibling.md?tab=2', '/guide/a', '/craft/guide/sibling?tab=2'],
  ])('writes %s, read from %s, as %s', (href, route, expected) => {
    expect(rebaseHref(href, at(route))).toBe(expected);
  });

  it('leaves an address that leaves the page alone', () => {
    for (const href of ['https://x.dev/a', '//cdn.x/a.js', '#section', 'mailto:a@b.c', '']) {
      expect(rebaseHref(href, at('/guide/a'))).toBe(href);
    }
  });

  it('adds nothing when the site is at the root', () => {
    expect(rebaseHref('/guide/x', at('/', '/'))).toBe('/guide/x');
  });
});

describe('rebasePage', () => {
  it('reaches links in lists, tables, callouts and emphasis, and images and figures', () => {
    const link = (href: string) => ({ t: 'link' as const, href, external: false, children: [{ t: 'text' as const, text: 'x' }] });
    const page: ParsedPage = {
      frontmatter: {},
      outline: [],
      diagnostics: [],
      blocks: [
        { t: 'paragraph', children: [{ t: 'strong', children: [link('./a.md')] }] },
        { t: 'list', ordered: false, items: [[{ t: 'paragraph', children: [link('/b')] }]] },
        { t: 'table', head: [[link('/c')]], rows: [[[{ t: 'image', src: '/assets/i.png', alt: '' }]]] },
        { t: 'callout', tone: 'tip', caption: '', children: [{ t: 'paragraph', children: [link('../d')] }] },
        { t: 'figure', src: '/assets/f.png', alt: '', variant: '' },
      ],
    };
    const out = JSON.stringify(rebasePage(page, at('/guide/x/y')));
    for (const expected of ['/craft/guide/x/a', '/craft/b', '/craft/c', '/craft/assets/i.png', '/craft/guide/d', '/craft/assets/f.png']) {
      expect(out).toContain(`"${expected}"`);
    }
    expect(out).not.toContain('"./a.md"');
  });
});

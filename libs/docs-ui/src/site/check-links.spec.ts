import { describe, expect, it } from 'vitest';
import { describeBrokenLinks, findBrokenLinks, type PageToCheck } from './check-links.ts';
import type { Block, Inline } from '../markdown/tree.ts';

const link = (href: string): Inline => ({ t: 'link', href, external: false, children: [{ t: 'text', text: 'x' }] });
const para = (...hrefs: string[]): Block => ({ t: 'paragraph', children: hrefs.map(link) });
const heading = (id: string): Block => ({ t: 'heading', level: 2, id, children: [{ t: 'text', text: id }] });
const page = (route: string, blocks: Block[], frontmatter: Record<string, unknown> = {}): PageToCheck => ({
  route,
  page: { frontmatter, blocks, outline: [], diagnostics: [] },
});

const pages = [
  page('/guide/', [heading('intro')]),
  page('/guide/state/local', [heading('the-common-case'), heading('caf%C3%A9')]),
  page('/guide/state/server', [
    para(
      '/guide/state/local#the-common-case',
      './local.md#the-common-case',
      '../',
      '/guide',
      '#here',
      'https://example.com/a#b',
      '/assets/logo.png',
      '/llms.txt',
      '/guide/state/local#café',
    ),
    heading('here'),
  ]),
];

describe('findBrokenLinks', () => {
  it('accepts links to pages and headings that exist, in every spelling the docs use', () => {
    expect(findBrokenLinks(pages)).toEqual([]);
  });

  it('names a link to a page that does not exist', () => {
    const broken = findBrokenLinks([...pages, page('/a', [para('/guide/nope', './missing.md#x')])]);
    expect(broken).toEqual([
      { route: '/a', href: '/guide/nope', problem: 'no-page' },
      { route: '/a', href: './missing.md#x', problem: 'no-page' },
    ]);
  });

  it('names a link to a heading the page does not have, in the same page or another', () => {
    const broken = findBrokenLinks([
      ...pages,
      page('/b', [para('/guide/state/local#gone', '#nothing-here')]),
    ]);
    expect(describeBrokenLinks(broken)).toEqual([
      '/b: /guide/state/local#gone (no such heading)',
      '/b: #nothing-here (no such heading)',
    ]);
  });

  it('looks inside lists, tables, callouts and the links of a home page', () => {
    const inCallout: Block = { t: 'callout', tone: 'tip', caption: '', children: [para('/guide/nope')] };
    const inList: Block = { t: 'list', ordered: false, items: [[para('/guide/nope2')]] };
    const home = page('/', [inCallout, inList], {
      hero: { actions: [{ link: '/guide/nope3' }] },
      features: [{ link: '/guide/state/local#absent' }, { link: '' }],
    });
    expect(findBrokenLinks([...pages, home]).map((b) => b.href)).toEqual([
      '/guide/nope',
      '/guide/nope2',
      '/guide/nope3',
      '/guide/state/local#absent',
    ]);
  });
});

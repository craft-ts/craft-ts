import { describe, expect, it } from 'vitest';
import {
  isActiveNav,
  isCurrent,
  normalizePath,
  pagerFor,
  roman,
  sidebarFor,
  trailFor,
  holds,
  type SiteConfig,
} from './site.ts';
import { entryFromPage, searchEntries } from './search.ts';

const config: SiteConfig = {
  title: '@craft-ts',
  base: '/craft/',
  nav: [
    { text: 'Learn', link: '/learn/', activeMatch: '^/learn/' },
    { text: 'Guide', link: '/guide/' },
    {
      text: 'Resources',
      items: [{ text: 'Roadmap', link: '/resources/roadmap' }],
    },
  ],
  sidebar: {
    '/guide/': [
      { text: 'Guide overview', link: '/guide/' },
      {
        text: 'Managing state',
        items: [
          { text: 'Local state', link: '/guide/state/local-state' },
          { text: 'query', link: '/guide/state/server-state' },
          { text: 'Mutations', link: '/guide/state/mutations' },
        ],
      },
    ],
    '/guide/ai/': [{ text: 'AI overview', link: '/guide/ai/' }],
    '/learn/': [{ text: 'Overview', link: '/learn/' }],
  },
};

describe('normalizePath', () => {
  it.each([
    ['/craft/guide/state/local-state.html#x', '/guide/state/local-state'],
    ['/craft/guide/index.html', '/guide/'],
    ['/guide/state/local-state?q=1', '/guide/state/local-state'],
    ['guide/', '/guide/'],
  ])('reads %s as %s', (input, expected) => {
    expect(normalizePath(input, '/craft/')).toBe(expected);
  });
});

describe('sidebarFor', () => {
  it('takes the longest prefix, so /guide/ai/ has its own sidebar', () => {
    expect(sidebarFor(config, '/guide/ai/mcp-tools')[0]?.text).toBe('AI overview');
    expect(sidebarFor(config, '/craft/guide/state/mutations.html')[0]?.text).toBe(
      'Guide overview',
    );
    expect(sidebarFor(config, '/elsewhere')).toEqual([]);
  });
});

describe('current page', () => {
  it('treats a directory and its index as the same page', () => {
    expect(isCurrent('/guide/', '/craft/guide/index.html', '/craft/')).toBe(true);
    expect(isCurrent('/guide/', '/guide/state/local-state', '/craft/')).toBe(false);
  });

  it('lights the top entries by match, by link, and by any page of a menu', () => {
    const [learn, guide, resources] = config.nav;
    expect(isActiveNav(learn!, '/learn/05-load-data')).toBe(true);
    expect(isActiveNav(guide!, '/guide/')).toBe(true);
    expect(isActiveNav(guide!, '/guide/state/mutations')).toBe(false);
    expect(isActiveNav(resources!, '/resources/roadmap')).toBe(true);
  });

  it('knows a group holds the page, so it opens', () => {
    const group = config.sidebar['/guide/']![1]!;
    expect(holds(group, '/guide/state/query')).toBe(false);
    expect(holds(group, '/guide/state/mutations')).toBe(true);
  });
});

describe('trail and pager', () => {
  it('writes the trail: group, then page, each with somewhere to go', () => {
    expect(trailFor(config, '/guide/state/server-state')).toEqual([
      { label: 'Managing state', href: '/guide/state/local-state' },
      { label: 'query', href: '/guide/state/server-state' },
    ]);
    expect(trailFor(config, '/nowhere')).toEqual([]);
  });

  it('finds the previous and next page in reading order, across groups', () => {
    expect(pagerFor(config, '/guide/state/local-state')).toEqual({
      previous: { text: 'Guide overview', link: '/guide/' },
      next: { text: 'query', link: '/guide/state/server-state' },
    });
    expect(pagerFor(config, '/guide/').previous).toBeNull();
    expect(pagerFor(config, '/guide/state/mutations').next).toBeNull();
    expect(pagerFor(config, '/nowhere')).toEqual({ previous: null, next: null });
  });
});

describe('roman', () => {
  it.each([
    [1, 'i.'],
    [2, 'ii.'],
    [4, 'iv.'],
    [9, 'ix.'],
    [12, 'xii.'],
  ])('counts %i as %s', (value, expected) => {
    expect(roman(value)).toBe(expected);
  });
});

describe('search', () => {
  const entries = [
    {
      href: '/guide/state/local-state',
      title: 'Local state',
      headings: ['The common case', 'Equality'],
      text: 'A signal holds one value. Equality decides when it notifies.',
    },
    {
      href: '/guide/state/server-state',
      title: 'query',
      headings: ['Loading data'],
      text: 'A query loads server data and keeps it in state.',
    },
  ];

  it('finds a page by its title first, then by a heading, then by its body', () => {
    expect(searchEntries(entries, 'state')[0]?.entry.href).toBe(
      '/guide/state/local-state',
    );
    const byHeading = searchEntries(entries, 'equality')[0];
    expect(byHeading?.entry.href).toBe('/guide/state/local-state');
    expect(byHeading?.heading).toBe('Equality');
    expect(searchEntries(entries, 'notifies')[0]?.entry.href).toBe(
      '/guide/state/local-state',
    );
  });

  it('wants every word, ignores case and accents, and says nothing for an empty query', () => {
    expect(searchEntries(entries, 'query loads')[0]?.entry.title).toBe('query');
    expect(searchEntries(entries, 'QUERY signal')).toEqual([]);
    expect(searchEntries(entries, 'Équalitý')).not.toEqual([]);
    expect(searchEntries(entries, '   ')).toEqual([]);
  });

  it('builds an entry from a parsed page', () => {
    const entry = entryFromPage('/x', {
      frontmatter: {},
      outline: [{ level: 2, id: 'a', text: 'Part one' }],
      diagnostics: [],
      blocks: [
        { t: 'heading', level: 1, id: 'x', children: [{ t: 'text', text: 'Title' }] },
        { t: 'paragraph', children: [{ t: 'text', text: 'Some body.' }] },
      ],
    });
    expect(entry).toEqual({
      href: '/x',
      title: 'Title',
      headings: ['Part one'],
      text: 'Title Some body.',
    });
  });
});

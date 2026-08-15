import { describe, expect, it } from 'vitest';
import { findPage, pageUrl, searchPages, type DocPage } from './catalog.js';

const pages: DocPage[] = [
  {
    path: '/guide/state/local-state',
    title: 'Local state',
    description: 'state() for UI you own',
    body: 'Use state for local counters. yield* the reader.',
  },
  {
    path: '/guide/state/server-state',
    title: 'query',
    body: 'Server data with reactive params.',
  },
  {
    path: '/learn/01-first-state',
    title: 'Your first state',
    body: 'A counter with state and yield*.',
  },
  {
    path: '/resources/examples',
    title: 'Examples',
    body: 'Pagination and login form demos.',
  },
];

describe('searchPages', () => {
  it('ranks title matches above body matches', () => {
    const hits = searchPages(pages, 'state');
    expect(hits[0]?.path).toBe('/guide/state/local-state');
    expect(hits[0]?.url).toBe(
      'https://ng-angular-stack.github.io/craft/guide/state/local-state',
    );
  });

  it('can restrict to learn and example pages', () => {
    const hits = searchPages(pages, 'state', { section: 'examples' });
    expect(hits.map((hit) => hit.path)).toEqual(['/learn/01-first-state']);
  });

  it('returns nothing for an empty query', () => {
    expect(searchPages(pages, '   ')).toEqual([]);
  });
});

describe('findPage', () => {
  it('accepts paths with or without a leading slash', () => {
    expect(findPage(pages, 'guide/state/local-state')?.title).toBe(
      'Local state',
    );
    expect(pageUrl('/')).toBe('https://ng-angular-stack.github.io/craft/');
  });
});

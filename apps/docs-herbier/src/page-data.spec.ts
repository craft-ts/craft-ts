import { describe, expect, it } from 'vitest';
import {
  documentDescription,
  documentTitle,
  markdownFileOfRoute,
  type PageData,
} from './page-data.ts';

const page = (over: Partial<PageData>): PageData => ({
  kind: 'doc',
  route: '/guide/a',
  title: 'A',
  blocks: [],
  outline: [],
  ...over,
});

describe('documentTitle', () => {
  it('is the site alone on the home page and for a page with no title of its own', () => {
    expect(documentTitle('@craft-ts', page({ route: '/', kind: 'home', title: 'Home' }))).toBe('@craft-ts');
    expect(documentTitle('@craft-ts', page({ title: '' }))).toBe('@craft-ts');
  });

  it('is `title | site` for a page, and `404 | site` for the page not found', () => {
    expect(documentTitle('@craft-ts', page({}))).toBe('A | @craft-ts');
    expect(
      documentTitle('@craft-ts', page({ kind: 'notFound', route: '/404', title: 'Page not found' })),
    ).toBe('404 | @craft-ts');
  });
});

describe('documentDescription', () => {
  it('is the page\'s own, else the site\'s, and `Not Found` for the 404', () => {
    expect(documentDescription({ description: 'Site' }, page({ description: 'Own' }))).toBe('Own');
    expect(documentDescription({ description: 'Site' }, page({}))).toBe('Site');
    expect(documentDescription({}, page({}))).toBe('');
    expect(documentDescription({ description: 'Site' }, page({ kind: 'notFound' }))).toBe('Not Found');
  });
});

describe('markdownFileOfRoute', () => {
  it.each([
    ['/guide/a', 'guide/a.md'],
    ['/guide/', 'guide.md'],
    ['/learn/01-first-state', 'learn/01-first-state.md'],
    ['/', undefined],
  ])('writes %s as %s', (route, file) => {
    expect(markdownFileOfRoute(route)).toBe(file);
  });
});

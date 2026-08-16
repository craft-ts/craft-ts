// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  createBrowserHistory,
  matchCraftRoutes,
  type CraftCompiledRoute,
} from './craft-router-runtime';

function locationOf(pathname: string, search = '', hash = '') {
  return { pathname, search, hash };
}

describe('createBrowserHistory', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('pushes /a and exposes the new location', () => {
    const history = createBrowserHistory(window);
    const seen: string[] = [];
    const stop = history.listen((location) => {
      seen.push(location.pathname);
    });

    history.push('/a');

    expect(history.get()).toEqual({
      pathname: '/a',
      search: '',
      hash: '',
    });
    expect(seen).toEqual(['/a']);
    stop();
  });

  it('replace updates the current entry without growing history', () => {
    const history = createBrowserHistory(window);
    history.push('/a');
    history.replace('/b?x=1#top');

    expect(history.get()).toEqual({
      pathname: '/b',
      search: '?x=1',
      hash: '#top',
    });
  });
});

describe('matchCraftRoutes', () => {
  it('matches a static path a against /a', () => {
    const routes: CraftCompiledRoute[] = [{ path: 'a' }];
    const match = matchCraftRoutes(routes, locationOf('/a'));

    expect(match).not.toBeNull();
    expect(match?.route.path).toBe('a');
    expect(match?.pathname).toBe('/a');
    expect(match?.params).toEqual({});
    expect(match?.queryParams).toEqual({});
  });

  it('parses the query string onto the match', () => {
    const routes: CraftCompiledRoute[] = [{ path: 'a' }];
    const match = matchCraftRoutes(routes, locationOf('/a', '?page=2&q=hi'));

    expect(match?.queryParams).toEqual({ page: '2', q: 'hi' });
    expect(match?.search).toBe('?page=2&q=hi');
  });

  it('captures a :param segment', () => {
    const routes: CraftCompiledRoute[] = [{ path: 'users/:userId' }];
    const match = matchCraftRoutes(routes, locationOf('/users/42'));

    expect(match?.route.path).toBe('users/:userId');
    expect(match?.params).toEqual({ userId: '42' });
  });

  it('matches a ** wildcard against remaining segments', () => {
    const routes: CraftCompiledRoute[] = [
      { path: 'known' },
      { path: '**' },
    ];
    const match = matchCraftRoutes(routes, locationOf('/missing/page'));

    expect(match?.route.path).toBe('**');
  });

  it('returns null when nothing matches', () => {
    const routes: CraftCompiledRoute[] = [{ path: 'a' }];
    expect(matchCraftRoutes(routes, locationOf('/b'))).toBeNull();
  });

  it('matches nested children for remaining segments', () => {
    const routes: CraftCompiledRoute[] = [
      {
        path: 'users/:userId',
        children: [{ path: 'details' }],
      },
    ];
    const match = matchCraftRoutes(routes, locationOf('/users/7/details'));

    expect(match?.params).toEqual({ userId: '7' });
    expect(match?.route.path).toBe('details');
    expect(match?.routes.map((route) => route.path)).toEqual([
      'users/:userId',
      'details',
    ]);
  });
});

describe('history + matcher', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('pushes /a then matches path a', () => {
    const history = createBrowserHistory(window);
    const routes: CraftCompiledRoute[] = [{ path: 'a' }];

    history.push('/a');
    const match = matchCraftRoutes(routes, history.get());

    expect(match?.route.path).toBe('a');
  });
});

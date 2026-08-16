// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  createBrowserHistory,
  matchCraftRoutes,
  matchCraftRoutesAsync,
  sliceCraftMatchForOutlet,
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
    const routes: CraftCompiledRoute[] = [{ path: 'known' }, { path: '**' }];
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

  it('loads loadChildren then rematches the empty-path child for /slow-page', async () => {
    const child: CraftCompiledRoute = {
      path: '',
      component: { name: 'SlowPage' },
    };
    const routes: CraftCompiledRoute[] = [
      {
        path: 'slow-page',
        loadChildren: async () => [child],
      },
    ];

    const match = await matchCraftRoutesAsync(routes, locationOf('/slow-page'));

    expect(match?.route).toBe(child);
    expect(routes[0].children).toEqual([child]);
  });

  it('loads loadChildren when the parent has a component and remaining segments are empty', async () => {
    const child: CraftCompiledRoute = {
      path: '',
      component: { name: 'Child' },
    };
    const parent: CraftCompiledRoute = {
      path: 'layout',
      component: { name: 'Layout' },
      loadChildren: async () => [child],
    };
    const routes: CraftCompiledRoute[] = [parent];

    const match = await matchCraftRoutesAsync(routes, locationOf('/layout'));

    expect(match?.route).toBe(child);
    expect(match?.routes.map((route) => route.path)).toEqual(['layout', '']);
    expect(parent.children).toEqual([child]);
  });

  it('clears inflight after a failed loadChildren so a later match can retry', async () => {
    let attempts = 0;
    const child: CraftCompiledRoute = {
      path: '',
      component: { name: 'Child' },
    };
    const routes: CraftCompiledRoute[] = [
      {
        path: 'lazy',
        loadChildren: async () => {
          attempts += 1;
          if (attempts === 1) {
            throw new Error('chunk failed');
          }
          return [child];
        },
      },
    ];

    await expect(
      matchCraftRoutesAsync(routes, locationOf('/lazy')),
    ).rejects.toThrow('chunk failed');

    const match = await matchCraftRoutesAsync(routes, locationOf('/lazy'));

    expect(attempts).toBe(2);
    expect(match?.route).toBe(child);
  });

  it('slices a parent+child match so the outlet activates the parent and the suffix is the child', () => {
    const child: CraftCompiledRoute = {
      path: 'child',
      component: { name: 'Child' },
    };
    const parent: CraftCompiledRoute = {
      path: 'parent',
      component: { name: 'Parent' },
      children: [child],
    };
    const match = matchCraftRoutes([parent], locationOf('/parent/child'));
    const sliced = sliceCraftMatchForOutlet(match!);

    expect(sliced.activated.route).toBe(parent);
    expect(sliced.activated.routes.map((route) => route.path)).toEqual([
      'parent',
      'child',
    ]);
    expect(sliced.child?.route).toBe(child);
    expect(sliced.child?.routes).toEqual([child]);
  });

  it('skips a parent without a component so the root outlet activates the child', () => {
    const child: CraftCompiledRoute = {
      path: '',
      component: { name: 'SlowPage' },
    };
    const parent: CraftCompiledRoute = {
      path: 'slow-page',
      children: [child],
    };
    const match = matchCraftRoutes([parent], locationOf('/slow-page'));
    const sliced = sliceCraftMatchForOutlet(match!);

    expect(sliced.activated.route).toBe(child);
    expect(sliced.child).toBeNull();
  });

  it('follows a compiled redirectTo instead of matching the redirect route', () => {
    const home: CraftCompiledRoute = {
      path: 'home',
      component: { name: 'Home' },
    };
    const routes: CraftCompiledRoute[] = [
      { path: '', redirectTo: '/home' },
      home,
    ];
    const match = matchCraftRoutes(routes, locationOf('/'));

    expect(match?.route).toBe(home);
    expect(match?.pathname).toBe('/home');
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

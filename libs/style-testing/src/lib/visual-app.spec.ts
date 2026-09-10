import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VISUAL_APP_VIEWPORTS,
  defineHappyPathHttpMocks,
  defineVisualAppConfig,
  matchHappyPathHttpRequest,
  visualAppHappyPaths,
} from './visual-app.ts';

describe('visual application happy paths', () => {
  const mocks = defineHappyPathHttpMocks('home.happy-path.ts', {
    'GET /api/users': { response: [{ id: '42' }] },
  });

  it('creates mobile and desktop captures by default', () => {
    const config = defineVisualAppConfig({
      pages: [
        {
          id: 'home',
          route: '',
          url: '/',
          component: 'component:src/app/home-page.ts:HomePage',
          mocks,
        },
      ],
    });

    expect(config.viewports).toEqual(DEFAULT_VISUAL_APP_VIEWPORTS);
    expect(visualAppHappyPaths(config).map((scenario) => scenario.id)).toEqual([
      'home--happy-path--mobile',
      'home--happy-path--desktop',
    ]);
  });

  it('normalizes and matches successful HTTP datasets', () => {
    expect(
      matchHappyPathHttpRequest(mocks, {
        method: 'get',
        url: 'https://example.test/api/users',
      }),
    ).toMatchObject({
      endpoint: 'GET /api/users',
      mode: 'mock',
      response: { kind: 'success', body: [{ id: '42' }] },
    });

    const dynamicMocks = defineHappyPathHttpMocks('user.happy-path.ts', {
      'GET /api/users/*': { response: { id: '42' } },
    });
    expect(
      matchHappyPathHttpRequest(dynamicMocks, {
        method: 'GET',
        url: '/api/users/42',
      })?.endpoint,
    ).toBe('GET /api/users/*');
  });
});

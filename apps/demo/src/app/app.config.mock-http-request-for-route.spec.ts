import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  mockHttpRequestForRoute,
  type RouteHttpDepsByPath,
} from '@craft-ng/core';
import type { DemoRouteHttpDeps } from './app.config';

type DemoAppMetaData = typeof import('./app.config').appConfig.APP_CONFIG_META_DATA;

declare module '@craft-ng/core' {
  interface CraftRouteHttpDepsRegistry {
    DemoApp: DemoRouteHttpDeps;
  }
}

describe('demo route http deps registry', () => {
  it('should expose the app config alias through the public route mock registry', () => {
    const mockedRoute = mockHttpRequestForRoute(
      'DemoApp',
      'craft/lazy-layout/:teamId/users/:userId',
      {
        'GET users': {
          kind: 'exception',
          code: 'PASSWORD_REQUIRED',
          status: 400,
          body: {
            code: 'PASSWORD_REQUIRED',
            message: 'Password is required',
          },
        },
      },
    );

    expect(mockedRoute).toEqual({
      app: 'DemoApp',
      route: 'craft/lazy-layout/:teamId/users/:userId',
      handlers: [
        {
          endpoint: 'GET users',
          method: 'GET',
          url: 'users',
          response: {
            kind: 'exception',
            code: 'PASSWORD_REQUIRED',
            status: 400,
            body: {
              code: 'PASSWORD_REQUIRED',
              message: 'Password is required',
            },
          },
        },
      ],
    });

    expectTypeOf<DemoRouteHttpDeps>().toEqualTypeOf<
      RouteHttpDepsByPath<DemoAppMetaData>
    >();
  });
});

if (false) {
  // @ts-expect-error unknown demo routes should be rejected
  mockHttpRequestForRoute('DemoApp', 'unknown', {});

  mockHttpRequestForRoute('DemoApp', 'craft/lazy-layout/:teamId/users/:userId', {
    // @ts-expect-error endpoints must come from the selected demo route
    'POST users': {
      kind: 'error',
      status: 500,
    },
  });
}

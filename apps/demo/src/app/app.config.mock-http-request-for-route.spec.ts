import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  mockHttpRequestForRoute,
  type RouteHttpDepsByPath,
} from '@craft-ng/core';

describe('demo route http deps registry', () => {
  it('should expose the app config alias through the public route mock registry', () => {
    const mockedRoute = mockHttpRequestForRoute(
      'DemoApp',
      'craft/lazy-layout/:teamId/users/:userId',
      {
        'GET users': {
          kind: 'mock',
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
      },
    );

    expect(mockedRoute).toEqual({
      app: 'DemoApp',
      route: 'craft/lazy-layout/:teamId/users/:userId',
      endpoints: [
        {
          endpoint: 'GET users',
          method: 'GET',
          url: 'users',
          mode: 'mock',
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

  // @ts-expect-error endpoints must come from the selected demo route
  mockHttpRequestForRoute('DemoApp', 'craft/lazy-layout/:teamId/users/:userId', {
    'GET users': 'ignore',
    'POST users': 'ignore',
  });
}

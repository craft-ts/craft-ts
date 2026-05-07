import '@angular/compiler';
import { Type } from '@angular/core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { GetDeps } from './branded-component/branded-component';
import { CraftHttpClient, type CraftHttpRequest } from './craft-http-client';
import { craftException } from './craft-exception';
import { craftRoutes } from './craft-routes';
import { craftService, type GetInjectedServiceDependencies } from './craft-service';
import {
  matchMockHttpRequestForRoute,
  mockHttpRequestForRoute,
  type ExtractCraftHttpRequestCustomException,
  type ExtractCraftHttpRequestSuccess,
  type MatchMockHttpRequestForRouteSource,
  type MockHttpRequestForRouteInput,
  type MockHttpRequestResponse,
  type RouteHttpDepsByPath,
} from './mock-http-request-for-route';

type User = { id: string };
type LoginResult = { token: string };

const passwordRequired = () =>
  craftException(
    {
      code: 'PASSWORD_REQUIRED',
      scope: 'RouteHttpMockAuthApi',
    },
    {
      field: 'password',
    },
  );

const invalidPasswordPayload = () =>
  craftException(
    {
      code: 'INVALID_PASSWORD_PAYLOAD',
      scope: 'RouteHttpMockAuthApi',
    },
    {
      field: 'password',
    },
  );

const rateLimited = () =>
  craftException({
    code: 'RATE_LIMITED',
    scope: 'RouteHttpMockAuthApi',
  });

const teapot = () =>
  craftException({
    code: 'TEAPOT',
    scope: 'RouteHttpMockAuthApi',
  });

const { injectRouteHttpMockUsersApi } = craftService(
  { name: 'RouteHttpMockUsersApi', scope: 'global' },
  function* () {
    const getUsers = yield* CraftHttpClient.get(({ response }) => ({
      url: '/api/users',
      success: response<User[]>(),
    }));

    return {
      getUsers,
    };
  },
);

const { injectRouteHttpMockAuthApi } = craftService(
  { name: 'RouteHttpMockAuthApi', scope: 'global' },
  function* () {
    const login = yield* CraftHttpClient.post(({ response }) => ({
      url: '/api/login',
      payload: {
        email: 'john@doe.com',
      },
      success: response<LoginResult>(),
      exceptions: [
        function* ({ status, code, content }) {
          if (!(yield* status(400))) {
            return;
          }

          if (!(yield* code('PASSWORD_REQUIRED'))) {
            return;
          }

          if (!(yield* content('Password is required'))) {
            return;
          }

          return passwordRequired();
        },
        function* ({ body }) {
          const payload = yield* body<{
            errors?: Array<{ field: string; message: string }>;
          }>();

          if (!payload.errors?.some((error) => error.field === 'password')) {
            return;
          }

          return invalidPasswordPayload();
        },
        function* ({ status, header }) {
          if (!(yield* status(429))) {
            return;
          }

          if (!(yield* header('x-error-kind', 'rate-limit'))) {
            return;
          }

          return rateLimited();
        },
        function* ({ status, code, content, header, body }) {
          const statusCode = yield* status();
          const errorCode = yield* code();
          const message = yield* content();
          const traceId = yield* header('x-trace-id');
          const payload = yield* body<{
            reason: string;
          }>();

          if (
            statusCode !== 418 ||
            errorCode !== 'TEAPOT' ||
            message !== 'Short and stout' ||
            traceId !== 'trace-1' ||
            payload.reason !== 'brew'
          ) {
            return;
          }

          return teapot();
        },
      ],
    }));

    return {
      login,
    };
  },
);

type DashboardRouteDeps = GetDeps<{
  deps: {};
  propertiesDeps: {
    usersApi: {
      RouteHttpMockUsersApi: GetInjectedServiceDependencies<
        typeof injectRouteHttpMockUsersApi
      >;
    };
    authApi: {
      RouteHttpMockAuthApi: GetInjectedServiceDependencies<
        typeof injectRouteHttpMockAuthApi
      >;
    };
  };
  provided: {};
  publicProperties: {};
}>;

const { routeHttpMockRoutes } = craftRoutes('routeHttpMock', [
  {
    path: 'dashboard',
    loadComponent: async () => null as unknown as Type<unknown>,
    componentDeps: {} as DashboardRouteDeps,
  },
  {
    path: 'empty',
    loadComponent: async () => null as unknown as Type<unknown>,
    componentDeps: {},
  },
]);

type RouteHttpMockAppHttpDeps = RouteHttpDepsByPath<
  typeof routeHttpMockRoutes.META_DATA
>;

type DashboardHttpDeps = RouteHttpMockAppHttpDeps['dashboard'];
type LoginRequest = DashboardHttpDeps['POST /api/login'];
type DashboardMockInput = MockHttpRequestForRouteInput<
  'RouteHttpMockApp',
  'dashboard'
>;
type PasswordRequiredException = Extract<
  ExtractCraftHttpRequestCustomException<LoginRequest>,
  { code: 'PASSWORD_REQUIRED' }
>;

declare module './mock-http-request-for-route' {
  interface CraftRouteHttpDepsRegistry {
    RouteHttpMockApp: RouteHttpMockAppHttpDeps;
  }
}

function createDashboardRouteMock(mocks: DashboardMockInput) {
  return mockHttpRequestForRoute('RouteHttpMockApp', 'dashboard', mocks);
}

describe('mockHttpRequestForRoute', () => {
  it('should normalize exhaustive route inputs into endpoints', () => {
    const mockedRoute = createDashboardRouteMock({
      'GET /api/users': {
        kind: 'mock',
        response: [{ id: '1' }],
      },
      'POST /api/login': 'ignore',
    });

    expect(mockedRoute).toEqual({
      app: 'RouteHttpMockApp',
      route: 'dashboard',
      endpoints: [
        {
          endpoint: 'GET /api/users',
          method: 'GET',
          url: '/api/users',
          mode: 'mock',
          response: {
            kind: 'success',
            body: [{ id: '1' }],
          },
        },
        {
          endpoint: 'POST /api/login',
          method: 'POST',
          url: '/api/login',
          mode: 'ignore',
        },
      ],
    });
  });

  it('should preserve explicit error and exception responses in mock mode', () => {
    const mockedRoute = createDashboardRouteMock({
      'GET /api/users': {
        kind: 'mock',
        response: {
          kind: 'error',
          status: 503,
          body: {
            message: 'Service unavailable',
          },
        },
      },
      'POST /api/login': {
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
    });

    expect(mockedRoute.endpoints).toEqual([
      {
        endpoint: 'GET /api/users',
        method: 'GET',
        url: '/api/users',
        mode: 'mock',
        response: {
          kind: 'error',
          status: 503,
          body: {
            message: 'Service unavailable',
          },
        },
      },
      {
        endpoint: 'POST /api/login',
        method: 'POST',
        url: '/api/login',
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
    ]);
  });

  it('should normalize unusedOrThrow endpoints with a diagnostic message', () => {
    const mockedRoute = createDashboardRouteMock({
      'GET /api/users': 'ignore',
      'POST /api/login': 'unusedOrThrow',
    });

    expect(mockedRoute.endpoints[0]).toEqual({
      endpoint: 'GET /api/users',
      method: 'GET',
      url: '/api/users',
      mode: 'ignore',
    });
    expect(mockedRoute.endpoints[1]).toMatchObject({
      endpoint: 'POST /api/login',
      method: 'POST',
      url: '/api/login',
      mode: 'unusedOrThrow',
    });
    expect(mockedRoute.endpoints[1]).toHaveProperty(
      'message',
      'Route HTTP endpoint "POST /api/login" for app "RouteHttpMockApp" route "dashboard" is marked as unusedOrThrow.',
    );
  });

  it('should allow empty mock sets for routes without declared httpDeps', () => {
    const mockedRoute = mockHttpRequestForRoute(
      'RouteHttpMockApp',
      'empty',
      {},
    );

    expect(mockedRoute).toEqual({
      app: 'RouteHttpMockApp',
      route: 'empty',
      endpoints: [],
    });
  });

  it('should expose typed route and endpoint helpers for registered apps', () => {
    expectTypeOf<RouteHttpMockAppHttpDeps['empty']>().toEqualTypeOf<{}>();
    expectTypeOf<DashboardHttpDeps['GET /api/users']>().toMatchTypeOf<
      CraftHttpRequest<'GET', '/api/users', User[]>
    >();
    expectTypeOf<ExtractCraftHttpRequestSuccess<LoginRequest>>().toEqualTypeOf<LoginResult>();
    expectTypeOf<PasswordRequiredException>().toMatchTypeOf<
      ReturnType<typeof passwordRequired>
    >();
    expectTypeOf<
      Extract<
        MockHttpRequestResponse<LoginRequest>,
        {
          kind: 'exception';
          code: 'PASSWORD_REQUIRED';
        }
      >
    >().toMatchTypeOf<{
      status: 400;
      body: {
        code: 'PASSWORD_REQUIRED';
        message: 'Password is required';
      };
    }>();
  });
});

describe('matchMockHttpRequestForRoute', () => {
  it('should resolve ignore and mock decisions for absolute URLs', () => {
    const mockedRoute = createDashboardRouteMock({
      'GET /api/users': 'ignore',
      'POST /api/login': {
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
    });

    expect(
      matchMockHttpRequestForRoute(mockedRoute, {
        method: 'get',
        url: 'https://example.com/api/users?page=1',
      }),
    ).toEqual({
      kind: 'ignore',
    });

    expect(
      matchMockHttpRequestForRoute(mockedRoute, {
        method: 'POST',
        url: 'https://example.com/api/login',
      }),
    ).toEqual({
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
    });
  });

  it('should report matched unusedOrThrow and unregistered requests', () => {
    const mockedRoute = createDashboardRouteMock({
      'GET /api/users': 'ignore',
      'POST /api/login': 'unusedOrThrow',
    });

    const matchedUnused = matchMockHttpRequestForRoute(mockedRoute, {
      method: 'post',
      url: 'https://example.com/api/login',
    });

    expect(matchedUnused).toEqual({
      kind: 'unusedOrThrow',
      message:
        'Route HTTP request "POST https://example.com/api/login" matched endpoint "POST /api/login" for app "RouteHttpMockApp" route "dashboard", but that endpoint is marked as unusedOrThrow.',
    });

    const unregistered = matchMockHttpRequestForRoute(mockedRoute, {
      method: 'DELETE',
      url: 'https://example.com/api/other',
    });

    expect(unregistered).toEqual({
      kind: 'unusedOrThrow',
      message:
        'Received unregistered route HTTP request "DELETE https://example.com/api/other" for app "RouteHttpMockApp" route "dashboard".',
    });

    expect(
      matchMockHttpRequestForRoute(
        mockedRoute,
        {
          method: 'DELETE',
          url: 'https://example.com/api/other',
        },
        {
          ignoreUnregisteredRequests: true,
        },
      ),
    ).toEqual({
      kind: 'ignore',
    });
  });

  it('should compare registered query strings strictly when they are part of the endpoint key', () => {
    const mockedRoute = {
      app: 'ManualApp',
      route: 'query',
      endpoints: [
        {
          endpoint: 'GET /api/users?page=1',
          method: 'GET',
          url: '/api/users?page=1',
          mode: 'mock',
          response: {
            kind: 'success',
            body: [{ id: '1' }],
          },
        },
      ],
    } as const satisfies MatchMockHttpRequestForRouteSource<{
      kind: 'success';
      body: User[];
    }>;

    expect(
      matchMockHttpRequestForRoute(mockedRoute, {
        method: 'GET',
        url: 'https://example.com/api/users?page=1',
      }),
    ).toEqual({
      kind: 'mock',
      response: {
        kind: 'success',
        body: [{ id: '1' }],
      },
    });

    expect(
      matchMockHttpRequestForRoute(mockedRoute, {
        method: 'GET',
        url: 'https://example.com/api/users?page=2',
      }),
    ).toEqual({
      kind: 'unusedOrThrow',
      message:
        'Received unregistered route HTTP request "GET https://example.com/api/users?page=2" for app "ManualApp" route "query".',
    });
  });
});

if (false) {
  const exhaustiveDashboardMocks = createDashboardRouteMock({
    'GET /api/users': 'ignore',
    'POST /api/login': 'unusedOrThrow',
  });

  expectTypeOf(exhaustiveDashboardMocks.route).toEqualTypeOf<'dashboard'>();

  createDashboardRouteMock({
    'GET /api/users': {
      kind: 'mock',
      response: [{ id: '1' }],
    },
    'POST /api/login': {
      kind: 'mock',
      response: {
        kind: 'success',
        body: {
          token: 'abc',
        },
        status: 201,
      },
    },
  });

  createDashboardRouteMock({
    'GET /api/users': {
      kind: 'mock',
      response: {
        kind: 'error',
        status: 500,
        body: {
          message: 'down',
        },
      },
    },
    'POST /api/login': 'ignore',
  });

  createDashboardRouteMock({
    'GET /api/users': 'ignore',
    'POST /api/login': {
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
  });

  createDashboardRouteMock({
    'GET /api/users': 'ignore',
    'POST /api/login': {
      kind: 'mock',
      response: {
        kind: 'exception',
        code: 'INVALID_PASSWORD_PAYLOAD',
        status: 422,
        body: {
          errors: [
            {
              field: 'password',
              message: 'Required',
            },
          ],
        },
      },
    },
  });

  createDashboardRouteMock({
    'GET /api/users': 'ignore',
    'POST /api/login': {
      kind: 'mock',
      response: {
        kind: 'exception',
        code: 'RATE_LIMITED',
        status: 429,
        body: {},
        headers: {
          'x-error-kind': 'rate-limit',
        },
      },
    },
  });

  createDashboardRouteMock({
    'GET /api/users': 'ignore',
    'POST /api/login': {
      kind: 'mock',
      response: {
        kind: 'exception',
        code: 'TEAPOT',
        status: 418,
        body: {
          code: 'TEAPOT',
          message: 'Short and stout',
          reason: 'brew',
        },
        headers: {
          'x-trace-id': 'trace-1',
        },
      },
    },
  });

  // @ts-expect-error route mocks must list every registered endpoint
  createDashboardRouteMock({
    'GET /api/users': 'ignore',
  });

  // @ts-expect-error unknown route paths should be rejected
  mockHttpRequestForRoute('RouteHttpMockApp', 'unknown', {});

  // @ts-expect-error unknown endpoints should be rejected
  createDashboardRouteMock({
    'GET /api/users': 'ignore',
    'POST /api/login': 'unusedOrThrow',
    'DELETE /api/users': 'ignore',
  });

  createDashboardRouteMock({
    'GET /api/users': 'ignore',
    'POST /api/login': {
      kind: 'mock',
      // @ts-expect-error matched status must stay aligned with the exception rule
      response: {
        kind: 'exception',
        code: 'PASSWORD_REQUIRED',
        status: 401,
        body: {
          code: 'PASSWORD_REQUIRED',
          message: 'Password is required',
        },
      },
    },
  });

  createDashboardRouteMock({
    'GET /api/users': 'ignore',
    'POST /api/login': {
      kind: 'mock',
      // @ts-expect-error matched code must be reflected in body.code
      response: {
        kind: 'exception',
        code: 'PASSWORD_REQUIRED',
        status: 400,
        body: {
          code: 'INVALID',
          message: 'Password is required',
        },
      },
    },
  });

  createDashboardRouteMock({
    'GET /api/users': 'ignore',
    'POST /api/login': {
      kind: 'mock',
      // @ts-expect-error matched content must be reflected in body.message
      response: {
        kind: 'exception',
        code: 'PASSWORD_REQUIRED',
        status: 400,
        body: {
          code: 'PASSWORD_REQUIRED',
          message: 'Another message',
        },
      },
    },
  });

  createDashboardRouteMock({
    'GET /api/users': 'ignore',
    'POST /api/login': {
      kind: 'mock',
      response: {
        kind: 'exception',
        code: 'INVALID_PASSWORD_PAYLOAD',
        status: 422,
        body: {
          // @ts-expect-error body<Body>() exceptions must provide the declared body shape
          message: 'missing errors',
        },
      },
    },
  });

  createDashboardRouteMock({
    'GET /api/users': 'ignore',
    'POST /api/login': {
      kind: 'mock',
      // @ts-expect-error matched headers must preserve their expected value
      response: {
        kind: 'exception',
        code: 'RATE_LIMITED',
        status: 429,
        body: {},
        headers: {
          'x-error-kind': 'retry-later',
        },
      },
    },
  });

  createDashboardRouteMock({
    'GET /api/users': 'ignore',
    'POST /api/login': {
      kind: 'mock',
      // @ts-expect-error read-mode header dependencies still require the header map
      response: {
        kind: 'exception',
        code: 'TEAPOT',
        status: 418,
        body: {
          code: 'TEAPOT',
          message: 'Short and stout',
          reason: 'brew',
        },
      },
    },
  });

  createDashboardRouteMock({
    'GET /api/users': 'ignore',
    'POST /api/login': {
      kind: 'mock',
      // @ts-expect-error read-mode body dependencies must keep their declared fields
      response: {
        kind: 'exception',
        code: 'TEAPOT',
        status: 418,
        body: {
          code: 'TEAPOT',
          message: 'Short and stout',
        },
        headers: {
          'x-trace-id': 'trace-1',
        },
      },
    },
  });
}

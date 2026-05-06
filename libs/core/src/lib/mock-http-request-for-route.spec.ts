import '@angular/compiler';
import { Type } from '@angular/core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { GetDeps } from './branded-component/branded-component';
import { CraftHttpClient, type CraftHttpRequest } from './craft-http-client';
import { craftException } from './craft-exception';
import { craftRoutes } from './craft-routes';
import { craftService, type GetInjectedServiceDependencies } from './craft-service';
import {
  mockHttpRequestForRoute,
  type ExtractCraftHttpRequestCustomException,
  type ExtractCraftHttpRequestSuccess,
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
type PasswordRequiredException = Extract<
  ExtractCraftHttpRequestCustomException<LoginRequest>,
  { code: 'PASSWORD_REQUIRED' }
>;

declare module './mock-http-request-for-route' {
  interface CraftRouteHttpDepsRegistry {
    RouteHttpMockApp: RouteHttpMockAppHttpDeps;
  }
}

describe('mockHttpRequestForRoute', () => {
  it('should normalize success shorthand mocks into handlers', () => {
    const mockedRoute = mockHttpRequestForRoute(
      'RouteHttpMockApp',
      'dashboard',
      {
        'GET /api/users': [{ id: '1' }],
      },
    );

    expect(mockedRoute).toEqual({
      app: 'RouteHttpMockApp',
      route: 'dashboard',
      handlers: [
        {
          endpoint: 'GET /api/users',
          method: 'GET',
          url: '/api/users',
          response: {
            kind: 'success',
            body: [{ id: '1' }],
          },
        },
      ],
    });
  });

  it('should preserve explicit error and exception responses while parsing endpoint keys', () => {
    const mockedRoute = mockHttpRequestForRoute(
      'RouteHttpMockApp',
      'dashboard',
      {
        'GET /api/users': {
          kind: 'error',
          status: 503,
          body: {
            message: 'Service unavailable',
          },
        },
        'POST /api/login': {
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

    expect(mockedRoute.handlers).toEqual([
      {
        endpoint: 'GET /api/users',
        method: 'GET',
        url: '/api/users',
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

  it('should allow empty mock sets for routes without declared httpDeps', () => {
    const mockedRoute = mockHttpRequestForRoute(
      'RouteHttpMockApp',
      'empty',
      {},
    );

    expect(mockedRoute).toEqual({
      app: 'RouteHttpMockApp',
      route: 'empty',
      handlers: [],
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

if (false) {
  const partialDashboardMocks = mockHttpRequestForRoute(
    'RouteHttpMockApp',
    'dashboard',
    {
      'GET /api/users': [{ id: '1' }],
    },
  );

  expectTypeOf(partialDashboardMocks.route).toEqualTypeOf<'dashboard'>();

  mockHttpRequestForRoute('RouteHttpMockApp', 'dashboard', {
    'POST /api/login': {
      kind: 'success',
      body: {
        token: 'abc',
      },
      status: 201,
    },
  });

  mockHttpRequestForRoute('RouteHttpMockApp', 'dashboard', {
    'GET /api/users': {
      kind: 'error',
      status: 500,
      body: {
        message: 'down',
      },
    },
  });

  mockHttpRequestForRoute('RouteHttpMockApp', 'dashboard', {
    'POST /api/login': {
      kind: 'exception',
      code: 'PASSWORD_REQUIRED',
      status: 400,
      body: {
        code: 'PASSWORD_REQUIRED',
        message: 'Password is required',
      },
    },
  });

  mockHttpRequestForRoute('RouteHttpMockApp', 'dashboard', {
    'POST /api/login': {
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
  });

  mockHttpRequestForRoute('RouteHttpMockApp', 'dashboard', {
    'POST /api/login': {
      kind: 'exception',
      code: 'RATE_LIMITED',
      status: 429,
      body: {},
      headers: {
        'x-error-kind': 'rate-limit',
      },
    },
  });

  mockHttpRequestForRoute('RouteHttpMockApp', 'dashboard', {
    'POST /api/login': {
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
  });

  // @ts-expect-error unknown route paths should be rejected
  mockHttpRequestForRoute('RouteHttpMockApp', 'unknown', {});

  mockHttpRequestForRoute('RouteHttpMockApp', 'dashboard', {
    // @ts-expect-error unknown endpoints should be rejected
    'DELETE /api/users': {
      kind: 'error',
      status: 500,
    },
  });

  mockHttpRequestForRoute('RouteHttpMockApp', 'dashboard', {
    // @ts-expect-error matched status must stay aligned with the exception rule
    'POST /api/login': {
      kind: 'exception',
      code: 'PASSWORD_REQUIRED',
      status: 401,
      body: {
        code: 'PASSWORD_REQUIRED',
        message: 'Password is required',
      },
    },
  });

  mockHttpRequestForRoute('RouteHttpMockApp', 'dashboard', {
    // @ts-expect-error matched code must be reflected in body.code
    'POST /api/login': {
      kind: 'exception',
      code: 'PASSWORD_REQUIRED',
      status: 400,
      body: {
        code: 'INVALID',
        message: 'Password is required',
      },
    },
  });

  mockHttpRequestForRoute('RouteHttpMockApp', 'dashboard', {
    // @ts-expect-error matched content must be reflected in body.message
    'POST /api/login': {
      kind: 'exception',
      code: 'PASSWORD_REQUIRED',
      status: 400,
      body: {
        code: 'PASSWORD_REQUIRED',
        message: 'Another message',
      },
    },
  });

  mockHttpRequestForRoute('RouteHttpMockApp', 'dashboard', {
    'POST /api/login': {
      kind: 'exception',
      code: 'INVALID_PASSWORD_PAYLOAD',
      status: 422,
      body: {
        // @ts-expect-error body<Body>() exceptions must provide the declared body shape
        message: 'missing errors',
      },
    },
  });

  mockHttpRequestForRoute('RouteHttpMockApp', 'dashboard', {
    // @ts-expect-error matched headers must preserve their expected value
    'POST /api/login': {
      kind: 'exception',
      code: 'RATE_LIMITED',
      status: 429,
      body: {},
      headers: {
        'x-error-kind': 'retry-later',
      },
    },
  });

  mockHttpRequestForRoute('RouteHttpMockApp', 'dashboard', {
    // @ts-expect-error read-mode header dependencies still require the header map
    'POST /api/login': {
      kind: 'exception',
      code: 'TEAPOT',
      status: 418,
      body: {
        code: 'TEAPOT',
        message: 'Short and stout',
        reason: 'brew',
      },
    },
  });

  mockHttpRequestForRoute('RouteHttpMockApp', 'dashboard', {
    // @ts-expect-error read-mode body dependencies must keep their declared fields
    'POST /api/login': {
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
  });
}

import '@angular/compiler';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { vi } from 'vitest';
import {
  CraftHttpClient,
  type CraftHttpClientError,
  type CraftHttpRequest,
} from './craft-http-client';
import { craftException, isCraftException } from './craft-exception';
import {
  craftService,
  type GetInjectedServiceDependencies,
  type GetServiceOutput,
} from './craft-service';
import { mock, setupCraftServiceTest } from './setup-craft-service-test';

beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes(
        'Cannot set base providers because it has already been called',
      )
    ) {
      throw error;
    }
  }
});

describe('CraftHttpClient', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    vi.restoreAllMocks();
  });

  it('should reject the previous explicit generic overload', () => {
    if (false) {
      type User = { id: string };

      craftService({ name: 'InvalidHttpApi', scope: 'global' }, function* () {
        // @ts-expect-error CraftHttpClient now requires a declarative builder callback
        const invalidGet = yield* CraftHttpClient.get<User[]>();

        return {
          invalidGet,
        };
      });
    }
  });

  it('should return a promise of the success type for GET requests with fixed params', async () => {
    type User = { id: string; email: string };

    const { injectUsersApi } = craftService(
      { name: 'UsersApi', scope: 'global' },
      function* () {
        const getUsers = yield* CraftHttpClient.get(({ response }) => ({
          url: '/api/users',
          params: {
            page: 1,
            search: 'john',
          },
          success: response<User[]>(),
        }));

        return {
          getUsers,
        };
      },
    );

    type UsersApi = GetServiceOutput<typeof injectUsersApi>;
    type GetUsersResult = Awaited<ReturnType<UsersApi['getUsers']>>;

    expectTypeOf<GetUsersResult>().toEqualTypeOf<
      User[] | CraftHttpClientError
    >();

    const httpTesting = TestBed.inject(HttpTestingController);

    await TestBed.runInInjectionContext(async () => {
      const usersApi = injectUsersApi();
      const resultPromise = usersApi.getUsers();

      const request = httpTesting.expectOne(
        (pendingRequest) =>
          pendingRequest.url === '/api/users' &&
          pendingRequest.params.get('page') === '1' &&
          pendingRequest.params.get('search') === 'john',
      );
      expect(request.request.method).toBe('GET');
      request.flush([
        {
          id: '1',
          email: 'john@doe.com',
        },
      ] satisfies User[]);

      await expect(resultPromise).resolves.toEqual([
        {
          id: '1',
          email: 'john@doe.com',
        },
      ]);
    });

    httpTesting.verify();
  });

  it('should map HttpClient failures to a custom craftException when declared', async () => {
    type User = { id: string; email: string };
    const usersNotFound = () =>
      craftException(
        {
          code: 'USERS_NOT_FOUND',
          scope: 'UsersApi',
        },
        {
          reason: 'missing',
        },
      );
    type UsersNotFound = ReturnType<typeof usersNotFound>;

    const { injectUsersApiOnCustomError } = craftService(
      { name: 'UsersApiOnCustomError', scope: 'global' },
      function* () {
        const getUsers = yield* CraftHttpClient.get(({ response }) => ({
          url: '/api/users',
          success: response<User[]>(),
          exceptions: (error) =>
            error.status === 404 ? usersNotFound() : undefined,
        }));

        return {
          getUsers,
        };
      },
    );

    type UsersApi = GetServiceOutput<typeof injectUsersApiOnCustomError>;
    type GetUsersResult = Awaited<ReturnType<UsersApi['getUsers']>>;

    expectTypeOf<GetUsersResult>().toEqualTypeOf<
      User[] | UsersNotFound | CraftHttpClientError
    >();

    const httpTesting = TestBed.inject(HttpTestingController);

    await TestBed.runInInjectionContext(async () => {
      const usersApi = injectUsersApiOnCustomError();
      const resultPromise = usersApi.getUsers();

      const request = httpTesting.expectOne('/api/users');
      expect(request.request.method).toBe('GET');
      request.flush(
        {
          message: 'missing',
        },
        {
          status: 404,
          statusText: 'Not Found',
        },
      );

      await expect(resultPromise).resolves.toEqual(usersNotFound());
    });

    httpTesting.verify();
  });

  it('should convert unmapped HttpClient failures to CraftHttpClientError', async () => {
    type User = { id: string; email: string };

    const { injectUsersApiOnError } = craftService(
      { name: 'UsersApiOnError', scope: 'global' },
      function* () {
        const getUsers = yield* CraftHttpClient.get(({ response }) => ({
          url: '/api/users',
          success: response<User[]>(),
          exceptions: () => undefined,
        }));

        return {
          getUsers,
        };
      },
    );

    const httpTesting = TestBed.inject(HttpTestingController);

    await TestBed.runInInjectionContext(async () => {
      const usersApi = injectUsersApiOnError();
      const resultPromise = usersApi.getUsers();

      const request = httpTesting.expectOne('/api/users');
      expect(request.request.method).toBe('GET');
      request.flush(
        {
          message: 'boom',
        },
        {
          status: 500,
          statusText: 'Server Error',
        },
      );

      const result = await resultPromise;

      expect(isCraftException(result)).toBe(true);

      if (!isCraftException(result)) {
        throw new Error('Expected CraftHttpClient to return a craftException');
      }

      const httpError = result as CraftHttpClientError;

      expect(httpError.code).toBe('HttpError');
      expect(httpError.scope).toBe('HttpClient');
      expect(httpError.identifier).toBe('GET /api/users');
      expect(httpError.payload.method).toBe('GET');
      expect(httpError.payload.url).toBe('/api/users');
      expect(httpError.payload.error).toBeInstanceOf(HttpErrorResponse);
      expect(httpError.payload.error.status).toBe(500);
      expect(httpError.payload.error.statusText).toBe('Server Error');
    });

    httpTesting.verify();
  });

  it('should return a promise of the success type for POST requests with a fixed payload', async () => {
    type User = { id: string; email: string };

    const { injectUsersApiPost } = craftService(
      { name: 'UsersApiPost', scope: 'global' },
      function* () {
        const createUser = yield* CraftHttpClient.post(({ response }) => ({
          url: '/api/users',
          payload: {
            email: 'john@doe.com',
          },
          success: response<User>(),
        }));

        return {
          createUser,
        };
      },
    );

    const httpTesting = TestBed.inject(HttpTestingController);

    await TestBed.runInInjectionContext(async () => {
      const usersApi = injectUsersApiPost();
      const resultPromise = usersApi.createUser();

      const request = httpTesting.expectOne('/api/users');
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({
        email: 'john@doe.com',
      });
      request.flush({
        id: '1',
        email: 'john@doe.com',
      } satisfies User);

      await expect(resultPromise).resolves.toEqual({
        id: '1',
        email: 'john@doe.com',
      });
    });

    httpTesting.verify();
  });

  it('should expose the full request contract through the CraftHttpClient dependency typing', () => {
    if (false) {
      type User = { id: string; email: string };
      const fixedParams = { page: 1 } as const;
      const usersNotFound = () =>
        craftException(
          {
            code: 'USERS_NOT_FOUND',
            scope: 'UsersApi',
          },
          {
            reason: 'missing',
          },
        );
      type UsersNotFound = ReturnType<typeof usersNotFound>;

      const { injectUsersFeature } = craftService(
        { name: 'UsersFeature', scope: 'global' },
        function* () {
          const getUsers = yield* CraftHttpClient.get(({ response }) => ({
            url: '/api/users',
            params: fixedParams,
            success: response<User[]>(),
            exceptions: (error) =>
              error.status === 404 ? usersNotFound() : undefined,
          }));

          return {
            getUsers,
          };
        },
      );

      type UsersFeatureDependencies = GetInjectedServiceDependencies<
        typeof injectUsersFeature
      >;
      type HttpDependency =
        UsersFeatureDependencies['dependencies']['CraftHttpClient'];
      type TrackedRequest = HttpDependency['derivedPropertiesUsed']['$self'];

      expectTypeOf<HttpDependency['scope']>().toEqualTypeOf<'global'>();
      expectTypeOf<HttpDependency['browserBoundary']>().toEqualTypeOf<false>();
      expectTypeOf<HttpDependency['dependencies']>().toEqualTypeOf<{}>();
      expectTypeOf<TrackedRequest>().toEqualTypeOf<
        CraftHttpRequest<
          'GET',
          '/api/users',
          User[],
          typeof fixedParams,
          undefined,
          UsersNotFound
        >
      >();
      expectTypeOf<TrackedRequest['method']>().toEqualTypeOf<'GET'>();
      expectTypeOf<TrackedRequest['url']>().toEqualTypeOf<'/api/users'>();
      expectTypeOf<TrackedRequest['params']>().toEqualTypeOf<
        typeof fixedParams
      >();
      expectTypeOf<TrackedRequest['payload']>().toEqualTypeOf<undefined>();
      expectTypeOf<
        Awaited<ReturnType<TrackedRequest>>
      >().toEqualTypeOf<User[] | UsersNotFound | CraftHttpClientError>();
      expectTypeOf<
        HttpDependency['derivedPropertiesExposed']['$self']
      >().toEqualTypeOf<TrackedRequest>();
    }
  });

  it('should allow mocking CraftHttpClient through a minimal $self override', async () => {
    type User = { id: string; email: string };

    const { injectUsersFeatureForMocks: UsersFeature } = craftService(
      { name: 'UsersFeatureForMocks', scope: 'global' },
      function* () {
        const getUsers = yield* CraftHttpClient.get(({ response }) => ({
          url: '/api/users',
          success: response<User[]>(),
        }));

        return {
          load: () => getUsers(),
        };
      },
    );

    const requestMock = vi.fn<() => Promise<User[] | CraftHttpClientError>>(
      () =>
        Promise.resolve([
          {
            id: '1',
            email: 'john@doe.com',
          },
        ] satisfies User[]),
    );

    const { sut, mocks } = setupCraftServiceTest(UsersFeature, {
      CraftHttpClient: mock({
        $self: requestMock,
      }),
    });

    await expect(sut.load()).resolves.toEqual([
      {
        id: '1',
        email: 'john@doe.com',
      },
    ]);
    expect(requestMock).toHaveBeenCalledTimes(1);
    expectTypeOf<
      Awaited<ReturnType<typeof mocks.CraftHttpClient>>
    >().toEqualTypeOf<User[] | CraftHttpClientError>();
  });
});

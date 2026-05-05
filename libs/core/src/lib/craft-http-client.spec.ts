import '@angular/compiler';
import {
  HttpErrorResponse,
  HttpHeaders,
  provideHttpClient,
} from '@angular/common/http';
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
  type CraftHttpClientBodyExceptionDependency,
  type CraftHttpClientError,
  type ExtractCraftHttpClientExceptionBodyType,
  type ExtractCraftHttpClientExceptionDependencies,
  type CraftHttpRequest,
  getCraftHttpRequestExceptionDependencies,
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
          exceptions: [
            function* ({ status }) {
              if (!(yield* status(404))) {
                return;
              }

              return usersNotFound();
            },
          ],
        }));

        return {
          getUsers,
        };
      },
    );

    type UsersApi = GetServiceOutput<typeof injectUsersApiOnCustomError>;
    type GetUsersResult = Awaited<ReturnType<UsersApi['getUsers']>>;
    type UsersNotFoundFromHttpResult = Extract<
      GetUsersResult,
      { code: 'USERS_NOT_FOUND' }
    >;

    expectTypeOf<
      Exclude<GetUsersResult, UsersNotFoundFromHttpResult>
    >().toEqualTypeOf<User[] | CraftHttpClientError>();
    expectTypeOf<UsersNotFoundFromHttpResult>().toMatchTypeOf<UsersNotFound>();
    expectTypeOf<
      ExtractCraftHttpClientExceptionDependencies<UsersNotFoundFromHttpResult>
    >().toEqualTypeOf<{
      source: 'status';
      mode: 'match';
      expected: 404;
    }>();

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
          exceptions: [
            function* ({ status }) {
              yield* status(404);
              return;
            },
          ],
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

  it('should support composed status, code and content matchers', async () => {
    type LoginResult = { token: string };
    const passwordRequired = () =>
      craftException(
        {
          code: 'PASSWORD_REQUIRED',
          scope: 'AuthApi',
        },
        {
          field: 'password',
        },
      );
    type PasswordRequired = ReturnType<typeof passwordRequired>;

    const { injectAuthApi } = craftService(
      { name: 'AuthApi', scope: 'global' },
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
          ],
        }));

        return {
          login,
        };
      },
    );

    type AuthApi = GetServiceOutput<typeof injectAuthApi>;
    type LoginResultUnion = Awaited<ReturnType<AuthApi['login']>>;
    type PasswordRequiredFromHttpResult = Extract<
      LoginResultUnion,
      { code: 'PASSWORD_REQUIRED' }
    >;

    expectTypeOf<
      Exclude<LoginResultUnion, PasswordRequiredFromHttpResult>
    >().toEqualTypeOf<LoginResult | CraftHttpClientError>();
    expectTypeOf<PasswordRequiredFromHttpResult>().toMatchTypeOf<PasswordRequired>();
    expectTypeOf<
      ExtractCraftHttpClientExceptionDependencies<PasswordRequiredFromHttpResult>
    >().toEqualTypeOf<
      | {
          source: 'status';
          mode: 'match';
          expected: 400;
        }
      | {
          source: 'code';
          mode: 'match';
          expected: 'PASSWORD_REQUIRED';
        }
      | {
          source: 'content';
          mode: 'match';
          expected: 'Password is required';
        }
    >();

    const httpTesting = TestBed.inject(HttpTestingController);

    await TestBed.runInInjectionContext(async () => {
      const authApi = injectAuthApi();
      const resultPromise = authApi.login();

      const request = httpTesting.expectOne('/api/login');
      expect(request.request.method).toBe('POST');
      request.flush(
        {
          code: 'PASSWORD_REQUIRED',
          message: 'Password is required',
        },
        {
          status: 400,
          statusText: 'Bad Request',
        },
      );

      await expect(resultPromise).resolves.toEqual(passwordRequired());
    });

    httpTesting.verify();
  });

  it('should support body-based exception rules for non standard payloads', async () => {
    type LoginResult = { token: string };
    const invalidPasswordPayload = () =>
      craftException(
        {
          code: 'INVALID_PASSWORD_PAYLOAD',
          scope: 'AuthApi',
        },
        {
          field: 'password',
        },
      );

    const { injectAuthApiOnBodyRule } = craftService(
      { name: 'AuthApiOnBodyRule', scope: 'global' },
      function* () {
        const login = yield* CraftHttpClient.post(({ response }) => ({
          url: '/api/login',
          payload: {
            email: 'john@doe.com',
          },
          success: response<LoginResult>(),
          exceptions: [
            function* ({ body }) {
              const payload = yield* body<{
                errors?: Array<{ field: string; message: string }>;
              }>();

              if (
                !payload.errors?.some((error) => error.field === 'password')
              ) {
                return;
              }

              return invalidPasswordPayload();
            },
          ],
        }));

        return {
          login,
        };
      },
    );

    const httpTesting = TestBed.inject(HttpTestingController);

    await TestBed.runInInjectionContext(async () => {
      const authApi = injectAuthApiOnBodyRule();
      const resultPromise = authApi.login();

      const request = httpTesting.expectOne('/api/login');
      request.flush(
        {
          errors: [
            {
              field: 'password',
              message: 'required',
            },
          ],
        },
        {
          status: 422,
          statusText: 'Unprocessable Entity',
        },
      );

      await expect(resultPromise).resolves.toEqual(invalidPasswordPayload());
    });

    httpTesting.verify();
  });

  it('should support header-based exception rules', async () => {
    type LoginResult = { token: string };
    const rateLimited = () =>
      craftException({
        code: 'RATE_LIMITED',
        scope: 'AuthApi',
      });

    const { injectAuthApiOnHeaderRule } = craftService(
      { name: 'AuthApiOnHeaderRule', scope: 'global' },
      function* () {
        const login = yield* CraftHttpClient.post(({ response }) => ({
          url: '/api/login',
          payload: {
            email: 'john@doe.com',
          },
          success: response<LoginResult>(),
          exceptions: [
            function* ({ status, header }) {
              if (!(yield* status(429))) {
                return;
              }

              if (!(yield* header('x-error-kind', 'rate-limit'))) {
                return;
              }

              return rateLimited();
            },
          ],
        }));

        return {
          login,
        };
      },
    );

    const httpTesting = TestBed.inject(HttpTestingController);

    await TestBed.runInInjectionContext(async () => {
      const authApi = injectAuthApiOnHeaderRule();
      const resultPromise = authApi.login();

      const request = httpTesting.expectOne('/api/login');
      request.flush(
        {
          message: 'Too many requests',
        },
        {
          status: 429,
          statusText: 'Too Many Requests',
          headers: new HttpHeaders({
            'x-error-kind': 'rate-limit',
          }),
        },
      );

      await expect(resultPromise).resolves.toEqual(rateLimited());
    });

    httpTesting.verify();
  });

  it('should return the first matching exception rule', async () => {
    type LoginResult = { token: string };
    const genericBadRequest = () =>
      craftException({
        code: 'GENERIC_BAD_REQUEST',
        scope: 'AuthApi',
      });
    const passwordRequired = () =>
      craftException({
        code: 'PASSWORD_REQUIRED',
        scope: 'AuthApi',
      });

    const { injectAuthApiOnRulePriority } = craftService(
      { name: 'AuthApiOnRulePriority', scope: 'global' },
      function* () {
        const login = yield* CraftHttpClient.post(({ response }) => ({
          url: '/api/login',
          payload: {
            email: 'john@doe.com',
          },
          success: response<LoginResult>(),
          exceptions: [
            function* ({ status }) {
              if (!(yield* status(400))) {
                return;
              }

              return genericBadRequest();
            },
            function* ({ status, code }) {
              if (!(yield* status(400))) {
                return;
              }

              if (!(yield* code('PASSWORD_REQUIRED'))) {
                return;
              }

              return passwordRequired();
            },
          ],
        }));

        return {
          login,
        };
      },
    );

    const httpTesting = TestBed.inject(HttpTestingController);

    await TestBed.runInInjectionContext(async () => {
      const authApi = injectAuthApiOnRulePriority();
      const resultPromise = authApi.login();

      const request = httpTesting.expectOne('/api/login');
      request.flush(
        {
          code: 'PASSWORD_REQUIRED',
          message: 'Password is required',
        },
        {
          status: 400,
          statusText: 'Bad Request',
        },
      );

      await expect(resultPromise).resolves.toEqual(genericBadRequest());
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
            exceptions: [
              function* ({ status }) {
                if (!(yield* status(404))) {
                  return;
                }

                return usersNotFound();
              },
            ],
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
      type TrackedRequestResult = Awaited<ReturnType<TrackedRequest>>;
      type TrackedUsersNotFound = Extract<
        TrackedRequestResult,
        { code: 'USERS_NOT_FOUND' }
      >;

      expectTypeOf<HttpDependency['scope']>().toEqualTypeOf<'global'>();
      expectTypeOf<HttpDependency['browserBoundary']>().toEqualTypeOf<false>();
      expectTypeOf<HttpDependency['dependencies']>().toEqualTypeOf<{}>();
      expectTypeOf<TrackedRequest['method']>().toEqualTypeOf<'GET'>();
      expectTypeOf<TrackedRequest['url']>().toEqualTypeOf<'/api/users'>();
      expectTypeOf<TrackedRequest['params']>().toEqualTypeOf<
        typeof fixedParams
      >();
      expectTypeOf<TrackedRequest['payload']>().toEqualTypeOf<undefined>();
      expectTypeOf<
        Exclude<TrackedRequestResult, TrackedUsersNotFound>
      >().toEqualTypeOf<User[] | CraftHttpClientError>();
      expectTypeOf<TrackedUsersNotFound>().toMatchTypeOf<UsersNotFound>();
      expectTypeOf<
        ExtractCraftHttpClientExceptionDependencies<TrackedUsersNotFound>
      >().toEqualTypeOf<{
        source: 'status';
        mode: 'match';
        expected: 404;
      }>();
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

  it('should expose exception dependencies metadata for each rule', () => {
    type User = { id: string; email: string };

    const { injectUsersFeatureForDependencies } = craftService(
      { name: 'UsersFeatureForDependencies', scope: 'global' },
      function* () {
        const getUsers = yield* CraftHttpClient.get(({ response }) => ({
          url: '/api/users',
          success: response<User[]>(),
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

              return craftException({
                code: 'PASSWORD_REQUIRED',
                scope: 'UsersFeatureForDependencies',
              });
            },
            function* ({ body, header }) {
              const payload = yield* body<{
                errors?: Array<{ field: 'password' }>;
              }>();

              if (
                !payload.errors?.some((error) => error.field === 'password')
              ) {
                return;
              }

              if (!(yield* header('x-error-kind', 'validation'))) {
                return;
              }

              return craftException({
                code: 'VALIDATION_HEADER_ERROR',
                scope: 'UsersFeatureForDependencies',
              });
            },
          ],
        }));

        return {
          getUsers,
        };
      },
    );

    type UsersFeatureForDependencies = GetServiceOutput<
      typeof injectUsersFeatureForDependencies
    >;
    type GetUsersDependenciesResult = Awaited<
      ReturnType<UsersFeatureForDependencies['getUsers']>
    >;
    type ValidationHeaderException = Extract<
      GetUsersDependenciesResult,
      { code: 'VALIDATION_HEADER_ERROR' }
    >;

    expectTypeOf<
      ExtractCraftHttpClientExceptionBodyType<ValidationHeaderException>
    >().toEqualTypeOf<{
      errors?: Array<{ field: 'password' }>;
    }>();

    expectTypeOf<
      ExtractCraftHttpClientExceptionDependencies<ValidationHeaderException>
    >().toEqualTypeOf<
      | CraftHttpClientBodyExceptionDependency<{
          errors?: Array<{ field: 'password' }>;
        }>
      | {
          source: 'header';
          mode: 'match';
          name: 'x-error-kind';
          expected: 'validation';
        }
    >();

    TestBed.runInInjectionContext(() => {
      const usersFeature = injectUsersFeatureForDependencies();

      expect(
        getCraftHttpRequestExceptionDependencies(usersFeature.getUsers),
      ).toEqual([
        {
          ruleIndex: 0,
          dependencies: [
            {
              source: 'status',
              mode: 'match',
              expected: 400,
            },
            {
              source: 'code',
              mode: 'match',
              expected: 'PASSWORD_REQUIRED',
            },
            {
              source: 'content',
              mode: 'match',
              expected: 'Password is required',
            },
          ],
        },
        {
          ruleIndex: 1,
          dependencies: [
            {
              source: 'body',
              mode: 'read',
            },
            {
              source: 'header',
              mode: 'match',
              name: 'x-error-kind',
              expected: 'validation',
            },
          ],
        },
      ]);
    });
  });
});

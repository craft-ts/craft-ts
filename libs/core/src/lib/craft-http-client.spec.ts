import { TestBed } from './host/craft-test-bed';
import { craftUse } from './craft-use';
import { vi } from 'vitest';
import {
  CraftHttpClient,
  response,
  type CraftHttpClientBodyExceptionDependency,
  type CraftHttpClientError,
  type ExtractCraftHttpClientExceptionBodyType,
  type ExtractCraftHttpClientExceptionDependencies,
  type CraftHttpRequest,
  type HttpResponseDecodeError,
  getCraftHttpRequestExceptionDependencies,
} from './craft-http-client';
import { craftException, isCraftException } from './craft-exception';
import {
  craftService,
  type GetServiceDependencies,
  type GetServiceOutput,
} from './craft-service';
import { mock, setupCraftServiceTest } from './setup-craft-service-test';

type PendingFetchRequest = {
  input: string;
  init: RequestInit;
  resolve: (response: Response) => void;
  settled: boolean;
};

class FetchTestingController {
  readonly pending: PendingFetchRequest[] = [];
  readonly fetch = vi.fn(
    (input: string | URL | Request, init: RequestInit = {}) =>
      new Promise<Response>((resolve) => {
        this.pending.push({
          input: String(input),
          init,
          resolve,
          settled: false,
        });
      }),
  );

  expectOne(
    matcher:
      | string
      | ((request: { url: string; params: URLSearchParams }) => boolean),
  ) {
    const pending = this.pending.find((request) => {
      if (request.settled) {
        return false;
      }

      const [urlWithQuery] = request.input.split('#');
      const [url, query = ''] = urlWithQuery.split('?');
      return typeof matcher === 'string'
        ? url === matcher
        : matcher({ url, params: new URLSearchParams(query) });
    });

    if (!pending) {
      throw new Error('Expected one matching fetch request');
    }

    return {
      request: {
        method: pending.init.method ?? 'GET',
        body:
          typeof pending.init.body === 'string'
            ? JSON.parse(pending.init.body)
            : pending.init.body,
      },
      flush: (
        body: unknown,
        init: {
          status?: number;
          statusText?: string;
          headers?: HeadersInit;
        } = {},
      ) => {
        pending.settled = true;
        pending.resolve(
          new Response(JSON.stringify(body), {
            status: init.status ?? 200,
            statusText: init.statusText,
            headers: init.headers,
          }),
        );
      },
    };
  }

  verify() {
    expect(this.pending.filter((request) => !request.settled)).toEqual([]);
  }
}

let fetchTesting: FetchTestingController;

describe('CraftHttpClient', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    vi.restoreAllMocks();
    fetchTesting = new FetchTestingController();
    vi.stubGlobal('fetch', fetchTesting.fetch);
  });

  afterEach(() => vi.unstubAllGlobals());

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

    const { UsersApi } = craftService(
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

    type UsersApi = GetServiceOutput<typeof UsersApi>;
    type GetUsersResult = Awaited<ReturnType<UsersApi['getUsers']>>;

    expectTypeOf<GetUsersResult>().toEqualTypeOf<
      User[] | CraftHttpClientError
    >();

    await TestBed.runInInjectionContext(async () => {
      const usersApi = craftUse(UsersApi());
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: '1',
              email: 'john@doe.com',
            },
          ] satisfies User[]),
          { status: 200 },
        ),
      );

      const resultPromise = usersApi.getUsers();

      expect(fetch).toHaveBeenCalledWith(
        '/api/users?page=1&search=john',
        expect.objectContaining({ method: 'GET' }),
      );

      await expect(resultPromise).resolves.toEqual([
        {
          id: '1',
          email: 'john@doe.com',
        },
      ]);
    });
  });

  it('should decode successful HTTP responses at runtime and infer the decoded type', async () => {
    type User = { id: string; email: string };
    const decoder = {
      decode: (input: unknown): User => {
        if (
          !input ||
          typeof input !== 'object' ||
          typeof (input as { id?: unknown }).id !== 'string' ||
          typeof (input as { email?: unknown }).email !== 'string'
        ) {
          throw new Error('Invalid user');
        }

        return input as User;
      },
    };

    const { UsersDecodedApi } = craftService(
      { name: 'UsersDecodedApi', scope: 'global' },
      function* () {
        const getUser = yield* CraftHttpClient.get(() => ({
          url: '/api/user',
          success: response(decoder),
        }));

        return { getUser };
      },
    );

    type UsersApi = GetServiceOutput<typeof UsersDecodedApi>;
    type GetUserResult = Awaited<ReturnType<UsersApi['getUser']>>;
    expectTypeOf<GetUserResult>().toEqualTypeOf<
      User | HttpResponseDecodeError | CraftHttpClientError
    >();

    const httpTesting = fetchTesting;
    await TestBed.runInInjectionContext(async () => {
      const usersApi = craftUse(UsersDecodedApi());
      const resultPromise = usersApi.getUser();
      const request = httpTesting.expectOne('/api/user');
      request.flush({ id: '1', email: 'john@doe.com' });
      await expect(resultPromise).resolves.toEqual({
        id: '1',
        email: 'john@doe.com',
      });
    });
    httpTesting.verify();
  });

  it('should turn an invalid decoded response into HttpResponseDecodeError', async () => {
    const nativeError = new Error('Invalid user');
    const decoder = {
      decode: () => {
        throw nativeError;
      },
    };

    const { InvalidDecodedApi } = craftService(
      { name: 'InvalidDecodedApi', scope: 'global' },
      function* () {
        const getUser = yield* CraftHttpClient.get(() => ({
          url: '/api/user',
          success: response(decoder),
        }));

        return { getUser };
      },
    );

    const httpTesting = fetchTesting;
    await TestBed.runInInjectionContext(async () => {
      const api = craftUse(InvalidDecodedApi());
      const resultPromise = api.getUser();
      const request = httpTesting.expectOne('/api/user');
      const rawResponse = { id: 1 };
      request.flush(rawResponse);

      const result = await resultPromise;
      expect(isCraftException(result)).toBe(true);
      if (!isCraftException(result)) {
        throw new Error('Expected a decode exception');
      }
      expect(result._tag).toBe('HttpResponseDecodeError');
      expect(result.payload).toEqual({
        method: 'GET',
        url: '/api/user',
        response: rawResponse,
        error: nativeError,
      });
    });
    httpTesting.verify();
  });

  it('should support asynchronous HTTP decoders', async () => {
    const { AsyncDecodedApi } = craftService(
      { name: 'AsyncDecodedApi', scope: 'global' },
      function* () {
        const getValue = yield* CraftHttpClient.get(() => ({
          url: '/api/value',
          success: response({
            decode: async (input: unknown) => ({
              value: (input as { value: number }).value,
            }),
          }),
        }));

        return { getValue };
      },
    );

    const httpTesting = fetchTesting;
    await TestBed.runInInjectionContext(async () => {
      const api = craftUse(AsyncDecodedApi());
      const resultPromise = api.getValue();
      const request = httpTesting.expectOne('/api/value');
      request.flush({ value: 3 });
      await expect(resultPromise).resolves.toEqual({ value: 3 });
    });
    httpTesting.verify();
  });

  it('should normalize a flat params object before sending the request', async () => {
    type User = { id: string; email: string };

    const { UsersFilterApi } = craftService(
      { name: 'UsersFilterApi', scope: 'global' },
      function* () {
        const getUsers = yield* CraftHttpClient.get(({ response }) => ({
          url: '/api/users',
          params: {
            search: 'john',
            page: 2,
            active: true,
            status: undefined,
          },
          success: response<User[]>(),
        }));

        return {
          getUsers,
        };
      },
    );

    const httpTesting = fetchTesting;

    await TestBed.runInInjectionContext(async () => {
      const usersApi = craftUse(UsersFilterApi());
      const resultPromise = usersApi.getUsers();

      const request = httpTesting.expectOne((pendingRequest) => {
        const params = pendingRequest.params;
        return (
          pendingRequest.url === '/api/users' &&
          params.get('search') === 'john' &&
          params.get('page') === '2' &&
          params.get('active') === 'true' &&
          params.has('status') === false
        );
      });
      expect(request.request.method).toBe('GET');
      request.flush([]);

      await expect(resultPromise).resolves.toEqual([]);
    });

    httpTesting.verify();
  });

  it('should preserve repeated URLSearchParams when calling fetch', async () => {
    type User = { id: string; email: string };
    const params = new URLSearchParams();
    params.append('tag', 'a');
    params.append('tag', 'b');

    const { UsersUrlSearchParamsApi } = craftService(
      { name: 'UsersUrlSearchParamsApi', scope: 'global' },
      function* () {
        const getUsers = yield* CraftHttpClient.get(({ response }) => ({
          url: '/api/users',
          params,
          success: response<User[]>(),
        }));

        return {
          getUsers,
        };
      },
    );

    const httpTesting = fetchTesting;

    await TestBed.runInInjectionContext(async () => {
      const usersApi = craftUse(UsersUrlSearchParamsApi());
      const resultPromise = usersApi.getUsers();

      const request = httpTesting.expectOne(
        (pendingRequest) =>
          pendingRequest.url === '/api/users' &&
          pendingRequest.params.getAll('tag').join(',') === 'a,b',
      );
      request.flush([]);

      await expect(resultPromise).resolves.toEqual([]);
    });

    httpTesting.verify();
  });

  it('should keep request.params as the original object (normalization stays at call time)', () => {
    type User = { id: string; email: string };
    const fixedParams = {
      search: 'john',
      active: true,
      status: undefined,
    } as const;

    const { UsersParamsIdentityApi } = craftService(
      { name: 'UsersParamsIdentityApi', scope: 'global' },
      function* () {
        const getUsers = yield* CraftHttpClient.get(({ response }) => ({
          url: '/api/users',
          params: fixedParams,
          success: response<User[]>(),
        }));

        return {
          getUsers,
        };
      },
    );

    TestBed.runInInjectionContext(() => {
      const usersApi = craftUse(UsersParamsIdentityApi());

      expect(usersApi.getUsers.params).toEqual({
        search: 'john',
        active: true,
        status: undefined,
      });
      expect(usersApi.getUsers.params).toBe(fixedParams);
    });
  });

  it('should map HttpClient failures to a custom craftException when declared', async () => {
    type User = { id: string; email: string };
    const usersNotFound = () =>
      craftException(
        {
          _tag: 'USERS_NOT_FOUND',
          scope: 'UsersApi',
        },
        {
          reason: 'missing',
        },
      );
    type UsersNotFound = ReturnType<typeof usersNotFound>;

    const { UsersApiOnCustomError } = craftService(
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

    type UsersApi = GetServiceOutput<typeof UsersApiOnCustomError>;
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

    const httpTesting = fetchTesting;

    await TestBed.runInInjectionContext(async () => {
      const usersApi = craftUse(UsersApiOnCustomError());
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

    const { UsersApiOnError } = craftService(
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

    const httpTesting = fetchTesting;

    await TestBed.runInInjectionContext(async () => {
      const usersApi = craftUse(UsersApiOnError());
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

      expect(httpError._tag).toBe('HttpError');
      expect(httpError.scope).toBe('HttpClient');
      expect(httpError.identifier).toBe('GET /api/users');
      expect(httpError.payload.method).toBe('GET');
      expect(httpError.payload.url).toBe('/api/users');
      expect(httpError.payload.error).toEqual(
        expect.objectContaining({
          status: 500,
          statusText: 'Server Error',
        }),
      );
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
          _tag: 'PASSWORD_REQUIRED',
          scope: 'AuthApi',
        },
        {
          field: 'password',
        },
      );
    type PasswordRequired = ReturnType<typeof passwordRequired>;

    const { AuthApi } = craftService(
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

    type AuthApi = GetServiceOutput<typeof AuthApi>;
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
          source: '_tag';
          mode: 'match';
          expected: 'PASSWORD_REQUIRED';
        }
      | {
          source: 'content';
          mode: 'match';
          expected: 'Password is required';
        }
    >();

    const httpTesting = fetchTesting;

    await TestBed.runInInjectionContext(async () => {
      const authApi = craftUse(AuthApi());
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
          _tag: 'INVALID_PASSWORD_PAYLOAD',
          scope: 'AuthApi',
        },
        {
          field: 'password',
        },
      );

    const { AuthApiOnBodyRule } = craftService(
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

    const httpTesting = fetchTesting;

    await TestBed.runInInjectionContext(async () => {
      const authApi = craftUse(AuthApiOnBodyRule());
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
        _tag: 'RATE_LIMITED',
        scope: 'AuthApi',
      });

    const { AuthApiOnHeaderRule } = craftService(
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

    const httpTesting = fetchTesting;

    await TestBed.runInInjectionContext(async () => {
      const authApi = craftUse(AuthApiOnHeaderRule());
      const resultPromise = authApi.login();

      const request = httpTesting.expectOne('/api/login');
      request.flush(
        {
          message: 'Too many requests',
        },
        {
          status: 429,
          statusText: 'Too Many Requests',
          headers: {
            'x-error-kind': 'rate-limit',
          },
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
        _tag: 'GENERIC_BAD_REQUEST',
        scope: 'AuthApi',
      });
    const passwordRequired = () =>
      craftException({
        _tag: 'PASSWORD_REQUIRED',
        scope: 'AuthApi',
      });

    const { AuthApiOnRulePriority } = craftService(
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

    const httpTesting = fetchTesting;

    await TestBed.runInInjectionContext(async () => {
      const authApi = craftUse(AuthApiOnRulePriority());
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

    const { UsersApiPost } = craftService(
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

    const httpTesting = fetchTesting;

    await TestBed.runInInjectionContext(async () => {
      const usersApi = craftUse(UsersApiPost());
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
            _tag: 'USERS_NOT_FOUND',
            scope: 'UsersApi',
          },
          {
            reason: 'missing',
          },
        );
      type UsersNotFound = ReturnType<typeof usersNotFound>;

      const { UsersFeature } = craftService(
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

      type UsersFeatureDependencies = GetServiceDependencies<
        typeof UsersFeature
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
      expectTypeOf<HttpDependency['browserBoundary']>().toEqualTypeOf<true>();
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

    const { UsersFeatureForMocks: UsersFeature } = craftService(
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

    const { UsersFeatureForDependencies } = craftService(
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
                _tag: 'PASSWORD_REQUIRED',
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
                _tag: 'VALIDATION_HEADER_ERROR',
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
      typeof UsersFeatureForDependencies
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
      const usersFeature = craftUse(UsersFeatureForDependencies());

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

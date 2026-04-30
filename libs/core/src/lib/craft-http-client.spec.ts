import '@angular/compiler';
import {
  HttpErrorResponse,
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
import {
  CraftHttpClient,
  type CraftHttpClientError,
} from './craft-http-client';
import { craftService, type GetServiceOutput } from './craft-service';
import { isCraftException } from './craft-exception';

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
  });

  it('should require an explicit success type parameter', () => {
    if (false) {
      craftService(
        { name: 'InvalidHttpApi', scope: 'global' },
        function* () {
          // @ts-expect-error CraftHttpClient requires an explicit success type parameter
          const missingSuccessType = yield* CraftHttpClient.get();

          return {
            missingSuccessType,
          };
        },
      );
    }
  });

  it('should return a promise of the success type for GET requests', async () => {
    type User = { id: string; email: string };

    const { injectUsersApi } = craftService(
      { name: 'UsersApi', scope: 'global' },
      function* () {
        const getUsers = yield* CraftHttpClient.get<User[]>();

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
      const resultPromise = usersApi.getUsers('/api/users');

      const request = httpTesting.expectOne('/api/users');
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

  it('should convert HttpClient failures to a HttpError craftException', async () => {
    type User = { id: string; email: string };

    const { injectUsersApiOnError } = craftService(
      { name: 'UsersApiOnError', scope: 'global' },
      function* () {
        const getUsers = yield* CraftHttpClient.get<User[]>();

        return {
          getUsers,
        };
      },
    );

    const httpTesting = TestBed.inject(HttpTestingController);

    await TestBed.runInInjectionContext(async () => {
      const usersApi = injectUsersApiOnError();
      const resultPromise = usersApi.getUsers('/api/users');

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

  it('should return a promise of the success type for POST requests', async () => {
    type User = { id: string; email: string };

    const { injectUsersApiPost } = craftService(
      { name: 'UsersApiPost', scope: 'global' },
      function* () {
        const createUser = yield* CraftHttpClient.post<User>();

        return {
          createUser,
        };
      },
    );

    const httpTesting = TestBed.inject(HttpTestingController);

    await TestBed.runInInjectionContext(async () => {
      const usersApi = injectUsersApiPost();
      const resultPromise = usersApi.createUser('/api/users', {
        email: 'john@doe.com',
      });

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
});

import { TestBed } from '@angular/core/testing';
import { query, ResourceByIdLikeQueryRef } from './query';
import { craftService } from './craft-service';
import { ResourceByIdRef } from './resource-by-id';
import { CraftResourceRef } from './util/craft-resource-ref';
import { computed, signal } from '@angular/core';
import { craftException, CraftExceptionResult } from './craft-exception';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import type { ExtractDeps } from './branded-component/branded-component';
import type { GetToYieldServiceDependencies } from './craft-service';

type User = {
  id: string;
  name: string;
  email: string;
};

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

describe('query', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });
  it('1- should accept signal param as source', () => {
    TestBed.runInInjectionContext(() => {
      const queryRef = query({
        params: () => '5',
        loader: async ({ params }) => {
          return {
            id: params,
            name: 'John Doe',
            email: 'test@a.com',
          };
        },
      });
      expect(queryRef).toBeDefined();
      const queryResult = queryRef;
      expect(queryResult.resourceParamsSrc).toBeDefined();
      expect(queryResult.resourceParamsSrc()).toEqual('5');
    });
  });

  it('should return undefined with safeValue when status is error, while value throws', async () => {
    await TestBed.runInInjectionContext(async () => {
      const queryRef = query({
        params: () => 'error',
        loader: async ({ params }) => {
          throw new Error('Test error');
          return {
            id: params,
            name: 'John Doe',
            email: 'test@a.com',
          };
        },
      });

      await vi.runAllTimersAsync();
      expect(queryRef.status()).toBe('error');
      expect(queryRef.error()).toBeInstanceOf(Error);
      expect(queryRef.error()?.message).toBe('Test error');

      // safeValue should return undefined without throwing
      expect(queryRef.safeValue()).toBeUndefined();
    });
  });

  it('typing: tracks generator dependencies from params, loader and insertions', () => {
    const { UserIdServiceToYield } = craftService(
      { name: 'UserIdService', scope: 'global' },
      () => ({
        read: (): string => 'user-1',
      }),
    );
    const { UserApiServiceToYield } = craftService(
      { name: 'UserApiService', scope: 'global' },
      () => ({
        get: (userId: string): Promise<User> =>
          Promise.resolve({
            id: userId,
            name: 'John Doe',
            email: 'john@doe.com',
          }),
      }),
    );
    const { QueryToolsToYield } = craftService(
      { name: 'QueryTools', scope: 'global' },
      () => ({
        prefix: (): string => 'user',
      }),
    );

    TestBed.runInInjectionContext(() => {
      const queryRef = query(
        {
          params: function* () {
            const userIdService = yield* UserIdServiceToYield();
            return userIdService.read();
          },
          loader: function* ({ params }) {
            const userApi = yield* UserApiServiceToYield();
            return userApi.get(params);
          },
        },
        function* () {
          const queryTools = yield* QueryToolsToYield();

          return {
            queryKey: `${queryTools.prefix()}:details`,
          };
        },
      );

      expectTypeOf<ExtractDeps<typeof queryRef>>().toEqualTypeOf<{
        UserIdService: GetToYieldServiceDependencies<
          typeof UserIdServiceToYield
        >;
        UserApiService: GetToYieldServiceDependencies<
          typeof UserApiServiceToYield
        >;
        QueryTools: GetToYieldServiceDependencies<typeof QueryToolsToYield>;
      }>();
    });
  });

  it('should resolve generator params, method, loader and insertions', async () => {
    const logs: string[] = [];
    const { UserIdRuntimeToYield } = craftService(
      { name: 'UserIdRuntime', scope: 'global' },
      () => ({
        read: (): string => 'user-2',
      }),
    );
    const { QueryLoggerRuntimeToYield } = craftService(
      { name: 'QueryLoggerRuntime', scope: 'global' },
      () => ({
        log: (message: string) => {
          logs.push(message);
        },
      }),
    );
    const { UserApiRuntimeToYield } = craftService(
      { name: 'UserApiRuntime', scope: 'global' },
      () => ({
        get: async (userId: string): Promise<User> => ({
          id: userId,
          name: 'Jane Doe',
          email: 'jane@doe.com',
        }),
      }),
    );

    await TestBed.runInInjectionContext(async () => {
      const autoQuery = query(
        {
          params: function* () {
            const userId = yield* UserIdRuntimeToYield();
            return userId.read();
          },
          loader: function* ({ params }) {
            const userApi = yield* UserApiRuntimeToYield();
            return userApi.get(params);
          },
        },
        function* () {
          const logger = yield* QueryLoggerRuntimeToYield();
          logger.log('auto:init');

          return {
            initialized: true,
          };
        },
      );

      const manualQuery = query({
        method: function* (userId: string) {
          const logger = yield* QueryLoggerRuntimeToYield();
          logger.log(`manual:${userId}`);
          return userId;
        },
        loader: function* ({ params }) {
          const userApi = yield* UserApiRuntimeToYield();
          return userApi.get(params);
        },
      });

      await vi.runAllTimersAsync();
      expect(autoQuery.initialized).toBe(true);
      expect(autoQuery.value()?.id).toBe('user-2');

      manualQuery.call('user-3');
      await vi.runAllTimersAsync();

      expect(manualQuery.value()?.id).toBe('user-3');
      expect(logs).toEqual(['auto:init', 'manual:user-3']);
    });
  });
});

describe('query with identifier>', () => {
  it('Retrieve returned types of queryByIdFn', () => {
    TestBed.runInInjectionContext(() => {
      const queryByIdFn = query({
        params: () => '5',
        identifier: (params) => params,
        loader: async ({ params }) => {
          return {
            id: params,
            name: 'John Doe',
            email: 'test@a.com',
          };
        },
      });

      expectTypeOf(queryByIdFn).toEqualTypeOf<
        ResourceByIdLikeQueryRef<
          {
            id: string;
            name: string;
            email: string;
          },
          string,
          false,
          unknown,
          string,
          {},
          string,
          {
            params: never;
            loader: never;
          }
        >
      >();
    });
  });
});

describe('craftService using query', () => {
  it('1- Should expose a query resource', () => {
    const { injectQueryStore } = craftService(
      { name: 'QueryStore', scope: 'global' },
      () => ({
        user: query({
          params: () => '5',
          loader: async ({ params }) => {
            return {
              id: params,
              name: 'John Doe',
              email: 'test@a.com',
            };
          },
        }),
      }),
    );

    TestBed.runInInjectionContext(() => {
      const store = injectQueryStore();

      expect(store.user).toBeDefined();
    });
  });
});

describe('query Insertions output', () => {
  it('should accept an Insertions output, that appear in the store', () => {
    const { injectQueryStore } = craftService(
      { name: 'QueryStore', scope: 'global' },
      () => ({
        user: query(
          {
            params: () => '5',
            loader: async ({ params }) => {
              return {
                id: params,
                name: 'John Doe',
                email: 'test@a.com',
              };
            },
          },
          () => ({
            pagination: {
              page: 1,
            },
          }),
        ),
      }),
    );
    TestBed.runInInjectionContext(() => {
      const store = injectQueryStore();
      expect(store.user.pagination).toEqual({ page: 1 });
      expect(store.user.pagination).toBeDefined();
    });
  });

  it('should accept an Insertion, with the correct resource infer', () => {
    const { injectQueryStore } = craftService(
      { name: 'QueryStore', scope: 'global' },
      () => ({
        user: query(
          {
            params: () => '5',
            loader: async ({ params }) => {
              return {
                id: params,
                name: 'John Doe',
                email: 'test@a.com',
              };
            },
          },
          (data) => {
            expectTypeOf(data.resource).toEqualTypeOf<
              CraftResourceRef<
                NoInfer<{
                  id: string;
                  name: string;
                  email: string;
                }>,
                string
              >
            >();
            expect(data.resource).toBeDefined();
            return {
              pagination: {
                page: 1,
              },
            };
          },
        ),
      }),
    );
    TestBed.runInInjectionContext(() => {
      const store = injectQueryStore();
      expect(store.user.pagination).toEqual({ page: 1 });
      expect(store.user.pagination).toBeDefined();
    });
  });

  it('should accept an Insertion, with the correct resourceById infer', () => {
    const { injectQueryStore } = craftService(
      { name: 'QueryStore', scope: 'global' },
      () => ({
        user: query(
          {
            params: () => '5',
            identifier: (params) => params,
            loader: async ({ params }) => {
              return {
                id: params,
                name: 'John Doe',
                email: 'test@a.com',
              };
            },
          },
          (data) => {
            expectTypeOf(data.resourceById).toEqualTypeOf<
              ResourceByIdRef<
                string,
                NoInfer<{
                  id: string;
                  name: string;
                  email: string;
                }>,
                string
              >
            >();
            expect(data.resourceById).toBeDefined();
            return {
              pagination: {
                page: 1,
              },
            };
          },
        ),
      }),
    );
    TestBed.runInInjectionContext(() => {
      const store = injectQueryStore();
      expect(store.user.pagination).toEqual({ page: 1 });
      expect(store.user.pagination).toBeDefined();
    });
  });

  it('should accept an insertion output, that appear in the store', () => {
    const { injectQueryStore } = craftService(
      { name: 'QueryStore', scope: 'global' },
      () => ({
        user: query(
          {
            params: () => '5',
            loader: async ({ params }) => {
              return {
                id: params,
                name: 'John Doe',
                email: 'test@a.com',
              } satisfies User;
            },
          },
          (data) => {
            console.log('data', data);
            return {
              pagination: {
                page: 1,
              },
            };
          },
        ),
      }),
    );
    TestBed.runInInjectionContext(() => {
      const store = injectQueryStore();
      expectTypeOf(store.user.pagination).toEqualTypeOf<{
        page: number;
      }>();
      expect(store.user.pagination).toBeDefined();
    });
  });
  it('should accept multiple insertions, that appear in the store', () => {
    const { injectQueryStore } = craftService(
      { name: 'QueryStore', scope: 'global' },
      () => ({
        user: query(
          {
            params: () => '5',
            loader: async ({ params }) => {
              return {
                id: params,
                name: 'John Doe',
                email: 'test@a.com',
              } satisfies User;
            },
          },
          // insert 1
          () => {
            return {
              pagination: {
                page: 1,
              },
            };
          },
          // insert 2
          ({ insertions: inserts }) => {
            expectTypeOf(inserts).toEqualTypeOf<{
              pagination: {
                page: number;
              };
            }>();
            return {
              someOtherInfo: true,
            };
          },
        ),
      }),
    );
    TestBed.runInInjectionContext(() => {
      const store = injectQueryStore();
      //insert 1
      expectTypeOf(store.user.pagination).toEqualTypeOf<{
        page: number;
      }>();
      expect(store.user.pagination).toBeDefined();

      //insert 2
      expectTypeOf(store.user.someOtherInfo).toEqualTypeOf<boolean>();
      expect(store.user.someOtherInfo).toBeDefined();
    });
  });
  it('should accept seven insertions, all outputs appear in the store', () => {
    const { injectQueryStore } = craftService(
      { name: 'QueryStore', scope: 'global' },
      () => ({
        user: query(
          {
            params: () => '5',
            loader: async ({ params }) => {
              return {
                id: params,
                name: 'John Doe',
                email: 'test@a.com',
              } satisfies User;
            },
          },
          // insert 1
          () => ({ ext1: 1 }),
          // insert 2
          ({ insertions: inserts }) => ({ ext2: inserts.ext1 + 1 }),
          // insert 3
          ({ insertions: inserts }) => ({ ext3: inserts.ext2 + 1 }),
          // insert 4
          ({ insertions: inserts }) => ({ ext4: inserts.ext3 + 1 }),
          // insert 5
          ({ insertions: inserts }) => ({ ext5: inserts.ext4 + 1 }),
          // insert 6
          ({ insertions: inserts }) => ({ ext6: inserts.ext5 + 1 }),
          // insert 7
          ({ insertions: inserts }) => ({ ext7: inserts.ext6 + 1 }),
        ),
      }),
    );
    TestBed.runInInjectionContext(() => {
      const store = injectQueryStore();
      expectTypeOf(store.user.ext1).toEqualTypeOf<number>();
      expectTypeOf(store.user.ext2).toEqualTypeOf<number>();
      expectTypeOf(store.user.ext3).toEqualTypeOf<number>();
      expectTypeOf(store.user.ext4).toEqualTypeOf<number>();
      expectTypeOf(store.user.ext5).toEqualTypeOf<number>();
      expectTypeOf(store.user.ext6).toEqualTypeOf<number>();
      expectTypeOf(store.user.ext7).toEqualTypeOf<number>();
      expect(store.user.ext1).toBeDefined();
      expect(store.user.ext2).toBeDefined();
      expect(store.user.ext3).toBeDefined();
      expect(store.user.ext4).toBeDefined();
      expect(store.user.ext5).toBeDefined();
      expect(store.user.ext6).toBeDefined();
      expect(store.user.ext7).toBeDefined();
    });
  });
});

describe('query exceptions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('typing: exposes exceptions in insertions context', () => {
    TestBed.runInInjectionContext(() => {
      const shouldFail = signal(true);

      query(
        {
          params: () =>
            shouldFail()
              ? craftException(
                  { code: 'INVALID_USER_ID' },
                  { reason: 'missing' as const },
                )
              : 'user-1',
          loader: async ({ params }) => {
            return shouldFail()
              ? craftException(
                  { code: 'INVALID_USER_ID' },
                  { reason: 'missing' as const },
                )
              : {
                  id: params,
                  name: 'John Doe',
                  email: 'test@a.com',
                };
          },
        },
        ({ exceptions, hasException, state, resourceParamsSrc }) => {
          expectTypeOf(state()).toEqualTypeOf<{
            id: string;
            name: string;
            email: string;
          }>();
          expectTypeOf(resourceParamsSrc()).toEqualTypeOf<string | undefined>();
          expectTypeOf(hasException()).toEqualTypeOf<boolean>();
          expectTypeOf(exceptions()).toEqualTypeOf<{
            list: (
              | CraftExceptionResult<
                  {
                    code: 'INVALID_USER_ID';
                    scope: 'params';
                  },
                  {
                    reason: 'missing';
                  }
                >
              | CraftExceptionResult<
                  {
                    code: 'INVALID_USER_ID';
                    scope: 'loader';
                  },
                  {
                    reason: 'missing';
                  }
                >
            )[];
            params?:
              | CraftExceptionResult<
                  {
                    code: 'INVALID_USER_ID';
                    scope: 'params';
                  },
                  {
                    reason: 'missing';
                  }
                >
              | undefined;
            loader?:
              | CraftExceptionResult<
                  {
                    code: 'INVALID_USER_ID';
                    scope: 'loader';
                  },
                  {
                    reason: 'missing';
                  }
                >
              | undefined;
          }>();
          expectTypeOf(exceptions).toBeFunction();
          expectTypeOf(exceptions()).toHaveProperty('list').toBeArray();
          expectTypeOf(exceptions()).toHaveProperty('params');
          expectTypeOf(exceptions()).toHaveProperty('loader');
          return {};
        },
      );
    });
  });

  it('typing: captures exception returned by params and loader ', async () => {
    await TestBed.runInInjectionContext(async () => {
      const shouldFail = signal(true);
      const queryRef = query({
        params: () =>
          shouldFail()
            ? craftException(
                { code: 'INVALID_USER_ID' },
                { reason: 'missing' as const },
              )
            : 'user-1',
        loader: async ({ params }) => {
          return shouldFail()
            ? craftException(
                { code: 'INVALID_USER_ID' },
                { reason: 'missing' as const },
              )
            : {
                id: params,
                name: 'John Doe',
                email: 'test@a.com',
              };
        },
      });

      await vi.runAllTimersAsync();
      expectTypeOf(queryRef.exceptions().list).toEqualTypeOf<
        (
          | CraftExceptionResult<
              {
                code: 'INVALID_USER_ID';
                scope: 'params';
              },
              {
                reason: 'missing';
              }
            >
          | CraftExceptionResult<
              {
                code: 'INVALID_USER_ID';
                scope: 'loader';
              },
              {
                reason: 'missing';
              }
            >
        )[]
      >();
    });
  });
  it('typing with identifier: captures exception returned by params and loader ', async () => {
    await TestBed.runInInjectionContext(async () => {
      const shouldFail = signal(true);
      const queryRef = query({
        params: () =>
          shouldFail()
            ? craftException(
                { code: 'INVALID_USER_ID' },
                { reason: 'missing' as const },
              )
            : 'user-1',
        identifier: (id) => id,
        loader: async ({ params }) => {
          return shouldFail()
            ? craftException(
                {
                  code: 'API_ERROR',
                },
                { reason: 'missing user' as const },
              )
            : {
                id: params,
                name: 'John Doe',
                email: 'test@a.com',
              };
        },
      });

      await vi.runAllTimersAsync();
      expectTypeOf(queryRef.exceptions().list).toEqualTypeOf<
        (
          | CraftExceptionResult<
              {
                code: 'INVALID_USER_ID';
                scope: 'params';
              },
              {
                reason: 'missing';
              }
            >
          | CraftExceptionResult<
              {
                code: 'API_ERROR';
                scope: 'loader';
                identifier: 'user-1';
              },
              {
                reason: 'missing user';
              }
            >
        )[]
      >();
      expectTypeOf(queryRef.exceptions().params).toEqualTypeOf<
        | CraftExceptionResult<
            {
              code: 'INVALID_USER_ID';
              scope: 'params';
            },
            {
              reason: 'missing';
            }
          >
        | undefined
      >();
      expectTypeOf(queryRef.exceptions().loader).toEqualTypeOf<
        Partial<
          Record<
            'user-1',
            CraftExceptionResult<
              {
                code: 'API_ERROR';
                scope: 'loader';
                identifier: 'user-1';
              },
              {
                reason: 'missing user';
              }
            >
          >
        >
      >();
    });
  });
  it('typing with identifier: return a select exceptions for an identifier ', async () => {
    await TestBed.runInInjectionContext(async () => {
      const shouldFail = signal(true);
      const queryRef = query({
        params: () =>
          shouldFail()
            ? craftException(
                { code: 'INVALID_USER_ID' },
                { reason: 'missing' as const },
              )
            : ('user-1' as string),
        identifier: (id) => id,
        loader: async ({ params }) => {
          return shouldFail()
            ? shouldFail()
              ? craftException(
                  {
                    code: 'API_ERROR',
                    scope: 'loader',
                  },
                  { reason: 'missing1' as const },
                )
              : craftException(
                  {
                    code: 'API_ERROR',
                    scope: 'loader',
                  },
                  { reason: 'missing2' as const },
                )
            : {
                id: params,
                name: 'John Doe',
                email: 'test@a.com',
              };
        },
      });

      await vi.runAllTimersAsync();

      expectTypeOf(queryRef.exceptions().loader).toEqualTypeOf<
        Partial<
          Record<
            string,
            | CraftExceptionResult<
                {
                  code: 'API_ERROR';
                  scope: 'loader';
                  identifier: string;
                },
                {
                  reason: 'missing1';
                }
              >
            | CraftExceptionResult<
                {
                  code: 'API_ERROR';
                  scope: 'loader';
                  identifier: string;
                },
                {
                  reason: 'missing2';
                }
              >
          >
        >
      >();

      expectTypeOf(queryRef.select('')?.exceptions().loader).toEqualTypeOf<
        | CraftExceptionResult<
            {
              code: 'API_ERROR';
              scope: 'loader';
              identifier: string;
            },
            {
              reason: 'missing1';
            }
          >
        | CraftExceptionResult<
            {
              code: 'API_ERROR';
              scope: 'loader';
              identifier: string;
            },
            {
              reason: 'missing2';
            }
          >
        | undefined
      >();
    });
  });

  it('captures exception returned by params and prevents loader execution', async () => {
    await TestBed.runInInjectionContext(async () => {
      const shouldFail = signal(true);
      const loader = vi.fn(async ({ params }: { params: string }) => ({
        id: params,
      }));

      const queryRef = query({
        params: () =>
          shouldFail()
            ? craftException(
                { code: 'INVALID_USER_ID' },
                { reason: 'missing' as const },
              )
            : 'user-1',
        loader: loader as any,
      });

      await vi.runAllTimersAsync();
      expect(loader).not.toHaveBeenCalled();
      expect(queryRef.resourceParamsSrc()).toBeUndefined();
      expect(queryRef.hasException()).toBe(true);
      expect(queryRef.exceptions().params?.payload.reason).toEqual('missing');

      shouldFail.set(false);
      await vi.runAllTimersAsync();

      expect(queryRef.exceptions().params).toEqual({});
      expect(queryRef.hasException()).toBe(false);

      expect(queryRef.status()).toBe('resolved');
    });
  });

  it('captures exception returned by loader without exposing it in safeValue', async () => {
    await TestBed.runInInjectionContext(async () => {
      const queryRef = query({
        params: () => 'user-1',
        loader: async () =>
          craftException(
            { code: 'INVALID_USER_ID', scope: 'loader' },
            { from: 'loader' as const },
          ),
      });

      await vi.runAllTimersAsync();

      expect(queryRef.exceptions().loader?.INVALID_USER_ID).toEqual({
        from: 'loader',
      });
      expect(queryRef.safeValue()).toBeUndefined();
      expect(queryRef.hasException()).toBe(true);
    });
  });

  it('captures exception returned by method and does not trigger loader', async () => {
    await TestBed.runInInjectionContext(async () => {
      const loader = vi.fn(async ({ params }: { params: string }) => ({
        id: params,
      }));
      const queryRef = query({
        method: (value: string) =>
          value.length < 3
            ? craftException(
                { code: 'SEARCH_TERM_TOO_SHORT' },
                { min: 3, received: value.length },
              )
            : value,
        loader: loader as any,
      });

      queryRef.call('ab');
      await vi.runAllTimersAsync();

      expect(loader).not.toHaveBeenCalled();
      expect(queryRef.resourceParamsSrc()).toBeUndefined();
      expect(queryRef.exceptions().list[0]?.payload).toEqual({
        min: 3,
        received: 2,
      });
    });
  });

  it.todo('captures and auto-clears computedInsertion exceptions', () => {
    TestBed.runInInjectionContext(() => {
      const shouldFail = signal(true);
      const queryRef = query(
        {
          params: () => 'x',
          loader: async () => ({ id: 'x' }),
        },
        () => ({
          computedFailure: computed(() =>
            shouldFail()
              ? craftException(
                  { code: 'COMPUTED_FAILURE' },
                  { from: 'computed' as const },
                )
              : undefined,
          ),
        }),
      );

      expect(queryRef.computedFailure()).toBeUndefined();
      // expect(queryRef.exceptions().computedInsertion.COMPUTED_FAILURE).toEqual({
      //   from: 'computed',
      // });

      // shouldFail.set(false);
      // expect(queryRef.computedFailure()).toBeUndefined();
      // expect(queryRef.exceptions().computedInsertion).toEqual({});
      // expect(queryRef.hasException()).toBe(false);
    });
  });

  it.todo('captures and auto-clears methodInsertion exceptions', () => {
    TestBed.runInInjectionContext(() => {
      const shouldFail = signal(true);
      const queryRef = query(
        {
          params: () => 'x',
          loader: async () => ({ id: 'x' }),
        },
        () => ({
          validateName: () =>
            shouldFail()
              ? craftException(
                  { code: 'PARAM_VALUE_MISMATCH' },
                  { expected: 'x', actual: 'y' },
                )
              : undefined,
        }),
      );

      queryRef.validateName();
      // expect(
      //   queryRef.exceptions().methodInsertion.PARAM_VALUE_MISMATCH,
      // ).toEqual({
      //   expected: 'x',
      //   actual: 'y',
      // });

      // shouldFail.set(false);
      // queryRef.validateName();
      // expect(queryRef.exceptions().methodInsertion).toEqual({});
    });
  });

  it.todo(
    'maps loader exceptions by identifier only when identifier is provided on the exception',
    async () => {
      await TestBed.runInInjectionContext(async () => {
        const current = signal<'A' | 'B'>('A');
        const queryRef = query({
          params: () => current(),
          identifier: (id) => id,
          loader: async ({ params }) =>
            params === 'A'
              ? craftException({ code: 'PARSE_FAILED' }, { params })
              : craftException({ code: 'PARSE_FAILED' }, { params }),
        });

        await vi.runAllTimersAsync();
        expect(queryRef.exceptions().loader?.['A']?.code).toEqual({
          params: 'A',
        });

        current.set('B');
        await vi.runAllTimersAsync();

        expect(queryRef.exceptions().loader['A']).toBeDefined();
        expect(
          queryRef.exceptions().list.some((item) => item.identifier === 'A'),
        ).toBe(true);
        expect(
          queryRef.exceptions().list.some((item) => item.identifier === 'B'),
        ).toBe(true);
      });
    },
  );

  it.todo('keeps params exceptions global in parallel query', async () => {
    await TestBed.runInInjectionContext(async () => {
      const current = signal<'A' | 'B'>('A');
      const queryRef = query({
        params: () =>
          current()
            ? craftException({ code: 'INVALID_ID' }, { params: current() })
            : current(),
        identifier: (id) => id,
        loader: async ({ params }) => ({ id: params }),
      });

      await vi.runAllTimersAsync();

      expect(queryRef.exceptions().params?.payload).toEqual({ params: 'A' });
      expect(queryRef.exceptions().loader).toEqual({});
    });
  });

  it.todo(
    'exposes typed exception accessors from params and insertions',
    () => {
      TestBed.runInInjectionContext(() => {
        const current = signal<'A' | 'B'>('A');
        const queryRef = query(
          {
            params: () =>
              current()
                ? craftException(
                    { code: 'PARAM_VALUE_MISMATCH' },
                    { from: 'params' as const },
                  )
                : current(),
            loader: async ({ params }) => ({ id: params }),
          },
          () => ({
            computedFailure: computed(() =>
              craftException(
                { code: 'COMPUTED_VALUE_MISMATCH' },
                { from: 'insertion-1' as const },
              ),
            ),
            validate: () =>
              craftException(
                { code: 'METHOD_VALUE_MISMATCH' },
                { value: 'x' as string },
              ),
          }),
        );

        expectTypeOf(
          queryRef.exceptions().params?.PARAM_VALUE_MISMATCH,
        ).toEqualTypeOf<{ from: 'params' } | undefined>();
      });
    },
  );
});

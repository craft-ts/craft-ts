import { computed, signal } from './host/craft-compat';
import { query, ResourceByIdLikeQueryRef } from './query';
import { craftService } from './craft-service';
import { craftPipe } from './craft-pipe';
import { ResourceByIdRef } from './resource-by-id';
import { CraftResourceRef } from './util/craft-resource-ref';
import { craftException, CraftExceptionResult } from './craft-exception';
import type { ExtractDeps } from './branded-component/branded-component';
import type { GetServiceDependencies } from './craft-service';
import {
  provideFnWrapObserver,
  provideFnWrapper,
  type FnWrapper,
} from './fn-wrapper';
import {
  injectQueryMethodRuntimeContext,
  type QueryMethodRuntimeContext,
} from './primitive-method-runtime-context';
import {
  providePrimitiveResourceRuntimeObserver,
  type PrimitiveResourceRuntimeContext,
} from './primitive-resource-runtime-context';
import { craftUse } from './craft-use';
import { craftGen } from './craft-gen';
import { catchTag, retry } from './craft-program-operators';
import { craftUntilSettled } from './craft-until-settled';
import { insertQueryPipe } from './insert-typed-pipes';
import {
  insertDeepYieldableValue,
  type YieldableReactiveProperties,
} from './reactive-read';
import { craftSignal } from './host/craft-signal';
import { setupCraftServiceTest } from './setup-craft-service-test';

const runInInjectionContext = <T>(fn: () => T): T =>
  setupCraftServiceTest().injector.run(fn);

type User = {
  id: string;
  name: string;
  email: string;
};

describe('query', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });
  it('1- should accept signal param as source', async () => {
    runInInjectionContext(() => {
      const queryRef = craftUse(
        query('queryRef', {
          params: () => '5',
          loader: async ({ params }) => {
            return {
              id: params,
              name: 'John Doe',
              email: 'test@a.com',
            };
          },
        }),
      );
      expect(queryRef).toBeDefined();
      const queryResult = queryRef;
      expect(queryResult.resourceParamsSrc).toBeDefined();
      expect(craftUse(queryResult.resourceParamsSrc())).toEqual('5');
    });
  });

  it('preserves the previous value while a new query is loading by default', async () => {
    await runInInjectionContext(async () => {
      const currentId = signal('first');
      const queryRef = craftUse(
        query('queryRef', {
          params: () => currentId(),
          loader: async ({ params }) => {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return { id: params };
          },
        }),
      );

      await vi.runAllTimersAsync();
      expect(craftUse(queryRef.value())).toEqual({ id: 'first' });

      currentId.set('second');
      expect(craftUse(queryRef.status())).toBe('loading');
      expect(craftUse(queryRef.value())).toEqual({ id: 'first' });

      await vi.runAllTimersAsync();
      expect(craftUse(queryRef.value())).toEqual({ id: 'second' });
    });
  });

  it('can clear the previous query value while loading', async () => {
    await runInInjectionContext(async () => {
      const currentId = signal('first');
      const queryRef = craftUse(
        query('queryRef', {
          params: () => currentId(),
          preservePreviousValue: () => false,
          loader: async ({ params }) => {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return { id: params };
          },
        }),
      );

      await vi.runAllTimersAsync();
      currentId.set('second');
      expect(craftUse(queryRef.status())).toBe('loading');
      expect(craftUse(queryRef.value())).toBeUndefined();
    });
  });

  it('should return undefined with value when status is error', async () => {
    await runInInjectionContext(async () => {
      const queryRef = craftUse(
        query('queryRef', {
          params: () => 'error',
          loader: async ({ params }) => {
            throw new Error('Test error');
            return {
              id: params,
              name: 'John Doe',
              email: 'test@a.com',
            };
          },
        }),
      );

      await vi.runAllTimersAsync();
      // A thrown (technical) error surfaces as the craft `'exception'` status
      // without a business `craftException`.
      expect(craftUse(queryRef.status())).toBe('exception');
      expect(craftUse(queryRef.hasException())).toBe(false);
      expect(craftUse(queryRef.exception())).toBeUndefined();

      // value should return undefined without throwing
      expect(craftUse(queryRef.value())).toBeUndefined();
    });
  });

  it('settles a synchronous loader exception without Angular resource()', async () => {
    await runInInjectionContext(async () => {
      const queryRef = craftUse(
        query('queryRef', {
          params: () => 'invalid',
          loader: ({ params }) =>
            craftException(
              { _tag: 'INVALID_QUERY', scope: 'loader' },
              { params },
            ),
        }),
      );

      await vi.runAllTimersAsync();

      expect(craftUse(queryRef.status())).toBe('exception');
      expect(craftUse(queryRef.hasException())).toBe(true);
      expect(craftUse(queryRef.exception())?._tag).toBe('INVALID_QUERY');
      expect(craftUse(queryRef.value())).toBeUndefined();
    });
  });

  it('invalidates an Angular computed settledValue after a successful load', async () => {
    await runInInjectionContext(async () => {
      const queryRef = craftUse(
        query('queryRef', {
          params: () => 'ready',
          loader: async ({ params }) => ({ id: params }),
        }),
      );
      const rendered = computed(() => {
        try {
          return craftUse(queryRef.settledValue()).id;
        } catch {
          return 'pending';
        }
      });

      expect(rendered()).toBe('pending');
      await vi.runAllTimersAsync();

      expect(rendered()).toBe('ready');
    });
  });

  it('reloads automatically when Craft signal params change', async () => {
    await runInInjectionContext(async () => {
      const currentId = craftSignal('first');
      const loaded: string[] = [];

      craftUse(
        query('queryRef', {
          params: () => currentId(),
          loader: async ({ params }) => {
            loaded.push(params);
            return { id: params };
          },
        }),
      );

      await vi.runAllTimersAsync();
      expect(loaded).toEqual(['first']);

      currentId.set('second');
      await vi.runAllTimersAsync();

      expect(loaded).toEqual(['first', 'second']);
    });
  });

  // Regression: a query whose `params`/`loader` are PLAIN (non-generator)
  // functions used to defer resolving its injector until those computeds first
  // ran — relying on the AMBIENT injection context at read time. A non-blocking
  // route guard awaits such a query via `craftUntilSettled(...)`, which subscribes
  // OUTSIDE an injection context, so the params source (`resourceParamsSrc`,
  // i.e. the wrapped params fn) first ran with no ambient context and threw
  // NG0203. The injector is now captured eagerly at construction.
  it('regression(NG0203): non-generator query params source is callable from OUTSIDE an injection context', () => {
    let readParamsSrc: (() => unknown) | undefined;

    // Construct inside an injection context (the normal case).
    runInInjectionContext(() => {
      const queryRef = craftUse(
        query('queryRef', {
          params: () => 'user-1',
          loader: async ({ params }) => ({ id: params }),
        }),
      );
      readParamsSrc = () => craftUse(queryRef.resourceParamsSrc());
    });

    // Read the params source from OUTSIDE any injection context — this is the
    // exact call (the wrapped params fn / `resourceParamsSrc`) that threw
    // NG0203 before the fix.
    expect(() => readParamsSrc?.()).not.toThrow();
    expect(readParamsSrc?.()).toBe('user-1');
  });

  it('typing: tracks generator dependencies from params, loader and insertions', async () => {
    const { UserIdService } = craftService(
      { name: 'UserIdService', providedIn: 'global' },
      () => ({
        read: (): string => 'user-1',
      }),
    );
    const { UserApiService } = craftService(
      { name: 'UserApiService', providedIn: 'global' },
      () => ({
        get: (userId: string): Promise<User> =>
          Promise.resolve({
            id: userId,
            name: 'John Doe',
            email: 'john@doe.com',
          }),
      }),
    );
    const { QueryTools } = craftService(
      { name: 'QueryTools', providedIn: 'global' },
      () => ({
        prefix: (): string => 'user',
      }),
    );

    runInInjectionContext(() => {
      const queryRef = craftUse(
        query(
          'queryRef',
          {
            params: function* () {
              const userIdService = yield* UserIdService();
              return userIdService.read();
            },
            loader: function* ({ params }) {
              return yield* UserApiService.get(params);
            },
          },
          function* () {
            const queryTools = yield* QueryTools();

            return {
              queryKey: `${queryTools.prefix()}:details`,
            };
          },
        ),
      );

      type t = ExtractDeps<typeof queryRef>;
      expectTypeOf<ExtractDeps<typeof queryRef>>().toEqualTypeOf<{
        UserIdService: {
          providedIn: 'global';
          dependencies: {};
          browserBoundary: false;
          appStart: false;
        };
        UserApiService: {
          providedIn: 'global';
          dependencies: {};
          browserBoundary: false;
          appStart: false;
          derivedPropertiesUsed: {
            get: (userId: string) => Promise<User>;
          };
          derivedPropertiesExposed: {
            get: (userId: string) => Promise<User>;
          };
        };
        QueryTools: {
          providedIn: 'global';
          dependencies: {};
          browserBoundary: false;
          appStart: false;
        };
      }>();
    });
  });

  it('should resolve generator params, method, loader and insertions', async () => {
    const logs: string[] = [];
    const { UserIdRuntime } = craftService(
      { name: 'UserIdRuntime', providedIn: 'global' },
      () => ({
        read: (): string => 'user-2',
      }),
    );
    const { QueryLoggerRuntime } = craftService(
      { name: 'QueryLoggerRuntime', providedIn: 'global' },
      () => ({
        log: (message: string) => {
          logs.push(message);
        },
      }),
    );
    const { UserApiRuntime } = craftService(
      { name: 'UserApiRuntime', providedIn: 'global' },
      () => ({
        get: async (userId: string): Promise<User> => ({
          id: userId,
          name: 'Jane Doe',
          email: 'jane@doe.com',
        }),
      }),
    );

    await runInInjectionContext(async () => {
      const autoQuery = craftUse(
        query(
          'autoQuery',
          {
            params: function* () {
              const userId = yield* UserIdRuntime();
              return userId.read();
            },
            loader: function* ({ params }) {
              const userApi = yield* UserApiRuntime();
              return userApi.get(params);
            },
          },
          function* () {
            const logger = yield* QueryLoggerRuntime();
            logger.log('auto:init');

            return {
              initialized: true,
            };
          },
        ),
      );

      const manualQuery = craftUse(
        query('manualQuery', {
          method: function* (userId: string) {
            const logger = yield* QueryLoggerRuntime();
            logger.log(`manual:${userId}`);
            return userId;
          },
          loader: function* ({ params }) {
            const userApi = yield* UserApiRuntime();
            return userApi.get(params);
          },
        }),
      );

      await vi.runAllTimersAsync();
      expect(autoQuery.initialized).toBe(true);
      expect(craftUse(autoQuery.value())?.id).toBe('user-2');

      manualQuery.call('user-3');
      await vi.runAllTimersAsync();

      expect(craftUse(manualQuery.value())?.id).toBe('user-3');
      expect(logs).toEqual(['auto:init', 'manual:user-3']);
    });
  });

  it('does not load a method query with the previous params during call', async () => {
    await runInInjectionContext(async () => {
      const loaded: string[] = [];
      const queryRef = craftUse(
        query('manualQuery', {
          method: (term: string) => term,
          loader: async ({ params }) => {
            loaded.push(params);
            return { id: params };
          },
        }),
      );

      queryRef.call('user-3');
      await vi.runAllTimersAsync();

      expect(loaded).toEqual(['user-3']);
    });
  });
});

describe('query with identifier>', () => {
  it('deepens the resolved value for a regular query', async () => {
    await runInInjectionContext(async () => {
      const queryRef = craftUse(
        query(
          'deepValueQuery',
          {
            params: () => 'user-1',
            loader: async () => ({
              id: 'user-1',
              profile: { displayName: 'Ada Lovelace' },
            }),
          },
          insertQueryPipe(
            insertDeepYieldableValue(),
            () => ({ marker: true }),
          ),
        ),
      );

      await vi.runAllTimersAsync();

      expect(craftUse(queryRef.value.id())).toBe('user-1');
      expect(craftUse(queryRef.value.profile.displayName())).toBe(
        'Ada Lovelace',
      );
      expectTypeOf(queryRef.value.profile.displayName).toBeFunction();
    });
  });

  it('deepens the value returned by select for an identified query', async () => {
    await runInInjectionContext(async () => {
      const queryRef = craftUse(
        query(
          'deepIdentifiedValueQuery',
          {
            params: () => 'user-1',
            identifier: (id: string) => id,
            loader: async ({ params }) => ({
              id: params,
              profile: { displayName: 'Ada Lovelace' },
            }),
          },
          insertDeepYieldableValue(),
        ),
      );

      await vi.runAllTimersAsync();

      const selected = queryRef.select('user-1');
      expect(selected).toBeDefined();
      expect(craftUse(selected!.value.profile.displayName())).toBe(
        'Ada Lovelace',
      );
      expectTypeOf(selected!.value.profile.displayName).toBeFunction();

      const created = queryRef.selectOrCreate('user-2');
      expect(craftUse(created.value.profile.displayName())).toBeUndefined();
    });
  });

  it('selectOrCreate returns an idle resource without changing select', async () => {
    runInInjectionContext(() => {
      const queryRef = craftUse(
        query('queryRef', {
          method: (id: string) => id,
          identifier: (id: string) => id,
          loader: async ({ params }) => ({ id: params }),
        }),
      );

      expect(queryRef.select('missing')).toBeUndefined();

      const selected = queryRef.selectOrCreate('missing');
      expect(selected).toBeDefined();
      expect(craftUse(selected.status())).toBe('idle');
      expect(queryRef.select('missing')).toBeDefined();
    });
  });

  it('Retrieve returned types of queryByIdFn', async () => {
    runInInjectionContext(() => {
      const queryByIdFn = craftUse(
        query('queryByIdFn', {
          params: () => '5',
          identifier: (params: string) => params,
          loader: async ({ params }) => {
            return {
              id: params,
              name: 'John Doe',
              email: 'test@a.com',
            };
          },
        }),
      );

      expectTypeOf(queryByIdFn).toMatchTypeOf<
        YieldableReactiveProperties<
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
        >
      >();
    });
  });
});

describe('craftService using query', () => {
  it('1- Should expose a query resource', async () => {
    const { QueryStore } = craftService(
      { name: 'QueryStore', providedIn: 'global' },
      function* () {
        return {
          user: yield* query('user', {
            params: () => '5',
            loader: async ({ params }) => {
              return {
                id: params,
                name: 'John Doe',
                email: 'test@a.com',
              };
            },
          }),
        };
      },
    );

    runInInjectionContext(() => {
      const store = craftUse(QueryStore());

      expect(store.user).toBeDefined();
    });
  });
});

describe('query Insertions output', () => {
  it('should accept an Insertions output, that appear in the store', async () => {
    const { QueryStore } = craftService(
      { name: 'QueryStore', providedIn: 'global' },
      function* () {
        return {
          user: yield* query(
            'user',
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
        };
      },
    );
    runInInjectionContext(() => {
      const store = craftUse(QueryStore());
      expect(store.user.pagination).toEqual({ page: 1 });
      expect(store.user.pagination).toBeDefined();
    });
  });

  it('should accept an Insertion, with the correct resource infer', async () => {
    const { QueryStore } = craftService(
      { name: 'QueryStore', providedIn: 'global' },
      function* () {
        return {
          user: yield* query(
            'user',
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
              // `toMatchTypeOf`, like the resourceById sibling below: the
              // context replaces `settledValue` with its yieldable counterpart,
              // so the ref is a structural superset rather than an equal.
              expectTypeOf(data.resource).toMatchTypeOf<
                YieldableReactiveProperties<
                  Omit<
                    CraftResourceRef<
                      NoInfer<{
                        id: string;
                        name: string;
                        email: string;
                      }>,
                      string,
                      'user'
                    >,
                    'settledValue'
                  >
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
        };
      },
    );
    runInInjectionContext(() => {
      const store = craftUse(QueryStore());
      expect(store.user.pagination).toEqual({ page: 1 });
      expect(store.user.pagination).toBeDefined();
    });
  });

  it('should accept an Insertion, with the correct resourceById infer', async () => {
    const { QueryStore } = craftService(
      { name: 'QueryStore', providedIn: 'global' },
      function* () {
        return {
          user: yield* query(
            'user',
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
              expectTypeOf(data.resourceById).toMatchTypeOf<
                YieldableReactiveProperties<
                  ResourceByIdRef<
                    string,
                    NoInfer<{
                      id: string;
                      name: string;
                      email: string;
                    }>,
                    string
                  >
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
        };
      },
    );
    runInInjectionContext(() => {
      const store = craftUse(QueryStore());
      expect(store.user.pagination).toEqual({ page: 1 });
      expect(store.user.pagination).toBeDefined();
    });
  });

  it('should accept an insertion output, that appear in the store', async () => {
    const { QueryStore } = craftService(
      { name: 'QueryStore', providedIn: 'global' },
      function* () {
        return {
          user: yield* query(
            'user',
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
        };
      },
    );
    runInInjectionContext(() => {
      const store = craftUse(QueryStore());
      expectTypeOf(store.user.pagination).toEqualTypeOf<{
        page: number;
      }>();
      expect(store.user.pagination).toBeDefined();
    });
  });
  it('should accept multiple insertions, that appear in the store', async () => {
    const { QueryStore } = craftService(
      { name: 'QueryStore', providedIn: 'global' },
      function* () {
        return {
          user: yield* query(
            'user',
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
            (context) =>
              craftPipe(
                context,
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
          ),
        };
      },
    );
    runInInjectionContext(() => {
      const store = craftUse(QueryStore());
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
  it('should accept seven insertions, all outputs appear in the store', async () => {
    const { QueryStore } = craftService(
      { name: 'QueryStore', providedIn: 'global' },
      function* () {
        return {
          user: yield* query(
            'user',
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
            (context) =>
              craftPipe(
                context,
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
          ),
        };
      },
    );
    runInInjectionContext(() => {
      const store = craftUse(QueryStore());
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

  it('typing: exposes exceptions in insertions context', async () => {
    runInInjectionContext(() => {
      const shouldFail = signal(true);

      craftUse(
        query(
          'user',
          {
            params: () =>
              shouldFail()
                ? craftException(
                    { _tag: 'INVALID_USER_ID' },
                    { reason: 'missing' as const },
                  )
                : 'user-1',
            loader: async ({ params }) => {
              return shouldFail()
                ? craftException(
                    { _tag: 'INVALID_USER_ID' },
                    { reason: 'missing' as const },
                  )
                : {
                    id: params,
                    name: 'John Doe',
                    email: 'test@a.com',
                  };
            },
          },
          function* ({ exceptions, hasException, state, resourceParamsSrc }) {
            const _state = yield* state();
            expectTypeOf(_state).toEqualTypeOf<{
              id: string;
              name: string;
              email: string;
            }>();
            const _resourceParamsSrc = craftUse(resourceParamsSrc());
            expectTypeOf(_resourceParamsSrc).toEqualTypeOf<
              string | undefined
            >();
            const _hasException = yield* hasException();
            expectTypeOf(_hasException).toEqualTypeOf<boolean>();
            const _exceptions4 = yield* exceptions();
            expectTypeOf(_exceptions4).toEqualTypeOf<{
              list: (
                | CraftExceptionResult<
                    {
                      _tag: 'INVALID_USER_ID';
                      scope: 'params';
                    },
                    {
                      reason: 'missing';
                    }
                  >
                | CraftExceptionResult<
                    {
                      _tag: 'INVALID_USER_ID';
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
                      _tag: 'INVALID_USER_ID';
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
                      _tag: 'INVALID_USER_ID';
                      scope: 'loader';
                    },
                    {
                      reason: 'missing';
                    }
                  >
                | undefined;
            }>();
            expectTypeOf(exceptions).toBeFunction();
            const _exceptions3 = yield* exceptions();
            expectTypeOf(_exceptions3).toHaveProperty('list').toBeArray();
            const _exceptions2 = yield* exceptions();
            expectTypeOf(_exceptions2).toHaveProperty('params');
            const _exceptions = yield* exceptions();
            expectTypeOf(_exceptions).toHaveProperty('loader');
            return {};
          },
        ),
      );
    });
  });

  it('typing: captures exception returned by params and loader ', async () => {
    await runInInjectionContext(async () => {
      const shouldFail = signal(true);
      const queryRef = craftUse(
        query('queryRef', {
          params: () =>
            shouldFail()
              ? craftException(
                  { _tag: 'INVALID_USER_ID' },
                  { reason: 'missing' as const },
                )
              : 'user-1',
          loader: async ({ params }) => {
            return shouldFail()
              ? craftException(
                  { _tag: 'INVALID_USER_ID' },
                  { reason: 'missing' as const },
                )
              : {
                  id: params,
                  name: 'John Doe',
                  email: 'test@a.com',
                };
          },
        }),
      );

      await vi.runAllTimersAsync();
      expectTypeOf(craftUse(queryRef.exceptions()).list).toEqualTypeOf<
        (
          | CraftExceptionResult<
              {
                _tag: 'INVALID_USER_ID';
                scope: 'params';
              },
              {
                reason: 'missing';
              }
            >
          | CraftExceptionResult<
              {
                _tag: 'INVALID_USER_ID';
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
    await runInInjectionContext(async () => {
      const shouldFail = signal(true);
      const queryRef = craftUse(
        query('queryRef', {
          params: () =>
            shouldFail()
              ? craftException(
                  { _tag: 'INVALID_USER_ID' },
                  { reason: 'missing' as const },
                )
              : 'user-1',
          identifier: (id: 'user-1') => id,
          loader: async ({ params }) => {
            return shouldFail()
              ? craftException(
                  {
                    _tag: 'API_ERROR',
                  },
                  { reason: 'missing user' as const },
                )
              : {
                  id: params,
                  name: 'John Doe',
                  email: 'test@a.com',
                };
          },
        }),
      );

      await vi.runAllTimersAsync();
      expectTypeOf(craftUse(queryRef.exceptions()).list).toEqualTypeOf<
        (
          | CraftExceptionResult<
              {
                _tag: 'INVALID_USER_ID';
                scope: 'params';
              },
              {
                reason: 'missing';
              }
            >
          | CraftExceptionResult<
              {
                _tag: 'API_ERROR';
                scope: 'loader';
                identifier: 'user-1';
              },
              {
                reason: 'missing user';
              }
            >
        )[]
      >();
      expectTypeOf(craftUse(queryRef.exceptions()).params).toEqualTypeOf<
        | CraftExceptionResult<
            {
              _tag: 'INVALID_USER_ID';
              scope: 'params';
            },
            {
              reason: 'missing';
            }
          >
        | undefined
      >();
      expectTypeOf(craftUse(queryRef.exceptions()).loader).toEqualTypeOf<
        Partial<
          Record<
            'user-1',
            CraftExceptionResult<
              {
                _tag: 'API_ERROR';
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
    await runInInjectionContext(async () => {
      const shouldFail = signal(true);
      const queryRef = craftUse(
        query('queryRef', {
          params: () =>
            shouldFail()
              ? craftException(
                  { _tag: 'INVALID_USER_ID' },
                  { reason: 'missing' as const },
                )
              : ('user-1' as string),
          identifier: (id: string) => id,
          loader: async ({ params }) => {
            return shouldFail()
              ? shouldFail()
                ? craftException(
                    {
                      _tag: 'API_ERROR',
                      scope: 'loader',
                    },
                    { reason: 'missing1' as const },
                  )
                : craftException(
                    {
                      _tag: 'API_ERROR',
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
        }),
      );

      await vi.runAllTimersAsync();

      expectTypeOf(craftUse(queryRef.exceptions()).loader).toEqualTypeOf<
        Partial<
          Record<
            string,
            | CraftExceptionResult<
                {
                  _tag: 'API_ERROR';
                  scope: 'loader';
                  identifier: string;
                },
                {
                  reason: 'missing1';
                }
              >
            | CraftExceptionResult<
                {
                  _tag: 'API_ERROR';
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

      expectTypeOf(
        queryRef.select('')
          ? craftUse(queryRef.select('')!.exceptions()).loader
          : undefined,
      ).toEqualTypeOf<
        | CraftExceptionResult<
            {
              _tag: 'API_ERROR';
              scope: 'loader';
              identifier: string;
            },
            {
              reason: 'missing1';
            }
          >
        | CraftExceptionResult<
            {
              _tag: 'API_ERROR';
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
    await runInInjectionContext(async () => {
      const shouldFail = signal(true);
      const loader = vi.fn(async ({ params }: { params: string }) => ({
        id: params,
      }));

      const queryRef = craftUse(
        query('queryRef', {
          params: () =>
            shouldFail()
              ? craftException(
                  { _tag: 'INVALID_USER_ID' },
                  { reason: 'missing' as const },
                )
              : 'user-1',
          loader: loader as any,
        }),
      );

      await vi.runAllTimersAsync();
      expect(loader).not.toHaveBeenCalled();
      expect(craftUse(queryRef.resourceParamsSrc())).toBeUndefined();
      expect(craftUse(queryRef.hasException())).toBe(true);
      expect(craftUse(queryRef.status())).toBe('exception');
      expect(craftUse(queryRef.exception())).toBe(
        craftUse(queryRef.exceptions()).list[0],
      );
      expect(craftUse(queryRef.exceptions()).params?.payload.reason).toEqual(
        'missing',
      );

      shouldFail.set(false);
      await vi.runAllTimersAsync();

      expect(craftUse(queryRef.exceptions()).params).toEqual({});
      expect(craftUse(queryRef.hasException())).toBe(false);
      expect(craftUse(queryRef.exception())).toBeUndefined();

      expect(craftUse(queryRef.status())).toBe('resolved');
    });
  });

  it('captures exception returned by loader without exposing a value', async () => {
    await runInInjectionContext(async () => {
      const queryRef = craftUse(
        query('queryRef', {
          params: () => 'user-1',
          loader: async () =>
            craftException(
              { _tag: 'INVALID_USER_ID', scope: 'loader' },
              { from: 'loader' as const },
            ),
        }),
      );

      await vi.runAllTimersAsync();

      expect(craftUse(queryRef.exceptions()).loader?.INVALID_USER_ID).toEqual({
        from: 'loader',
      });
      expect(craftUse(queryRef.value())).toBeUndefined();
      expect(craftUse(queryRef.hasException())).toBe(true);
      // Returning a `craftException` from the loader flips the craft status to
      // `'exception'` and exposes the primary exception via `exception()`.
      expect(craftUse(queryRef.status())).toBe('exception');
      expect(craftUse(queryRef.exception())).toBe(
        craftUse(queryRef.exceptions()).list[0],
      );
      expect(craftUse(queryRef.exception())?._tag).toBe('INVALID_USER_ID');
    });
  });

  it('captures exception returned by method and does not trigger loader', async () => {
    await runInInjectionContext(async () => {
      const loader = vi.fn(async ({ params }: { params: string }) => ({
        id: params,
      }));
      const queryRef = craftUse(
        query('queryRef', {
          method: (value: string) =>
            value.length < 3
              ? craftException(
                  { _tag: 'SEARCH_TERM_TOO_SHORT' },
                  { min: 3, received: value.length },
                )
              : value,
          loader: loader as any,
        }),
      );

      queryRef.call('ab');
      await vi.runAllTimersAsync();

      expect(loader).not.toHaveBeenCalled();
      expect(craftUse(queryRef.resourceParamsSrc())).toBeUndefined();
      expect(craftUse(queryRef.exceptions()).list[0]?.payload).toEqual({
        min: 3,
        received: 2,
      });
    });
  });

  it.todo('captures and auto-clears computedInsertion exceptions', () => {
    runInInjectionContext(() => {
      const shouldFail = signal(true);
      const queryRef = craftUse(
        query(
          'queryRef',
          {
            params: () => 'x',
            loader: async () => ({ id: 'x' }),
          },
          () => ({
            computedFailure: computed(() =>
              shouldFail()
                ? craftException(
                    { _tag: 'COMPUTED_FAILURE' },
                    { from: 'computed' as const },
                  )
                : undefined,
            ),
          }),
        ),
      );

      expect(craftUse(queryRef.computedFailure())).toBeUndefined();
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
    runInInjectionContext(() => {
      const shouldFail = signal(true);
      const queryRef = craftUse(
        query(
          'queryRef',
          {
            params: () => 'x',
            loader: async () => ({ id: 'x' }),
          },
          () => ({
            validateName: () =>
              shouldFail()
                ? craftException(
                    { _tag: 'PARAM_VALUE_MISMATCH' },
                    { expected: 'x', actual: 'y' },
                  )
                : undefined,
          }),
        ),
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

  it('maps loader exceptions by identifier only when identifier is provided on the exception', async () => {
    await runInInjectionContext(async () => {
      const current = signal<'A' | 'B'>('A');
      const queryRef = craftUse(
        query('queryRef', {
          params: () => current(),
          identifier: (id: 'A' | 'B') => id,
          loader: async ({ params }) =>
            craftException({ _tag: 'PARSE_FAILED' }, { params }),
        }),
      );

      await vi.runAllTimersAsync();
      expect(craftUse(queryRef.exceptions()).loader['A']?.payload).toEqual({
        params: 'A',
      });
      expect(craftUse(queryRef.exceptions()).loader['A']?.identifier).toBe('A');

      current.set('B');
      await vi.runAllTimersAsync();

      // The 'A' exception stays mapped under its identifier while 'B' fails too.
      expect(craftUse(queryRef.exceptions()).loader['A']).toBeDefined();
      expect(
        craftUse(queryRef.exceptions()).list.some(
          (item) => item.identifier === 'A',
        ),
      ).toBe(true);
      expect(
        craftUse(queryRef.exceptions()).list.some(
          (item) => item.identifier === 'B',
        ),
      ).toBe(true);
    });
  });

  it('keeps params exceptions global in parallel query', async () => {
    await runInInjectionContext(async () => {
      const current = signal<'A' | 'B'>('A');
      const queryRef = craftUse(
        query('queryRef', {
          params: () =>
            current()
              ? craftException({ _tag: 'INVALID_ID' }, { params: current() })
              : current(),
          identifier: (id: 'A' | 'B') => id,
          loader: async ({ params }) => ({ id: params }),
        }),
      );

      await vi.runAllTimersAsync();

      expect(craftUse(queryRef.exceptions()).params?.payload).toEqual({
        params: 'A',
      });
      expect(craftUse(queryRef.exceptions()).loader).toEqual({});
      expect(craftUse(queryRef.hasException())).toBe(true);
    });
  });

  it('exposes typed exception accessors from params and insertions', async () => {
    runInInjectionContext(() => {
      const current = signal<'A' | 'B'>('A');
      const queryRef = craftUse(
        query(
          'queryRef',
          {
            params: () =>
              current()
                ? craftException(
                    { _tag: 'PARAM_VALUE_MISMATCH' },
                    { from: 'params' as const },
                  )
                : current(),
            loader: async ({ params }) => ({ id: params }),
          },
          () => ({
            computedFailure: computed(() =>
              craftException(
                { _tag: 'COMPUTED_VALUE_MISMATCH' },
                { from: 'insertion-1' as const },
              ),
            ),
            validate: () =>
              craftException(
                { _tag: 'METHOD_VALUE_MISMATCH' },
                { value: 'x' as string },
              ),
          }),
        ),
      );

      expectTypeOf(
        craftUse(queryRef.exceptions()).params?.PARAM_VALUE_MISMATCH,
      ).toEqualTypeOf<{ from: 'params' } | undefined>();
    });
  });
});

describe('query — providers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes the query runtime context to insertion method wrappers', async () => {
    let runtimeContext: QueryMethodRuntimeContext | undefined;
    let observedRuntimeContext: QueryMethodRuntimeContext | undefined;
    const runtimeContextWrapper = provideFnWrapper(
      'Warning: dependency injection here is not type-safe and may fail at runtime',
      function* (factory, thisArg, args) {
        runtimeContext = injectQueryMethodRuntimeContext() ?? runtimeContext;
        return yield* factory.apply(thisArg, args);
      },
    );

    runInInjectionContext(() => {
      const queryRef = craftUse(
        query(
          'queryRef',
          {
            providers: [
              runtimeContextWrapper,
              provideFnWrapObserver(() => {
                observedRuntimeContext =
                  injectQueryMethodRuntimeContext() ?? observedRuntimeContext;
              }),
            ],
            params: () => 'initial',
            loader: async () => ({ count: 0 }),
          },
          ({ set }) => ({
            initialize: () => set({ count: 1 }),
          }),
        ),
      );

      expect(observedRuntimeContext?.kind).toBe('query');
      queryRef.initialize();

      expect(runtimeContext?.kind).toBe('query');
      expect(runtimeContext?.get()).toEqual({ count: 1 });
      expect(runtimeContext?.originalSource).toContain('count: 1');
      runtimeContext?.patch(() => ({ count: 10 }));
      expect(runtimeContext?.get()).toEqual({ count: 10 });
    });
  });

  it('exposes the root query resource context to runtime observers', async () => {
    let resourceContext: PrimitiveResourceRuntimeContext | undefined;

    runInInjectionContext(() => {
      const queryRef = craftUse(
        query('queryRef', {
          providers: [
            providePrimitiveResourceRuntimeObserver((context) => {
              resourceContext = context;
            }),
          ],
          params: () => 'initial',
          loader: async () => ({ count: 0 }),
        }),
      );

      expect(resourceContext?.kind).toBe('query');
      expect(resourceContext?.grouped).toBe(false);
      resourceContext?.set({ count: 1 });
      expect(resourceContext?.get()).toEqual({ count: 1 });
      resourceContext?.patch(() => ({ count: 2 }));
      expect(craftUse(queryRef.value())).toEqual({ count: 2 });
    });
  });

  it('exposes selected query resource instances to runtime observers', async () => {
    let resourceContext: PrimitiveResourceRuntimeContext | undefined;

    runInInjectionContext(() => {
      const queryRef = craftUse(
        query('queryRef', {
          providers: [
            providePrimitiveResourceRuntimeObserver((context) => {
              resourceContext = context;
            }),
          ],
          method: (id: string) => ({ id }),
          identifier: (params: { id: string }) => params.id,
          loader: async ({ params }) => ({ id: params.id, name: 'server' }),
        }),
      );

      expect(resourceContext?.kind).toBe('query');
      expect(resourceContext?.grouped).toBe(true);
      resourceContext?.set({ id: 'page-1', name: 'local' }, 'page-1');
      expect(resourceContext?.ids()).toEqual(['page-1']);
      expect(resourceContext?.get('page-1')).toEqual({
        id: 'page-1',
        name: 'local',
      });

      resourceContext?.update(
        (current) => ({ ...(current as object), name: 'updated' }),
        'page-1',
      );
      expect(craftUse(queryRef.select('page-1')?.value())).toEqual({
        id: 'page-1',
        name: 'updated',
      });
    });
  });

  it('requires update rather than patch for an array query value', async () => {
    let resourceContext: PrimitiveResourceRuntimeContext | undefined;

    runInInjectionContext(() => {
      craftUse(
        query('user', {
          providers: [
            providePrimitiveResourceRuntimeObserver((context) => {
              resourceContext = context;
            }),
          ],
          params: () => 'initial',
          loader: async () => [],
        }),
      );

      resourceContext?.set([{ id: '1', name: 'Romain' }]);
      expect(() => resourceContext?.patch(() => ({}))).toThrow(
        'use update to replace arrays or primitives',
      );
      resourceContext?.update((current) =>
        (current as User[]).map((user) => ({ ...user, name: 'Simon' })),
      );
      expect(resourceContext?.get()).toEqual([{ id: '1', name: 'Simon' }]);
    });
  });

  it('providers are applied to query loader generator', async () => {
    const callLog: string[] = [];
    const trackingWrapper: FnWrapper = function* (factory, thisArg, args) {
      callLog.push('loader');
      return yield* (
        factory as (...a: unknown[]) => Generator<unknown, unknown, unknown>
      ).apply(thisArg as object, args);
    };

    await runInInjectionContext(async () => {
      runInInjectionContext(() =>
        craftUse(
          query('user', {
            providers: [
              provideFnWrapper(
                'Warning: dependency injection here is not type-safe and may fail at runtime',
                trackingWrapper,
              ),
            ],
            params: () => 'user-1',
            loader: async ({ params }) => ({ id: params }),
          }),
        ),
      );

      await vi.runAllTimersAsync();
      expect(callLog).toContain('loader');
    });
  });

  it('providers scoped to one query do not affect a sibling query', async () => {
    const callLog: string[] = [];
    const trackingWrapper: FnWrapper = function* (factory, thisArg, args) {
      callLog.push('called');
      return yield* (
        factory as (...a: unknown[]) => Generator<unknown, unknown, unknown>
      ).apply(thisArg as object, args);
    };

    await runInInjectionContext(async () => {
      // Create withoutProvider first — its load should NOT call trackingWrapper
      craftUse(
        query('user', {
          params: () => 'user-1',
          loader: async ({ params }) => ({ id: params }),
        }),
      );
      await vi.runAllTimersAsync();
      expect(callLog).toEqual([]);

      // Now create withProvider — its load SHOULD call trackingWrapper
      runInInjectionContext(() =>
        craftUse(
          query('user', {
            providers: [
              provideFnWrapper(
                'Warning: dependency injection here is not type-safe and may fail at runtime',
                trackingWrapper,
              ),
            ],
            params: () => 'user-1',
            loader: async ({ params }) => ({ id: params }),
          }),
        ),
      );
      await vi.runAllTimersAsync();
      expect(callLog.length).toBeGreaterThan(0);
    });
  });

  it('typing: query accepts BrandedServiceProvider in providers without type errors', async () => {
    const { QueryService, provideQueryService } = craftService(
      { name: 'QueryService', providedIn: 'toProvide' },
      () => ({ getValue: () => 42 }),
    );

    runInInjectionContext(() => {
      const withoutProviders = craftUse(
        query('withoutProviders', {
          params: () => 'user-1',
          loader: function* ({ params }) {
            yield* QueryService();
            return Promise.resolve({ id: params });
          },
        }),
      );
      type WithoutDeps = ExtractDeps<typeof withoutProviders>;
      expectTypeOf<
        'QueryService' extends keyof WithoutDeps ? true : false
      >().toEqualTypeOf<true>();

      const withProviders = craftUse(
        query('withProviders', {
          providers: [provideQueryService()],
          params: () => 'user-1',
          loader: async ({ params }) => ({ id: params }),
        }),
      );
      expectTypeOf(withProviders.hasValue).toBeFunction();
    });
  });
});

describe('query — loader programs (async pump)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
  });

  const userNotFound = craftGen(function* (userId: string) {
    return craftException({ _tag: 'USER_NOT_FOUND' }, { userId });
  });

  it('resolves a generator loader suspended on an craftUntilSettled promise await', async () => {
    await runInInjectionContext(async () => {
      const queryRef = craftUse(
        query('queryRef', {
          params: () => 'user-1',
          loader: function* ({ params }) {
            const user = yield* craftUntilSettled(
              (function* () {
                return Promise.resolve({
                  id: params,
                  name: 'Jane Doe',
                  email: 'jane@doe.com',
                });
              })(),
            );
            return user;
          },
        }),
      );

      await vi.runAllTimersAsync();

      expect(craftUse(queryRef.status())).toBe('resolved');
      expect(craftUse(queryRef.value())?.id).toBe('user-1');
    });
  });

  it('surfaces an uncaught program short-circuit as the loader exception', async () => {
    await runInInjectionContext(async () => {
      const queryRef = craftUse(
        query('queryRef', {
          params: () => 'user-1',
          loader: function* ({ params }) {
            yield* userNotFound(params);
            return { id: params, name: 'never', email: 'never@x.com' };
          },
        }),
      );

      await vi.runAllTimersAsync();

      // No technical rethrow: the short-circuit feeds the exception channel.
      expect(craftUse(queryRef.status())).toBe('exception');
      expect(craftUse(queryRef.hasException())).toBe(true);
      expect(craftUse(queryRef.exception())?._tag).toBe('USER_NOT_FOUND');
      expect(craftUse(queryRef.exception())?.payload).toEqual({
        userId: 'user-1',
      });
      expect(craftUse(queryRef.value())).toBeUndefined();
    });
  });

  it('recovers through .pipe(catchTag(...)) inside a generator loader', async () => {
    await runInInjectionContext(async () => {
      const queryRef = craftUse(
        query('queryRef', {
          params: () => 'user-1',
          loader: function* ({ params }) {
            return yield* userNotFound(params).pipe(
              catchTag('USER_NOT_FOUND', function* () {
                return { id: 'guest', name: 'Guest', email: 'guest@x.com' };
              }),
            );
          },
        }),
      );

      await vi.runAllTimersAsync();

      expect(craftUse(queryRef.status())).toBe('resolved');
      expect(craftUse(queryRef.hasException())).toBe(false);
      expect(craftUse(queryRef.value())?.id).toBe('guest');
    });
  });

  it('retries a flaky program across the backoff await', async () => {
    let calls = 0;
    const flakyUser = craftGen(function* (userId: string) {
      calls += 1;
      if (calls < 3) return craftException({ _tag: 'FLAKY' });
      return { id: userId, name: 'Jane Doe', email: 'jane@doe.com' };
    });

    await runInInjectionContext(async () => {
      const queryRef = craftUse(
        query('queryRef', {
          params: () => 'user-1',
          loader: function* ({ params }) {
            return yield* flakyUser(params).pipe(
              retry({ times: 3, backoff: 'exponential', delayMs: 5 }),
            );
          },
        }),
      );

      await vi.runAllTimersAsync();

      expect(calls).toBe(3);
      expect(craftUse(queryRef.status())).toBe('resolved');
      expect(craftUse(queryRef.value())?.id).toBe('user-1');
    });
  });
});

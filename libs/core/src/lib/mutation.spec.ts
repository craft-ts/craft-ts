import { Signal, WritableSignal, signal } from '@angular/core';
import { CraftResourceStatus } from './util/craft-resource-status';
import { afterRecomputation } from './after-recomputation';
import { signalSource } from './signal-source';
import { ReadonlySource } from './util/source.type';
import { TestBed } from '@angular/core/testing';
import { Equal, Expect } from 'test-type';
import { mutation, MutationOutput } from './mutation';
import { craftException, CraftExceptionResult } from './craft-exception';
import { craftService } from './craft-service';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import type { ExtractDeps } from './branded-component/branded-component';
import type { GetServiceDependencies } from './craft-service';
import {
  provideFnWrapObserver,
  provideFnWrapper,
  type FnWrapper,
} from './fn-wrapper';
import { CraftHttpClient } from './craft-http-client';
import {
  injectMutationMethodRuntimeContext,
  type MutationMethodRuntimeContext,
} from './primitive-method-runtime-context';
import {
  providePrimitiveResourceRuntimeObserver,
  type PrimitiveResourceRuntimeContext,
} from './primitive-resource-runtime-context';
import { craftUse } from './craft-use';

type EmptyMutationExceptions = {
  hasException: Signal<boolean>;
  exceptions: Signal<{
    list: never[];
    params?: never;
    loader?: never;
  }>;
};

function removeMutate<T extends object>(resource: T): Omit<T, 'mutate'> {
  const { mutate: _mutate, ...rest } = resource as T & { mutate?: unknown };
  return rest as Omit<T, 'mutate'>;
}

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

describe('mutation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });
  it('should enable to define a mutation that can be call with the method', async () => {
    await TestBed.runInInjectionContext(async () => {
      const mutationInstance = craftUse(mutation('mutationInstance', {
          method: ({
            timeToWait,
            searchChange,
          }: {
            timeToWait: number;
            searchChange: string;
          }) => ({
            timeToWait,
            searchChange,
          }),
          loader: async ({ params: { timeToWait, searchChange } }) => {
            type ExpectTimeToWait = Expect<Equal<typeof timeToWait, number>>;
            type ExpectSearchChange = Expect<
              Equal<typeof searchChange, string>
            >;
            await new Promise((resolve) => setTimeout(resolve, timeToWait));
            return { searchChange };
          },
        }),
      );

      expect(mutationInstance.status()).toBe('idle');
      mutationInstance.mutate({
        searchChange: 'test',
        timeToWait: 1000,
      });
      expect(mutationInstance.status()).toBe('loading');
      await vi.runAllTimersAsync();
      expect(mutationInstance.status()).toBe('resolved');
      expect(mutationInstance.value()).toEqual({ searchChange: 'test' });
    });
  });

  it('should enable to define async method bind to a source', async () => {
    await TestBed.runInInjectionContext(async () => {
      const searchSource = signalSource<{
        searchChange: string;
        timeToWait: number;
      }>('searchSource');
      const test = afterRecomputation(
        searchSource,
        (searchConfig) => searchConfig,
      );
      const result = test();
      const myMutation = craftUse(mutation('myMutation', {
          method: afterRecomputation(
            searchSource,
            (searchConfig) => searchConfig,
          ),
          loader: async ({ params: { timeToWait, searchChange } }) => {
            type ExpectTimeToWait = Expect<Equal<typeof timeToWait, number>>;
            type ExpectSearchChange = Expect<
              Equal<typeof searchChange, string>
            >;
            await new Promise((resolve) => setTimeout(resolve, timeToWait));
            return { searchChange };
          },
        }),
      );

      expect(myMutation.status()).toBe('idle');
      expectTypeOf(myMutation.source).toEqualTypeOf<
        ReadonlySource<{
          searchChange: string;
          timeToWait: number;
        }>
      >();
      searchSource.set({
        searchChange: 'test',
        timeToWait: 1000,
      });
      await vi.advanceTimersByTimeAsync(100);
      expect(myMutation.status()).toBe('loading');
      await vi.runAllTimersAsync();
      expect(myMutation.status()).toBe('resolved');
      expect(myMutation.value()).toEqual({ searchChange: 'test' });
    });
  });

  it('should return undefined with value when status is error', async () => {
    await TestBed.runInInjectionContext(async () => {
      const mutationInstance = craftUse(mutation('mutationInstance', {
          method: (shouldFail: boolean) => shouldFail,
          loader: async ({ params: shouldFail }) => {
            if (shouldFail) {
              throw new Error('Test error');
            }
            return { success: true };
          },
        }),
      );

      expect(mutationInstance.status()).toBe('idle');
      mutationInstance.mutate(true);
      expect(mutationInstance.status()).toBe('loading');
      await vi.runAllTimersAsync();
      // A thrown (technical) error surfaces as the craft `'exception'` status.
      expect(mutationInstance.status()).toBe('exception');
      expect(mutationInstance.hasValue()).toBe(false);

      // value should return undefined without throwing
      expect(mutationInstance.value()).toBeUndefined();
    });
  });

  it('typing: tracks generator dependencies from method, loader and insertions', () => {
    const { MutationParams } = craftService(
      { name: 'MutationParams', scope: 'global' },
      () => ({
        mapUserId: (userId: string): string => userId.trim(),
      }),
    );
    const { MutationApi } = craftService(
      { name: 'MutationApi', scope: 'global' },
      () => ({
        save: (userId: string): Promise<{ userId: string }> =>
          Promise.resolve({ userId }),
      }),
    );
    const { MutationTools } = craftService(
      { name: 'MutationTools', scope: 'global' },
      () => ({
        label: (): string => 'save-user',
      }),
    );

    TestBed.runInInjectionContext(() => {
      const mutationRef = craftUse(mutation(
          'mutationRef',
          {
            method: function* (userId: string) {
              const paramsMapper = yield* MutationParams();
              return paramsMapper.mapUserId(userId);
            },
            loader: function* ({ params }) {
              const api = yield* MutationApi();
              return api.save(params);
            },
          },
          function* () {
            const tools = yield* MutationTools();
            return {
              mutationLabel: tools.label(),
            };
          },
        ),
      );

      expectTypeOf<ExtractDeps<typeof mutationRef>>().toEqualTypeOf<{
        MutationParams: GetServiceDependencies<typeof MutationParams>;
        MutationApi: GetServiceDependencies<typeof MutationApi>;
        MutationTools: GetServiceDependencies<typeof MutationTools>;
      }>();
    });
  });

  it('should resolve generator method, loader and insertions', async () => {
    const logs: string[] = [];
    const { MutationLoggerRuntime } = craftService(
      { name: 'MutationLoggerRuntime', scope: 'global' },
      () => ({
        log: (message: string) => {
          logs.push(message);
        },
      }),
    );
    const { MutationApiRuntime } = craftService(
      { name: 'MutationApiRuntime', scope: 'global' },
      () => ({
        save: async (userId: string): Promise<{ userId: string }> => ({
          userId,
        }),
      }),
    );

    await TestBed.runInInjectionContext(async () => {
      const mutationRef = craftUse(mutation(
          'mutationRef',
          {
            method: function* (userId: string) {
              const logger = yield* MutationLoggerRuntime();
              logger.log(`mutate:${userId}`);
              return userId;
            },
            loader: function* ({ params }) {
              const api = yield* MutationApiRuntime();
              return api.save(params);
            },
          },
          function* () {
            const logger = yield* MutationLoggerRuntime();
            logger.log('insert:init');
            return {
              initialized: true,
            };
          },
        ),
      );

      mutationRef.mutate('user-1');
      await vi.runAllTimersAsync();

      expect(mutationRef.initialized).toBe(true);
      expect(mutationRef.value()).toEqual({ userId: 'user-1' });
      expect(logs).toEqual(['insert:init', 'mutate:user-1']);
    });
  });
});

describe('mutation types without identifier', () => {
  it('should infer correctly the types of mutation', () => {
    TestBed.runInInjectionContext(() => {
      const { Mutations } = craftService(
        { name: 'Mutations', scope: 'function' },
        () => {
          const searchChange = craftUse(mutation('searchChange', {
              method: ({
                timeToWait,
                searchChange,
              }: {
                timeToWait: number;
                searchChange: string;
              }) => ({
                timeToWait,
                searchChange,
              }),
              loader: async ({ params: { timeToWait, searchChange } }) => {
                type ExpectTimeToWait = Expect<
                  Equal<typeof timeToWait, number>
                >;
                type ExpectSearchChange = Expect<
                  Equal<typeof searchChange, string>
                >;
                await new Promise((resolve) => setTimeout(resolve, timeToWait));
                return { searchChange };
              },
            }),
          );
          const filterChange = craftUse(mutation(
              'filterChange',
              {
                method: ({ filter }: { filter: string }) => ({
                  filter,
                }),
                loader: async ({ params: { filter } }) => {
                  await new Promise((resolve) => setTimeout(resolve, 1000));
                  return { filter };
                },
              },
              () => ({
                additionalInsertion: 'injectedValue' as const,
              }),
            ),
          );

          return {
            props: {
              searchChange: removeMutate(searchChange),
              filterChange: removeMutate(filterChange),
            },
            methods: {
              mutateSearchChange: (args: {
                timeToWait: number;
                searchChange: string;
              }) => {
                searchChange.mutate(args);
                return args;
              },
              mutateFilterChange: (args: { filter: string }) => {
                filterChange.mutate(args);
                return args;
              },
            },
          };
        },
      );

      const mutationsOutput = craftUse(Mutations());
      expect(mutationsOutput.props.searchChange.kind).toBe('mutation');

      type props = (typeof mutationsOutput)['props'];
      expectTypeOf<props>().toEqualTypeOf<{
        searchChange: {
          '~InternalType': 'Used to avoid TS type erasure';
          readonly value: Signal<
            | {
                searchChange: string;
              }
            | undefined
          >;
          readonly status: Signal<CraftResourceStatus>;
          readonly isLoading: Signal<boolean>;
          hasValue: () => boolean;
          readonly resourceParamsSrc: WritableSignal<
            NoInfer<{
              timeToWait: number;
              searchChange: string;
            }>
          >;
          type: 'resourceLike';
          kind: 'mutation';
        };
        filterChange: {
          '~InternalType': 'Used to avoid TS type erasure';
          readonly value: Signal<
            | {
                filter: string;
              }
            | undefined
          >;
          readonly status: Signal<CraftResourceStatus>;
          readonly isLoading: Signal<boolean>;
          hasValue: () => boolean;
          readonly resourceParamsSrc: WritableSignal<
            NoInfer<{
              filter: string;
            }>
          >;
          additionalInsertion: 'injectedValue';
          type: 'resourceLike';
          kind: 'mutation';
        };
      }>();

      type methods = (typeof mutationsOutput)['methods'];
      expectTypeOf<methods>().toMatchTypeOf<
        {
          mutateSearchChange: (args: {
            timeToWait: number;
            searchChange: string;
          }) => {
            timeToWait: number;
            searchChange: string;
          };
        } & {
          mutateFilterChange: (args: { filter: string }) => {
            filter: string;
          };
        }
      >();
    });
  });

  it('should infer correctly the mutation bind to a source type, and not exposed the method bind to a source', () => {
    TestBed.runInInjectionContext(() => {
      const searchSource = signalSource<{ searchChangeText: string }>(
        'searchSource',
      );
      const { Mutations } = craftService(
        { name: 'Mutations', scope: 'function' },
        () => {
          const searchChange = craftUse(mutation('searchChange', {
              method: afterRecomputation(searchSource, (searchChange) => {
                return searchChange;
              }),
              loader: async ({ params: { searchChangeText } }) => {
                type ExpectSearchChangeText = Expect<
                  Equal<typeof searchChangeText, string>
                >;
                await new Promise((resolve) => setTimeout(resolve, 1000));
                return { searchChangeText };
              },
            }),
          );
          const filterChange = craftUse(mutation(
              'filterChange',
              {
                method: ({ filter }: { filter: string }) => ({
                  filter,
                }),
                loader: async ({ params: { filter } }) => {
                  await new Promise((resolve) => setTimeout(resolve, 1000));
                  return { filter };
                },
              },
              () => ({
                additionalInsertion: 'injectedValue' as const,
              }),
            ),
          );

          return {
            props: {
              searchChange: removeMutate(searchChange),
              filterChange: removeMutate(filterChange),
            },
            methods: {
              mutateFilterChange: (args: { filter: string }) => {
                filterChange.mutate(args);
                return args;
              },
            },
          };
        },
      );

      const mutationsOutput = craftUse(Mutations());
      expect(mutationsOutput.props.filterChange.kind).toBe('mutation');

      type props = (typeof mutationsOutput)['props'];
      expectTypeOf<props>().toEqualTypeOf<{
        searchChange: {
          '~InternalType': 'Used to avoid TS type erasure';
          readonly value: Signal<
            | {
                searchChangeText: string;
              }
            | undefined
          >;
          readonly status: Signal<CraftResourceStatus>;
          readonly isLoading: Signal<boolean>;
          hasValue: () => boolean;
          readonly resourceParamsSrc: WritableSignal<
            NoInfer<
              | {
                  searchChangeText: string;
                }
              | undefined
            >
          >;
          source: ReadonlySource<{
            searchChangeText: string;
          }>;
          type: 'resourceLike';
          kind: 'mutation';
        };
        filterChange: {
          '~InternalType': 'Used to avoid TS type erasure';
          readonly value: Signal<
            | {
                filter: string;
              }
            | undefined
          >;
          readonly status: Signal<CraftResourceStatus>;
          readonly isLoading: Signal<boolean>;
          hasValue: () => boolean;
          readonly resourceParamsSrc: WritableSignal<
            NoInfer<{
              filter: string;
            }>
          >;
          additionalInsertion: 'injectedValue';
          type: 'resourceLike';
          kind: 'mutation';
        };
      }>();

      type methods = (typeof mutationsOutput)['methods'];
      //   ^?
      expectTypeOf<methods>().toEqualTypeOf<{
        mutateFilterChange: (args: { filter: string }) => {
          filter: string;
        };
      }>();
    });
  });

  it('should infer correctly the mutation bind to a method', () => {
    TestBed.runInInjectionContext(() => {
      const _mutationsOutput = craftUse(mutation('_mutationsOutput', {
          method: (searchChange: string) => {
            return searchChange;
          },
          loader: async ({ params: searchChange }) => {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return { searchChange };
          },
        }),
      );
      expectTypeOf<typeof _mutationsOutput>().toEqualTypeOf<
        MutationOutput<
          {
            searchChange: string;
          },
          string,
          string,
          string,
          unknown,
          {},
          {
            params: never;
            loader: never;
          }
        >
      >();
    });
  });

  it('should infer correctly the mutation bind to a source', () => {
    TestBed.runInInjectionContext(() => {
      const searchSource = signalSource<{ searchChange: string }>(
        'searchSource',
      );

      const _mutationsOutput = craftUse(mutation('_mutationsOutput', {
          method: afterRecomputation(searchSource, (searchChange) => {
            return searchChange;
          }),
          loader: async ({ params: searchChange }) => {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return { searchChangeResult: searchChange.searchChange };
          },
        }),
      );
      expectTypeOf<typeof _mutationsOutput>().toEqualTypeOf<
        MutationOutput<
          {
            searchChangeResult: string;
          },
          | {
              searchChange: string;
            }
          | undefined,
          unknown,
          {
            searchChange: string;
          },
          unknown,
          {},
          {
            params: never;
            loader: never;
          }
        >
      >();
    });
  });
});

describe('mutation types with identifier', () => {
  it('selectOrCreate returns an idle resource without changing select', () => {
    TestBed.runInInjectionContext(() => {
      const mutationRef = craftUse(mutation('mutationRef', {
        method: (id: string) => id,
        identifier: (id) => id,
        loader: async ({ params }) => ({ id: params }),
      }));

      expect(mutationRef.select('missing')).toBeUndefined();

      const selected = mutationRef.selectOrCreate('missing');
      expect(selected).toBeDefined();
      expect(selected.status()).toBe('idle');
      expect(mutationRef.select('missing')).toBeDefined();
    });
  });

  it('should infer correctly the types of mutation', () => {
    TestBed.runInInjectionContext(() => {
      const { Mutations } = craftService(
        { name: 'Mutations', scope: 'function' },
        () => {
          const searchChange = craftUse(mutation('searchChange', {
              method: ({
                timeToWait,
                searchChange,
              }: {
                timeToWait: number;
                searchChange: string;
              }) => ({
                timeToWait,
                searchChange,
              }),
              identifier: (params) => params.searchChange,
              loader: async ({ params: { timeToWait, searchChange } }) => {
                type ExpectTimeToWait = Expect<
                  Equal<typeof timeToWait, number>
                >;
                type ExpectSearchChange = Expect<
                  Equal<typeof searchChange, string>
                >;
                await new Promise((resolve) => setTimeout(resolve, timeToWait));
                return { searchChange };
              },
            }),
          );
          const filterChange = craftUse(mutation(
              'filterChange',
              {
                method: ({ filter }: { filter: string }) => ({
                  filter,
                }),
                loader: async ({ params: { filter } }) => {
                  await new Promise((resolve) => setTimeout(resolve, 1000));
                  return { filter };
                },
              },
              () => ({
                additionalInsertion: 'injectedValue' as const,
              }),
            ),
          );

          return {
            props: {
              searchChange: removeMutate(searchChange),
              filterChange: removeMutate(filterChange),
            },
            methods: {
              mutateSearchChange: (args: {
                timeToWait: number;
                searchChange: string;
              }) => {
                searchChange.mutate(args);
                return args;
              },
              mutateFilterChange: (args: { filter: string }) => {
                filterChange.mutate(args);
                return args;
              },
            },
          };
        },
      );

      const mutationsOutput = craftUse(Mutations());
      expect(mutationsOutput.props.searchChange.kind).toBe('mutation');

      type props = (typeof mutationsOutput)['props'];
      type s = props['searchChange'];

      const search = {} as ReturnType<s['select']>;
      expectTypeOf(search).toEqualTypeOf<
        | {
            readonly value: Signal<
              | {
                  searchChange: string;
                }
              | undefined
            >;
            readonly status: Signal<CraftResourceStatus>;
            readonly isLoading: Signal<boolean>;
            hasValue(): boolean;
          }
        | undefined
      >();

      type f = props['filterChange'];
      //.  ^?

      const filter = {} as f;
      expectTypeOf<typeof filter>().toEqualTypeOf<{
        '~InternalType': 'Used to avoid TS type erasure';
        readonly value: Signal<
          | {
              filter: string;
            }
          | undefined
        >;
        readonly status: Signal<CraftResourceStatus>;
        readonly isLoading: Signal<boolean>;
        hasValue: () => boolean;
        readonly resourceParamsSrc: WritableSignal<
          NoInfer<{
            filter: string;
          }>
        >;
        additionalInsertion: 'injectedValue';
        type: 'resourceLike';
        kind: 'mutation';
      }>();

      type methods = (typeof mutationsOutput)['methods'];
      expectTypeOf<methods>().toMatchTypeOf<
        {
          mutateSearchChange: (args: {
            timeToWait: number;
            searchChange: string;
          }) => {
            timeToWait: number;
            searchChange: string;
          };
        } & {
          mutateFilterChange: (args: { filter: string }) => {
            filter: string;
          };
        }
      >();
    });
  });

  it('should infer correctly the mutation bind to a source type, and not exposed the method bind to a source', () => {
    TestBed.runInInjectionContext(() => {
      const searchSource = signalSource<{ searchChangeText: string }>(
        'searchSource',
      );
      const { Mutations } = craftService(
        { name: 'Mutations', scope: 'function' },
        () => {
          const searchChange = craftUse(mutation('searchChange', {
              method: afterRecomputation(searchSource, (searchChange) => {
                return searchChange;
              }),
              identifier: (params) => params.searchChangeText,
              loader: async ({ params: { searchChangeText } }) => {
                type ExpectSearchChangeText = Expect<
                  Equal<typeof searchChangeText, string>
                >;
                await new Promise((resolve) => setTimeout(resolve, 1000));
                return { searchChangeText };
              },
            }),
          );
          const filterChange = craftUse(mutation(
              'filterChange',
              {
                method: ({ filter }: { filter: string }) => ({
                  filter,
                }),
                loader: async ({ params: { filter } }) => {
                  await new Promise((resolve) => setTimeout(resolve, 1000));
                  return { filter };
                },
              },
              () => ({
                additionalInsertion: 'injectedValue' as const,
              }),
            ),
          );

          return {
            props: {
              searchChange: removeMutate(searchChange),
              filterChange: removeMutate(filterChange),
            },
            methods: {
              mutateFilterChange: (args: { filter: string }) => {
                filterChange.mutate(args);
                return args;
              },
            },
          };
        },
      );

      const mutationsOutput = craftUse(Mutations());

      type props = (typeof mutationsOutput)['props'];
      const search = mutationsOutput.props.searchChange.select('test');
      expectTypeOf(search).toEqualTypeOf<
        | {
            readonly value: Signal<
              | {
                  searchChangeText: string;
                }
              | undefined
            >;
            readonly status: Signal<CraftResourceStatus>;
            readonly isLoading: Signal<boolean>;
            hasValue(): boolean;
          }
        | undefined
      >();

      const filter = mutationsOutput.props.filterChange;
      expectTypeOf<typeof filter>().toEqualTypeOf<{
        '~InternalType': 'Used to avoid TS type erasure';
        readonly value: Signal<
          | {
              filter: string;
            }
          | undefined
        >;
        readonly status: Signal<CraftResourceStatus>;
        readonly isLoading: Signal<boolean>;
        hasValue: () => boolean;
        readonly resourceParamsSrc: WritableSignal<
          NoInfer<{
            filter: string;
          }>
        >;
        additionalInsertion: 'injectedValue';
        type: 'resourceLike';
        kind: 'mutation';
      }>();

      type methods = (typeof mutationsOutput)['methods'];
      //   ^?
      expectTypeOf<methods>().toEqualTypeOf<{
        mutateFilterChange: (args: { filter: string }) => {
          filter: string;
        };
      }>();

      expectTypeOf<props>().toBeObject();
    });
  });

  it('should infer correctly the mutation bind to a method', () => {
    TestBed.runInInjectionContext(() => {
      const _mutationsOutput = craftUse(mutation('_mutationsOutput', {
          method: (searchChange: string) => {
            return searchChange;
          },
          identifier: (searchChange) => searchChange,
          loader: async ({ params: searchChange }) => {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return { searchChange };
          },
        }),
      );
      const _entity = _mutationsOutput.select('test');
      expectTypeOf<typeof _entity>().toEqualTypeOf<
        | {
            readonly value: Signal<
              | {
                  searchChange: string;
                }
              | undefined
            >;
            readonly status: Signal<CraftResourceStatus>;
            readonly isLoading: Signal<boolean>;
            hasValue(): boolean;
          }
        | undefined
      >();
    });
  });

  it('should infer correctly the mutation bind to a source', () => {
    TestBed.runInInjectionContext(() => {
      const searchSource = signalSource<{ searchChange: string }>(
        'searchSource',
      );

      const _mutationsOutput = craftUse(mutation('_mutationsOutput', {
          method: afterRecomputation(searchSource, (searchChange) => {
            return searchChange;
          }),
          identifier: (params) => params.searchChange,
          loader: async ({ params: searchChange }) => {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return { searchChangeResult: searchChange.searchChange };
          },
        }),
      );

      expectTypeOf(_mutationsOutput.select('test')?.value()).toEqualTypeOf<
        { searchChangeResult: string } | undefined
      >();
    });
  });
});

describe('mutation exceptions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('typing: exposes exceptions in insertions context', () => {
    TestBed.runInInjectionContext(() => {
      const shouldFail = signal(true);

      craftUse(
        mutation(
          'save',
          {
            method: (value: string) =>
              shouldFail()
                ? craftException(
                    { code: 'INVALID_USER_ID_Param' },
                    { reason: 'missing' as const },
                  )
                : value,
            loader: async ({ params }) => {
              return shouldFail()
                ? craftException(
                    { code: 'INVALID_USER_ID_Loader' },
                    { reason: 'missing' as const },
                  )
                : {
                    id: params,
                    name: 'John Doe',
                    email: 'test@a.com',
                  };
            },
          },
          ({ exceptions, hasException, state }) => {
            expectTypeOf(state()).toEqualTypeOf<{
              id: string;
              name: string;
              email: string;
            }>();
            expectTypeOf(exceptions()).toEqualTypeOf<{
              list: (
                | CraftExceptionResult<
                    {
                      code: 'INVALID_USER_ID_Param';
                      scope: 'params';
                    },
                    {
                      reason: 'missing';
                    }
                  >
                | CraftExceptionResult<
                    {
                      code: 'INVALID_USER_ID_Loader';
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
                      code: 'INVALID_USER_ID_Param';
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
                      code: 'INVALID_USER_ID_Loader';
                      scope: 'loader';
                    },
                    {
                      reason: 'missing';
                    }
                  >
                | undefined;
            }>();
            expectTypeOf(hasException()).toEqualTypeOf<boolean>();
            expectTypeOf(exceptions).toBeFunction();
            expectTypeOf(exceptions()).toHaveProperty('list').toBeArray();
            expectTypeOf(exceptions()).toHaveProperty('params');
            expectTypeOf(exceptions()).toHaveProperty('loader');
            return {};
          },
        ),
      );
    });
  });

  it('typing: captures exception returned by method and loader', async () => {
    await TestBed.runInInjectionContext(async () => {
      const shouldFail = signal(true);
      const mutationRef = craftUse(mutation('mutationRef', {
          method: (value: string) =>
            shouldFail()
              ? craftException(
                  { code: 'INVALID_USER_ID' },
                  { reason: 'missing' as const },
                )
              : value,
          loader: async ({ params }) => {
            return shouldFail()
              ? craftException(
                  { code: 'INVALID_USER_ID' },
                  { reason: 'missing' as const },
                )
              : {
                  id: params,
                };
          },
        }),
      );

      mutationRef.mutate('user-1');
      await vi.runAllTimersAsync();

      expectTypeOf(mutationRef.exceptions().list).toEqualTypeOf<
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

  it('typing with identifier: captures exception returned by method and loader', async () => {
    await TestBed.runInInjectionContext(async () => {
      const shouldFailMethod = signal(true);
      const shouldFailLoader = signal(true);

      const mutationRef = craftUse(mutation('mutationRef', {
          method: (value: string) =>
            shouldFailMethod()
              ? craftException(
                  { code: 'INVALID_USER_ID' },
                  { reason: 'missing' as const },
                )
              : value,
          identifier: (id) => id,
          loader: async ({ params }) => {
            return shouldFailLoader()
              ? craftException(
                  {
                    code: 'API_ERROR',
                  },
                  { reason: 'missing user' as const },
                )
              : {
                  id: params,
                };
          },
        }),
      );

      mutationRef.mutate('user-1');
      await vi.runAllTimersAsync();

      expectTypeOf(mutationRef.exceptions().list).toEqualTypeOf<
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
                identifier: string;
              },
              {
                reason: 'missing user';
              }
            >
        )[]
      >();

      expectTypeOf(mutationRef.exceptions().params).toEqualTypeOf<
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

      expectTypeOf(mutationRef.exceptions().loader).toEqualTypeOf<
        Partial<
          Record<
            string,
            CraftExceptionResult<
              {
                code: 'API_ERROR';
                scope: 'loader';
                identifier: string;
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

  it('typing with identifier: return a select exceptions for an identifier', async () => {
    await TestBed.runInInjectionContext(async () => {
      const mutationRef = craftUse(mutation('mutationRef', {
          method: (value: string) => value,
          identifier: (id) => id,
          loader: async () =>
            craftException(
              {
                code: 'API_ERROR',
              },
              { reason: 'missing' as const },
            ),
        }),
      );

      mutationRef.mutate('user-1');
      await vi.runAllTimersAsync();

      expectTypeOf(mutationRef.exceptions().loader).toEqualTypeOf<
        Partial<
          Record<
            string,
            CraftExceptionResult<
              {
                code: 'API_ERROR';
                scope: 'loader';
                identifier: string;
              },
              {
                reason: 'missing';
              }
            >
          >
        >
      >();

      expectTypeOf(mutationRef.select('')?.exceptions().loader).toEqualTypeOf<
        | CraftExceptionResult<
            {
              code: 'API_ERROR';
              scope: 'loader';
              identifier: string;
            },
            {
              reason: 'missing';
            }
          >
        | undefined
      >();
    });
  });

  it('typing with identifier: return a select exceptions for an identifier', async () => {
    await TestBed.runInInjectionContext(async () => {
      const failed = signal(true);
      const mutationRef = craftUse(mutation('mutationRef', {
          method: (value: string) => value,
          identifier: (id) => id,
          loader: async () =>
            failed()
              ? craftException(
                  {
                    code: 'API_ERROR',
                  },
                  { reason: 'missing' as const },
                )
              : craftException(
                  {
                    code: 'HTTP_ERROR',
                  },
                  { reason: 'disconnected' as const },
                ),
        }),
      );

      mutationRef.mutate('user-1');
      await vi.runAllTimersAsync();

      expectTypeOf(mutationRef.exceptions().loader).toEqualTypeOf<
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
                  reason: 'missing';
                }
              >
            | CraftExceptionResult<
                {
                  code: 'HTTP_ERROR';
                  scope: 'loader';
                  identifier: string;
                },
                {
                  reason: 'disconnected';
                }
              >
          >
        >
      >();

      expectTypeOf(
        mutationRef.select('')?.exceptions().loader?.code,
      ).toEqualTypeOf<'API_ERROR' | 'HTTP_ERROR' | undefined>();
    });
  });

  it('captures exception returned by method and does not trigger loader', async () => {
    await TestBed.runInInjectionContext(async () => {
      const loader = vi.fn(async ({ params }: { params: string }) => ({
        id: params,
      }));

      const mutationRef = craftUse(mutation('mutationRef', {
          method: (value: string) =>
            value.length < 3
              ? craftException(
                  { code: 'SEARCH_TERM_TOO_SHORT' },
                  { min: 3, received: value.length },
                )
              : value,
          loader: loader as any,
        }),
      );

      mutationRef.mutate('ab');
      await vi.runAllTimersAsync();

      expect(loader).not.toHaveBeenCalled();
      expect(mutationRef.resourceParamsSrc()).toBeUndefined();
      expect(mutationRef.hasException()).toBe(true);
      expect(mutationRef.exceptions().params?.SEARCH_TERM_TOO_SHORT).toEqual({
        min: 3,
        received: 2,
      });
    });
  });

  it('captures exception returned by loader without exposing a value', async () => {
    await TestBed.runInInjectionContext(async () => {
      const mutationRef = craftUse(mutation('mutationRef', {
          method: (value: string) => value,
          loader: async () =>
            craftException(
              { code: 'INVALID_USER_ID', scope: 'loader' },
              { from: 'loader' as const },
            ),
        }),
      );

      mutationRef.mutate('user-1');
      await vi.runAllTimersAsync();

      expect(mutationRef.exceptions().loader?.INVALID_USER_ID).toEqual({
        from: 'loader',
      });
      expect(mutationRef.value()).toBeUndefined();
      expect(mutationRef.hasException()).toBe(true);
    });
  });

  it('keeps method exceptions global in parallel mutation', async () => {
    await TestBed.runInInjectionContext(async () => {
      const mutationRef = craftUse(mutation('mutationRef', {
          method: (id: 'A' | 'B') =>
            craftException({ code: 'INVALID_ID' }, { params: id }),
          identifier: (id) => id,
          loader: async ({ params }) => ({ id: params }),
        }),
      );

      mutationRef.mutate('A');
      await vi.runAllTimersAsync();

      expect(mutationRef.exceptions().params?.payload).toEqual({ params: 'A' });
      expect(mutationRef.exceptions().loader).toEqual({});
    });
  });
});

describe('mutation — providers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes the mutation runtime context to insertion method wrappers', () => {
    let runtimeContext: MutationMethodRuntimeContext | undefined;
    let observedRuntimeContext: MutationMethodRuntimeContext | undefined;
    const runtimeContextWrapper = provideFnWrapper(
      'Warning: dependency injection here is not type-safe and may fail at runtime',
      function* (factory, thisArg, args) {
        runtimeContext = injectMutationMethodRuntimeContext() ?? runtimeContext;
        return yield* factory.apply(thisArg, args);
      },
    );

    TestBed.runInInjectionContext(() => {
      const mutationRef = craftUse(mutation(
          'mutationRef',
          {
            providers: [
              runtimeContextWrapper,
              provideFnWrapObserver(() => {
                observedRuntimeContext =
                  injectMutationMethodRuntimeContext() ??
                  observedRuntimeContext;
              }),
            ],
            method: (id: string) => id,
            loader: async () => ({ count: 0 }),
          },
          ({ set }) => ({
            initialize: () => set({ count: 1 }),
          }),
        ),
      );

      expect(observedRuntimeContext?.kind).toBe('mutation');
      mutationRef.initialize();

      expect(runtimeContext?.kind).toBe('mutation');
      expect(runtimeContext?.get()).toEqual({ count: 1 });
      expect(runtimeContext?.originalSource).toContain('count: 1');
      runtimeContext?.set({ count: 10 });
      expect(runtimeContext?.get()).toEqual({ count: 10 });
    });
  });

  it('exposes the mutation resource context to runtime observers', () => {
    let resourceContext: PrimitiveResourceRuntimeContext | undefined;

    TestBed.runInInjectionContext(() => {
      const mutationRef = craftUse(mutation('mutationRef', {
          providers: [
            providePrimitiveResourceRuntimeObserver((context) => {
              resourceContext = context;
            }),
          ],
          method: (id: string) => id,
          loader: async () => ({ count: 0 }),
        }),
      );

      expect(resourceContext?.kind).toBe('mutation');
      expect(resourceContext?.grouped).toBe(false);
      resourceContext?.set({ count: 1 });
      resourceContext?.patch(() => ({ count: 2 }));
      expect(resourceContext?.get()).toEqual({ count: 2 });
      expect(mutationRef.value()).toEqual({ count: 2 });
    });
  });

  it('providers are applied to mutation method generator', async () => {
    const callLog: string[] = [];
    const trackingWrapper: FnWrapper = function* (factory, thisArg, args) {
      callLog.push('method');
      return yield* (
        factory as (...a: unknown[]) => Generator<unknown, unknown, unknown>
      ).apply(thisArg as object, args);
    };

    await TestBed.runInInjectionContext(async () => {
      const mutationRef = craftUse(mutation('mutationRef', {
          providers: [
            provideFnWrapper(
              'Warning: dependency injection here is not type-safe and may fail at runtime',
              trackingWrapper,
            ),
          ],
          method: function* (id: string) {
            return id;
          },
          loader: async ({ params }) => ({ id: params }),
        }),
      );

      expect(callLog).toEqual([]);
      mutationRef.mutate('user-1');
      await vi.runAllTimersAsync();
      expect(callLog).toContain('method');
    });
  });

  it('providers scoped to one mutation do not affect a sibling mutation', async () => {
    const callLog: string[] = [];
    const trackingWrapper: FnWrapper = function* (factory, thisArg, args) {
      callLog.push('called');
      return yield* (
        factory as (...a: unknown[]) => Generator<unknown, unknown, unknown>
      ).apply(thisArg as object, args);
    };

    await TestBed.runInInjectionContext(async () => {
      const withProvider = craftUse(mutation('withProvider', {
          providers: [
            provideFnWrapper(
              'Warning: dependency injection here is not type-safe and may fail at runtime',
              trackingWrapper,
            ),
          ],
          method: function* (id: string) {
            return id;
          },
          loader: async ({ params }) => ({ id: params }),
        }),
      );
      const withoutProvider = craftUse(mutation('withoutProvider', {
          method: function* (id: string) {
            return id;
          },
          loader: async ({ params }) => ({ id: params }),
        }),
      );

      withoutProvider.mutate('x');
      await vi.runAllTimersAsync();
      expect(callLog).toEqual([]);

      withProvider.mutate('x');
      await vi.runAllTimersAsync();
      expect(callLog).toContain('called');
    });
  });

  it('typing: mutation accepts BrandedServiceProvider in providers without type errors', () => {
    const { MethodService, provideMethodService } = craftService(
      { name: 'MethodService', scope: 'toProvide' },
      () => ({ getValue: () => 42 }),
    );

    TestBed.runInInjectionContext(() => {
      const withoutProviders = craftUse(mutation('withoutProviders', {
          params: function* () {
            yield* MethodService();
            return 'user-1';
          },
          loader: async ({ params }) => ({ id: params }),
        }),
      );
      type WithoutDeps = ExtractDeps<typeof withoutProviders>;
      expectTypeOf<
        'MethodService' extends keyof WithoutDeps ? true : false
      >().toEqualTypeOf<true>();

      // Verify mutation accepts providers without type errors
      const withProviders = craftUse(mutation('withProviders', {
          providers: [provideMethodService()],
          params: () => 'user-1',
          loader: async ({ params }) => ({ id: params }),
        }),
      );
      expectTypeOf(withProviders.hasValue).toBeFunction();
    });
  });

  it('should accepts this', () => {
    TestBed.runInInjectionContext(() => {
      const registerPizzeriaOwner = craftUse(mutation('registerPizzeriaOwner', {
          method: ({
            email,
            password,
          }: {
            email: string;
            password: string;
          }) => ({
            email,
            password,
          }),
          loader: function* ({ params }) {
            return yield* CraftHttpClient.post(({ response }) => ({
              url: '/api/pizzeria-owners',
              payload: params,
              success: response<{ id: string }>(),
            }));
          },
        }),
      );
    });
  });

  it('typing: loader generator can return null or primitive sync values', () => {
    TestBed.runInInjectionContext(() => {
      const withNull = craftUse(mutation('withNull', {
          method: (id: string) => id,
          loader: function* () {
            return null;
          },
        }),
      );
      expectTypeOf(withNull.value).toEqualTypeOf<Signal<null | undefined>>();

      const withString = craftUse(mutation('withString', {
          method: (id: string) => id,
          loader: function* () {
            return 'result';
          },
        }),
      );
      expectTypeOf(withString.value).toEqualTypeOf<
        Signal<string | undefined>
      >();
    });
  });
});

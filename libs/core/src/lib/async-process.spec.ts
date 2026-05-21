import { asyncProcess } from './async-process';
import { ResourceStatus, Signal, signal } from '@angular/core';
import { afterRecomputation } from './after-recomputation';
import { signalSource } from './signal-source';
import { ReadonlySource } from './util/source.type';
import { TestBed } from '@angular/core/testing';
import { craftException, CraftExceptionResult } from './craft-exception';
import { craftService } from './craft-service';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import type { ExtractDeps } from './branded-component/branded-component';
import type { GetToYieldServiceDependencies } from './craft-service';
import { provideFnWrapper, type FnWrapper } from './fn-wrapper';

type EmptyAsyncProcessExceptions = {
  hasException: Signal<boolean>;
  exceptions: Signal<{
    list: never[];
    params?: never;
    loader?: never;
  }>;
};

function removeMethod<T extends object>(resource: T): Omit<T, 'method'> {
  const { method: _method, ...rest } = resource as T & { method?: unknown };
  return rest as Omit<T, 'method'>;
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

describe('AsyncProcess', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });
  it('should enable to define async method and be called with a method', async () => {
    await TestBed.runInInjectionContext(async () => {
      const myAsyncProcess = asyncProcess({
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
          expectTypeOf(searchChange).toEqualTypeOf<string>();
          expectTypeOf(timeToWait).toEqualTypeOf<number>();
          await new Promise((resolve) => setTimeout(resolve, timeToWait));
          return { searchChange };
        },
      });

      expect(myAsyncProcess.status()).toBe('idle');
      myAsyncProcess.method({
        searchChange: 'test',
        timeToWait: 1000,
      });
      expect(myAsyncProcess.status()).toBe('loading');
      await vi.runAllTimersAsync();
      expect(myAsyncProcess.status()).toBe('resolved');
      expect(myAsyncProcess.value()).toEqual({
        searchChange: 'test',
      });
    });
  });

  it('should enable to define async method bind to a source', async () => {
    await TestBed.runInInjectionContext(async () => {
      const searchSource = signalSource<{
        searchChange: string;
        timeToWait: number;
      }>();
      const myAsyncProcess = asyncProcess({
        method: afterRecomputation(
          searchSource,
          (searchConfig) => searchConfig,
        ),
        loader: async ({ params: { timeToWait, searchChange } }) => {
          expectTypeOf(timeToWait).toEqualTypeOf<number>();
          expectTypeOf(searchChange).toEqualTypeOf<string>();
          await new Promise((resolve) => setTimeout(resolve, timeToWait));
          return { searchChange };
        },
      });

      expect(myAsyncProcess.status()).toBe('idle');
      expectTypeOf(myAsyncProcess.source).toEqualTypeOf<
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
      expect(myAsyncProcess.status()).toBe('loading');
      await vi.runAllTimersAsync();
      expect(myAsyncProcess.status()).toBe('resolved');
      expect(myAsyncProcess.value()).toEqual({ searchChange: 'test' });
    });
  });

  it('should return undefined with safeValue when status is error', async () => {
    await TestBed.runInInjectionContext(async () => {
      const myAsyncProcess = asyncProcess({
        method: (shouldFail: boolean) => shouldFail,
        loader: async ({ params: shouldFail }) => {
          if (shouldFail) {
            throw new Error('Test error');
          }
          return { success: true };
        },
      });

      expect(myAsyncProcess.status()).toBe('idle');
      myAsyncProcess.method(true);
      expect(myAsyncProcess.status()).toBe('loading');
      await vi.runAllTimersAsync();
      expect(myAsyncProcess.status()).toBe('error');
      expect(myAsyncProcess.error()).toBeInstanceOf(Error);
      expect(myAsyncProcess.error()?.message).toBe('Test error');
      expect(myAsyncProcess.hasValue()).toBe(false);

      // safeValue should return undefined without throwing
      expect(myAsyncProcess.safeValue()).toBeUndefined();
    });
  });

  it('typing: tracks generator dependencies from method, loader and insertions', () => {
    const { AsyncParamsToYield } = craftService(
      { name: 'AsyncParams', scope: 'global' },
      () => ({
        normalize: (userId: string): string => userId.trim(),
      }),
    );
    const { AsyncApiToYield } = craftService(
      { name: 'AsyncApi', scope: 'global' },
      () => ({
        load: (userId: string): Promise<{ userId: string }> =>
          Promise.resolve({ userId }),
      }),
    );
    const { AsyncToolsToYield } = craftService(
      { name: 'AsyncTools', scope: 'global' },
      () => ({
        key: (): string => 'async-user',
      }),
    );

    TestBed.runInInjectionContext(() => {
      const asyncRef = asyncProcess(
        {
          method: function* (userId: string) {
            const params = yield* AsyncParamsToYield();
            return params.normalize(userId);
          },
          loader: function* ({ params }) {
            const api = yield* AsyncApiToYield();
            return api.load(params);
          },
        },
        function* () {
          const tools = yield* AsyncToolsToYield();
          return {
            processKey: tools.key(),
          };
        },
      );

      expectTypeOf<ExtractDeps<typeof asyncRef>>().toEqualTypeOf<{
        AsyncParams: GetToYieldServiceDependencies<typeof AsyncParamsToYield>;
        AsyncApi: GetToYieldServiceDependencies<typeof AsyncApiToYield>;
        AsyncTools: GetToYieldServiceDependencies<typeof AsyncToolsToYield>;
      }>();
    });
  });

  it('should resolve generator method, loader and insertions', async () => {
    const logs: string[] = [];
    const { AsyncLoggerRuntimeToYield } = craftService(
      { name: 'AsyncLoggerRuntime', scope: 'global' },
      () => ({
        log: (message: string) => {
          logs.push(message);
        },
      }),
    );
    const { AsyncApiRuntimeToYield } = craftService(
      { name: 'AsyncApiRuntime', scope: 'global' },
      () => ({
        load: async (userId: string): Promise<{ userId: string }> => ({
          userId,
        }),
      }),
    );

    await TestBed.runInInjectionContext(async () => {
      const asyncRef = asyncProcess(
        {
          method: function* (userId: string) {
            const logger = yield* AsyncLoggerRuntimeToYield();
            logger.log(`async:${userId}`);
            return userId;
          },
          loader: function* ({ params }) {
            const api = yield* AsyncApiRuntimeToYield();
            return api.load(params);
          },
        },
        function* () {
          const logger = yield* AsyncLoggerRuntimeToYield();
          logger.log('insert:init');
          return {
            initialized: true,
          };
        },
      );

      asyncRef.method('user-4');
      await vi.runAllTimersAsync();

      expect(asyncRef.initialized).toBe(true);
      expect(asyncRef.value()).toEqual({ userId: 'user-4' });
      expect(logs).toEqual(['insert:init', 'async:user-4']);
    });
  });
});

describe('AsyncProcess types without identifier', () => {
  it('should infer correctly the types of AsyncProcess', () => {
    TestBed.runInInjectionContext(() => {
      const { injectAsyncProcessOutput } = craftService(
        { name: 'AsyncProcessOutput', scope: 'function' },
        () => {
          const searchChange = asyncProcess({
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
              expectTypeOf(timeToWait).toEqualTypeOf<number>();
              expectTypeOf(searchChange).toEqualTypeOf<string>();
              await new Promise((resolve) => setTimeout(resolve, timeToWait));
              return { searchChange };
            },
          });
          const filterChange = asyncProcess(
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
          );

          return {
            props: {
              searchChange: removeMethod(searchChange),
              filterChange: removeMethod(filterChange),
            },
            methods: {
              setSearchChange: (args: {
                timeToWait: number;
                searchChange: string;
              }) => {
                searchChange.method(args);
                return args;
              },
              setFilterChange: (args: { filter: string }) => {
                filterChange.method(args);
                return args;
              },
            },
          };
        },
      );

      const AsyncProcessOutput = injectAsyncProcessOutput();
      expect(AsyncProcessOutput.props.searchChange.hasException()).toBe(false);

      type props = (typeof AsyncProcessOutput)['props'];
      expectTypeOf<props>().toEqualTypeOf<{
        searchChange: {
          readonly value: Signal<
            | {
                searchChange: string;
              }
            | undefined
          >;
          readonly safeValue: Signal<
            | {
                searchChange: string;
              }
            | undefined
          >;
          readonly status: Signal<ResourceStatus>;
          readonly error: Signal<Error | undefined>;
          readonly isLoading: Signal<boolean>;
          hasValue: () => boolean;
          hasException: Signal<boolean>;
          exceptions: Signal<{
            list: never[];
            params?: never;
            loader?: never;
          }>;
        };
        filterChange: {
          readonly value: Signal<
            | {
                filter: string;
              }
            | undefined
          >;
          readonly safeValue: Signal<
            | {
                filter: string;
              }
            | undefined
          >;
          readonly status: Signal<ResourceStatus>;
          readonly error: Signal<Error | undefined>;
          readonly isLoading: Signal<boolean>;
          hasValue: () => boolean;
          additionalInsertion: 'injectedValue';
          hasException: Signal<boolean>;
          exceptions: Signal<{
            list: never[];
            params?: never;
            loader?: never;
          }>;
        };
      }>();

      type methods = (typeof AsyncProcessOutput)['methods'];
      expectTypeOf<methods>().branded.toEqualTypeOf<
        {
          setSearchChange: (args: {
            timeToWait: number;
            searchChange: string;
          }) => {
            timeToWait: number;
            searchChange: string;
          };
        } & {
          setFilterChange: (args: { filter: string }) => {
            filter: string;
          };
        }
      >();
    });
  });

  it('should infer correctly the AsyncProcess bind to a source type, and not exposed the method bind to a source', () => {
    TestBed.runInInjectionContext(() => {
      const searchSource = signalSource<{ searchChangeText: string }>();
      const { injectAsyncProcessOutput } = craftService(
        { name: 'AsyncProcessOutput', scope: 'function' },
        () => {
          const searchChange = asyncProcess({
            method: afterRecomputation(searchSource, (searchChange) => {
              return searchChange;
            }),
            loader: async ({ params: { searchChangeText } }) => {
              expectTypeOf(searchChangeText).toEqualTypeOf<string>();
              await new Promise((resolve) => setTimeout(resolve, 1000));
              return { searchChangeText };
            },
          });
          const filterChange = asyncProcess(
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
          );

          return {
            props: {
              searchChange: removeMethod(searchChange),
              filterChange: removeMethod(filterChange),
            },
            methods: {
              setFilterChange: (args: { filter: string }) => {
                filterChange.method(args);
                return args;
              },
            },
          };
        },
      );

      const AsyncProcessOutput = injectAsyncProcessOutput();
      expect(AsyncProcessOutput.props.filterChange.status()).toBe('idle');

      type props = (typeof AsyncProcessOutput)['props'];
      expectTypeOf<props>().toEqualTypeOf<{
        searchChange: {
          readonly error: Signal<Error | undefined>;
          readonly value: Signal<
            | {
                searchChangeText: string;
              }
            | undefined
          >;
          readonly safeValue: Signal<
            | {
                searchChangeText: string;
              }
            | undefined
          >;
          readonly status: Signal<ResourceStatus>;
          readonly isLoading: Signal<boolean>;
          hasValue: () => boolean;
          source: ReadonlySource<{
            searchChangeText: string;
          }>;
          hasException: Signal<boolean>;
          exceptions: Signal<{
            list: never[];
            params?: never;
            loader?: never;
          }>;
        };
        filterChange: {
          readonly error: Signal<Error | undefined>;
          readonly value: Signal<
            | {
                filter: string;
              }
            | undefined
          >;
          readonly safeValue: Signal<
            | {
                filter: string;
              }
            | undefined
          >;
          readonly status: Signal<ResourceStatus>;
          readonly isLoading: Signal<boolean>;
          hasValue: () => boolean;
          additionalInsertion: 'injectedValue';
          hasException: Signal<boolean>;
          exceptions: Signal<{
            list: never[];
            params?: never;
            loader?: never;
          }>;
        };
      }>();

      type methods = (typeof AsyncProcessOutput)['methods'];
      //   ^?
      expectTypeOf<methods>().toEqualTypeOf<{
        setFilterChange: (args: { filter: string }) => {
          filter: string;
        };
      }>();
    });
  });

  it('should infer correctly the AsyncProcess bind to a method', () => {
    TestBed.runInInjectionContext(() => {
      const _AsyncProcessOutput = asyncProcess({
        method: (searchChange: string) => {
          return searchChange;
        },
        loader: async ({ params: searchChange }) => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return { searchChange };
        },
      });
      expectTypeOf<typeof _AsyncProcessOutput>().toEqualTypeOf<{
        readonly value: Signal<
          | {
              searchChange: string;
            }
          | undefined
        >;
        readonly safeValue: Signal<
          | {
              searchChange: string;
            }
          | undefined
        >;
        readonly status: Signal<ResourceStatus>;
        readonly error: Signal<Error | undefined>;
        readonly isLoading: Signal<boolean>;
        hasValue: () => boolean;
        method: (args: string) => string;
        hasException: Signal<boolean>;
        exceptions: Signal<{
          list: never[];
          params?: never;
          loader?: never;
        }>;
      }>();
    });
  });

  it('should infer correctly the AsyncProcess bind to a source', () => {
    TestBed.runInInjectionContext(() => {
      const searchSource = signalSource<{ searchChange: string }>();

      const _AsyncProcessOutput = asyncProcess({
        method: afterRecomputation(searchSource, (searchChange) => {
          return searchChange;
        }),
        loader: async ({ params: searchChange }) => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return { searchChangeResult: searchChange.searchChange };
        },
      });
      expectTypeOf<typeof _AsyncProcessOutput>().toEqualTypeOf<{
        readonly value: Signal<
          | {
              searchChangeResult: string;
            }
          | undefined
        >;
        readonly status: Signal<ResourceStatus>;
        readonly error: Signal<Error | undefined>;
        readonly isLoading: Signal<boolean>;
        hasValue: () => boolean;
        readonly safeValue: Signal<
          | {
              searchChangeResult: string;
            }
          | undefined
        >;
        source: ReadonlySource<{
          searchChange: string;
        }>;
        hasException: Signal<boolean>;
        exceptions: Signal<{
          list: never[];
          params?: never;
          loader?: never;
        }>;
      }>();
    });
  });
});

describe('AsyncProcess types with identifier', () => {
  it('should infer correctly the types of AsyncProcess', () => {
    TestBed.runInInjectionContext(() => {
      const { injectAsyncProcessOutput } = craftService(
        { name: 'AsyncProcessOutput', scope: 'function' },
        () => {
          const searchChange = asyncProcess({
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
              expectTypeOf(timeToWait).toEqualTypeOf<number>();
              expectTypeOf(searchChange).toEqualTypeOf<string>();
              await new Promise((resolve) => setTimeout(resolve, timeToWait));
              return { searchChange };
            },
          });
          const filterChange = asyncProcess(
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
          );

          return {
            props: {
              searchChange: removeMethod(searchChange),
              filterChange: removeMethod(filterChange),
            },
            methods: {
              setSearchChange: (args: {
                timeToWait: number;
                searchChange: string;
              }) => {
                searchChange.method(args);
                return args;
              },
              setFilterChange: (args: { filter: string }) => {
                filterChange.method(args);
                return args;
              },
            },
          };
        },
      );

      const AsyncProcessOutput = injectAsyncProcessOutput();
      expect(AsyncProcessOutput.props.searchChange.hasException()).toBe(false);

      type props = (typeof AsyncProcessOutput)['props'];
      type s = props['searchChange'];

      const search = {} as ReturnType<s['select']>;
      expectTypeOf(search).toEqualTypeOf<
        | ({
            readonly value: Signal<
              | {
                  searchChange: string;
                }
              | undefined
            >;
            readonly safeValue: Signal<
              | {
                  searchChange: string;
                }
              | undefined
            >;
            readonly status: Signal<ResourceStatus>;
            readonly error: Signal<Error | undefined>;
            readonly isLoading: Signal<boolean>;
            hasValue(): boolean;
          } & EmptyAsyncProcessExceptions)
        | undefined
      >();

      type f = props['filterChange'];
      //.  ^?

      const filter = {} as f;
      expectTypeOf(filter).toEqualTypeOf<{
        readonly error: Signal<Error | undefined>;
        readonly value: Signal<
          | {
              filter: string;
            }
          | undefined
        >;
        readonly safeValue: Signal<
          | {
              filter: string;
            }
          | undefined
        >;
        readonly status: Signal<ResourceStatus>;
        readonly isLoading: Signal<boolean>;
        hasValue: () => boolean;
        additionalInsertion: 'injectedValue';
        hasException: Signal<boolean>;
        exceptions: Signal<{
          list: never[];
          params?: never;
          loader?: never;
        }>;
      }>();

      type methods = (typeof AsyncProcessOutput)['methods'];
      expectTypeOf<methods>().branded.toEqualTypeOf<
        {
          setSearchChange: (args: {
            timeToWait: number;
            searchChange: string;
          }) => {
            timeToWait: number;
            searchChange: string;
          };
        } & {
          setFilterChange: (args: { filter: string }) => {
            filter: string;
          };
        }
      >();
    });
  });

  it.skip('should infer correctly the AsyncProcess bind to a source type, and not exposed the method bind to a source', () => {
    TestBed.runInInjectionContext(() => {
      const searchSource = signalSource<{ searchChangeText: string }>();
      const { injectAsyncProcessOutput } = craftService(
        { name: 'AsyncProcessOutput', scope: 'function' },
        () => {
          const searchChange = asyncProcess({
            method: afterRecomputation(searchSource, (searchChange) => {
              return searchChange;
            }),
            identifier: (params) => params.searchChangeText,
            loader: async ({ params: { searchChangeText } }) => {
              expectTypeOf(searchChangeText).toEqualTypeOf<string>();
              await new Promise((resolve) => setTimeout(resolve, 1000));
              return { searchChangeText };
            },
          });
          const filterChange = asyncProcess(
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
          );

          return {
            props: {
              searchChange: removeMethod(searchChange),
              filterChange: removeMethod(filterChange),
            },
            methods: {
              setFilterChange: (args: { filter: string }) => {
                filterChange.method(args);
                return args;
              },
            },
          };
        },
      );

      const AsyncProcessOutput = injectAsyncProcessOutput();
      expect(AsyncProcessOutput.props.filterChange.status()).toBe('idle');

      try {
        const search = AsyncProcessOutput.props.searchChange.select('test');
        expectTypeOf(search).toEqualTypeOf<
          | ({
              readonly value: Signal<
                | {
                    searchChangeText: string;
                  }
                | undefined
              >;
              readonly safeValue: Signal<
                | {
                    searchChangeText: string;
                  }
                | undefined
              >;
              readonly status: Signal<ResourceStatus>;
              readonly error: Signal<Error | undefined>;
              readonly isLoading: Signal<boolean>;
              hasValue(): boolean;
            } & EmptyAsyncProcessExceptions)
          | undefined
        >();

        const filter = AsyncProcessOutput.props.filterChange;
        expectTypeOf(filter).toEqualTypeOf<{
          readonly error: Signal<Error | undefined>;
          readonly value: Signal<
            | {
                filter: string;
              }
            | undefined
          >;
          readonly safeValue: Signal<
            | {
                filter: string;
              }
            | undefined
          >;
          readonly status: Signal<ResourceStatus>;
          readonly isLoading: Signal<boolean>;
          hasValue: () => boolean;
          additionalInsertion: 'injectedValue';
          hasException: Signal<boolean>;
          exceptions: Signal<{
            list: never[];
            params?: never;
            loader?: never;
          }>;
        }>();

        type methods = (typeof AsyncProcessOutput)['methods'];
        //   ^?
        expectTypeOf<methods>().toEqualTypeOf<{
          setFilterChange: (args: { filter: string }) => {
            filter: string;
          };
        }>();
      } catch (error) {
        console.error(error);
      }
    });
  });

  it('should infer correctly the AsyncProcess bind to a method', () => {
    TestBed.runInInjectionContext(() => {
      const _AsyncProcessOutput = asyncProcess({
        method: (searchChange: string) => {
          return searchChange;
        },
        identifier: (searchChange) => searchChange,
        loader: async ({ params: searchChange }) => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return { searchChange };
        },
      });
      const _entity = _AsyncProcessOutput.select('test');
      expectTypeOf<typeof _entity>().toEqualTypeOf<
        | ({
            readonly value: Signal<
              | {
                  searchChange: string;
                }
              | undefined
            >;
            readonly status: Signal<ResourceStatus>;
            readonly error: Signal<Error | undefined>;
            readonly isLoading: Signal<boolean>;
            readonly safeValue: Signal<
              | {
                  searchChange: string;
                }
              | undefined
            >;
            hasValue(): boolean;
          } & EmptyAsyncProcessExceptions)
        | undefined
      >();
    });
  });

  it('should infer correctly the AsyncProcess bind to a source', () => {
    TestBed.runInInjectionContext(() => {
      const searchSource = signalSource<{ searchChange: string }>();

      const _AsyncProcessOutput = asyncProcess({
        method: afterRecomputation(searchSource, (searchChange) => {
          return searchChange;
        }),
        identifier: (params) => params.searchChange,
        loader: async ({ params: searchChange }) => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return { searchChangeResult: searchChange.searchChange };
        },
      });

      expectTypeOf(_AsyncProcessOutput.select('test')?.value()).toEqualTypeOf<
        { searchChangeResult: string } | undefined
      >();
    });
  });
});

describe('asyncProcess exceptions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('typing: exposes exceptions in insertions context', () => {
    TestBed.runInInjectionContext(() => {
      const shouldFail = signal(true);

      asyncProcess(
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
      );
    });
  });

  it('typing: captures exception returned by method and loader', async () => {
    await TestBed.runInInjectionContext(async () => {
      const shouldFail = signal(true);
      const asyncProcessRef = asyncProcess({
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
            : { id: params };
        },
      });

      asyncProcessRef.method('user-1');
      await vi.runAllTimersAsync();

      expectTypeOf(asyncProcessRef.exceptions().list).toEqualTypeOf<
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

      const asyncProcessRef = asyncProcess({
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
                { code: 'API_ERROR' },
                { reason: 'missing user' as const },
              )
            : { id: params };
        },
      });

      asyncProcessRef.method('user-1');
      await vi.runAllTimersAsync();

      expectTypeOf(asyncProcessRef.exceptions().list).toEqualTypeOf<
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

      expectTypeOf(asyncProcessRef.exceptions().params).toEqualTypeOf<
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

      expectTypeOf(asyncProcessRef.exceptions().loader).toEqualTypeOf<
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

  it('typing with identifier: return select exceptions for an identifier', async () => {
    await TestBed.runInInjectionContext(async () => {
      const asyncProcessRef = asyncProcess({
        method: (value: string) => value,
        identifier: (id) => id,
        loader: async () =>
          craftException(
            {
              code: 'API_ERROR',
            },
            { reason: 'missing' as const },
          ),
      });

      asyncProcessRef.method('user-1');
      await vi.runAllTimersAsync();

      expectTypeOf(asyncProcessRef.exceptions().loader).toEqualTypeOf<
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

      expectTypeOf(
        asyncProcessRef.select('')?.exceptions().loader,
      ).toEqualTypeOf<
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

  it('typing with identifier: supports union of loader exceptions', async () => {
    await TestBed.runInInjectionContext(async () => {
      const failed = signal(true);
      const asyncProcessRef = asyncProcess({
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
      });

      asyncProcessRef.method('user-1');
      await vi.runAllTimersAsync();

      expectTypeOf(asyncProcessRef.exceptions().loader).toEqualTypeOf<
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
        asyncProcessRef.select('')?.exceptions().loader?.code,
      ).toEqualTypeOf<'API_ERROR' | 'HTTP_ERROR' | undefined>();
    });
  });

  it('captures exception returned by method and does not trigger loader', async () => {
    await TestBed.runInInjectionContext(async () => {
      const loader = vi.fn(async ({ params }: { params: string }) => ({
        id: params,
      }));

      const asyncProcessRef = asyncProcess({
        method: (value: string) =>
          value.length < 3
            ? craftException(
                { code: 'SEARCH_TERM_TOO_SHORT' },
                { min: 3, received: value.length },
              )
            : value,
        loader: loader as any,
      });

      asyncProcessRef.method('ab');
      await vi.runAllTimersAsync();

      expect(loader).not.toHaveBeenCalled();
      expect(asyncProcessRef.hasException()).toBe(true);
      expect(
        asyncProcessRef.exceptions().params?.SEARCH_TERM_TOO_SHORT,
      ).toEqual({
        min: 3,
        received: 2,
      });
    });
  });

  it('captures exception returned by loader without exposing it in safeValue', async () => {
    await TestBed.runInInjectionContext(async () => {
      const asyncProcessRef = asyncProcess({
        method: (value: string) => value,
        loader: async () =>
          craftException(
            { code: 'INVALID_USER_ID', scope: 'loader' },
            { from: 'loader' as const },
          ),
      });

      asyncProcessRef.method('user-1');
      await vi.runAllTimersAsync();

      expect(asyncProcessRef.exceptions().loader?.INVALID_USER_ID).toEqual({
        from: 'loader',
      });
      expect(asyncProcessRef.safeValue()).toBeUndefined();
      expect(asyncProcessRef.hasException()).toBe(true);
    });
  });

  it('keeps method exceptions global in parallel asyncProcess', async () => {
    await TestBed.runInInjectionContext(async () => {
      const asyncProcessRef = asyncProcess({
        method: (id: 'A' | 'B') =>
          craftException({ code: 'INVALID_ID' }, { params: id }),
        identifier: (id) => id,
        loader: async ({ params }) => ({ id: params }),
      });

      asyncProcessRef.method('A');
      await vi.runAllTimersAsync();

      expect(asyncProcessRef.exceptions().params?.payload).toEqual({
        params: 'A',
      });
      expect(asyncProcessRef.exceptions().loader).toEqual({});
    });
  });
});

describe('AsyncProcess with params config', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should accept params config and auto-trigger loader', async () => {
    await TestBed.runInInjectionContext(async () => {
      const myAsyncProcess = asyncProcess({
        params: () => '5',
        loader: async ({ params }) => {
          return {
            id: params,
            name: 'John Doe',
            email: 'test@a.com',
          };
        },
      });

      await vi.runAllTimersAsync();
      expect(myAsyncProcess.status()).toBe('resolved');
      expect(myAsyncProcess.value()).toEqual({
        id: '5',
        name: 'John Doe',
        email: 'test@a.com',
      });
    });
  });

  it('should accept params config with identifier', async () => {
    await TestBed.runInInjectionContext(async () => {
      const myAsyncProcess = asyncProcess({
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

      await vi.runAllTimersAsync();
      const entity = myAsyncProcess.select('5');
      expect(entity).toBeDefined();
      expect(entity?.value()).toEqual({
        id: '5',
        name: 'John Doe',
        email: 'test@a.com',
      });
    });
  });
});

describe('AsyncProcess types with params config', () => {
  it('should infer correctly the types of asyncProcess with params (no identifier)', () => {
    TestBed.runInInjectionContext(() => {
      const _asyncProcessOutput = asyncProcess({
        params: () => '5',
        loader: async ({ params }) => {
          return {
            id: params,
            name: 'John Doe',
            email: 'test@a.com',
          };
        },
      });

      expectTypeOf<typeof _asyncProcessOutput>().toEqualTypeOf<{
        readonly value: Signal<
          | {
              id: string;
              name: string;
              email: string;
            }
          | undefined
        >;
        readonly safeValue: Signal<
          | {
              id: string;
              name: string;
              email: string;
            }
          | undefined
        >;
        readonly status: Signal<ResourceStatus>;
        readonly error: Signal<Error | undefined>;
        readonly isLoading: Signal<boolean>;
        hasValue: () => boolean;
        readonly resourceParamsSrc: Signal<string | undefined>;
        hasException: Signal<boolean>;
        exceptions: Signal<{
          list: never[];
          params?: never;
          loader?: never;
        }>;
      }>();
    });
  });

  it('should infer correctly the types of asyncProcess with params and identifier', () => {
    TestBed.runInInjectionContext(() => {
      const _asyncProcessOutput = asyncProcess({
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

      const entity = _asyncProcessOutput.select('5');
      expectTypeOf(entity).toEqualTypeOf<
        | ({
            readonly value: Signal<
              | {
                  id: string;
                  name: string;
                  email: string;
                }
              | undefined
            >;
            readonly status: Signal<ResourceStatus>;
            readonly error: Signal<Error | undefined>;
            readonly isLoading: Signal<boolean>;
            readonly safeValue: Signal<
              | {
                  id: string;
                  name: string;
                  email: string;
                }
              | undefined
            >;
            hasValue(): boolean;
          } & EmptyAsyncProcessExceptions)
        | undefined
      >();
    });
  });
});

describe('asyncProcess — providers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('providers are applied to asyncProcess method generator', async () => {
    const callLog: string[] = [];
    const trackingWrapper: FnWrapper = function* (factory, thisArg, args) {
      callLog.push('method');
      return yield* (factory as (...a: unknown[]) => Generator<unknown, unknown, unknown>).apply(
        thisArg as object,
        args,
      );
    };

    await TestBed.runInInjectionContext(async () => {
      const processRef = asyncProcess({
        providers: [provideFnWrapper(trackingWrapper)],
        method: function* (id: string) {
          return id;
        },
        loader: async ({ params }) => ({ id: params }),
      });

      expect(callLog).toEqual([]);
      processRef.method('user-1');
      await vi.runAllTimersAsync();
      expect(callLog).toContain('method');
    });
  });

  it('providers scoped to one asyncProcess do not affect a sibling', async () => {
    const callLog: string[] = [];
    const trackingWrapper: FnWrapper = function* (factory, thisArg, args) {
      callLog.push('called');
      return yield* (factory as (...a: unknown[]) => Generator<unknown, unknown, unknown>).apply(
        thisArg as object,
        args,
      );
    };

    await TestBed.runInInjectionContext(async () => {
      const withProvider = asyncProcess({
        providers: [provideFnWrapper(trackingWrapper)],
        method: function* (id: string) {
          return id;
        },
        loader: async ({ params }) => ({ id: params }),
      });
      const withoutProvider = asyncProcess({
        method: function* (id: string) {
          return id;
        },
        loader: async ({ params }) => ({ id: params }),
      });

      withoutProvider.method('x');
      await vi.runAllTimersAsync();
      expect(callLog).toEqual([]);

      withProvider.method('x');
      await vi.runAllTimersAsync();
      expect(callLog).toContain('called');
    });
  });

  it('typing: asyncProcess accepts BrandedServiceProvider in providers without type errors', () => {
    const { AsyncServiceToYield, provideAsyncService } = craftService(
      { name: 'AsyncService', scope: 'toProvide' },
      () => ({ getValue: () => 42 }),
    );

    TestBed.runInInjectionContext(() => {
      const withoutProviders = asyncProcess({
        method: (id: string) => id,
        loader: function* ({ params }) {
          yield* AsyncServiceToYield();
          return Promise.resolve({ id: params });
        },
      });
      type WithoutDeps = ExtractDeps<typeof withoutProviders>;
      expectTypeOf<'AsyncService' extends keyof WithoutDeps ? true : false>().toEqualTypeOf<true>();

      const withProviders = asyncProcess({
        providers: [provideAsyncService()],
        method: (id: string) => id,
        loader: async ({ params }) => ({ id: params }),
      });
      expectTypeOf(withProviders.method).toBeFunction();
    });
  });
});

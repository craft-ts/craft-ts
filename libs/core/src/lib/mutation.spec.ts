import { ResourceStatus, Signal, WritableSignal, signal } from '@angular/core';
import { afterRecomputation } from './after-recomputation';
import { signalSource } from './signal-source';
import { ReadonlySource } from './util/source.type';
import { TestBed } from '@angular/core/testing';
import { Equal, Expect } from 'test-type';
import { mutation, MutationOutput } from './mutation';
import { craftMutations } from './craft-mutations';
import { craftException, CraftExceptionResult } from './craft-exception';

type EmptyMutationExceptions = {
  hasException: Signal<boolean>;
  exceptions: Signal<{
    list: never[];
    params?: never;
    loader?: never;
  }>;
};

describe('mutation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });
  it('should enable to define a mutation that can be call with the method', async () => {
    await TestBed.runInInjectionContext(async () => {
      const mutationInstance = mutation({
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
          type ExpectSearchChange = Expect<Equal<typeof searchChange, string>>;
          await new Promise((resolve) => setTimeout(resolve, timeToWait));
          return { searchChange };
        },
      });

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
      }>();
      const test = afterRecomputation(
        searchSource,
        (searchConfig) => searchConfig,
      );
      const result = test();
      const myMutation = mutation({
        method: afterRecomputation(
          searchSource,
          (searchConfig) => searchConfig,
        ),
        loader: async ({ params: { timeToWait, searchChange } }) => {
          type ExpectTimeToWait = Expect<Equal<typeof timeToWait, number>>;
          type ExpectSearchChange = Expect<Equal<typeof searchChange, string>>;
          await new Promise((resolve) => setTimeout(resolve, timeToWait));
          return { searchChange };
        },
      });

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

  it('should return undefined with safeValue when status is error', async () => {
    await TestBed.runInInjectionContext(async () => {
      const mutationInstance = mutation({
        method: (shouldFail: boolean) => shouldFail,
        loader: async ({ params: shouldFail }) => {
          if (shouldFail) {
            throw new Error('Test error');
          }
          return { success: true };
        },
      });

      expect(mutationInstance.status()).toBe('idle');
      mutationInstance.mutate(true);
      expect(mutationInstance.status()).toBe('loading');
      await vi.runAllTimersAsync();
      expect(mutationInstance.status()).toBe('error');
      expect(mutationInstance.error()).toBeInstanceOf(Error);
      expect(mutationInstance.error()?.message).toBe('Test error');
      expect(mutationInstance.hasValue()).toBe(false);

      // safeValue should return undefined without throwing
      expect(mutationInstance.safeValue()).toBeUndefined();
    });
  });
});

describe('mutation types without identifier', () => {
  it('should infer correctly the types of mutation', () => {
    TestBed.runInInjectionContext(() => {
      const mutationsOutput = craftMutations(() => ({
        // should enable to provide multiples status
        // should provide async method by id
        searchChange: mutation({
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
        filterChange: mutation(
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
      }));

      type props = ReturnType<ReturnType<typeof mutationsOutput>>['props'];
      type s = props['filterChange'];
      expectTypeOf<props>().toEqualTypeOf<{
        searchChange: {
          '~InternalType': 'Used to avoid TS type erasure';
          readonly error: Signal<Error | undefined>;
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
          readonly isLoading: Signal<boolean>;
          hasValue: () => boolean;
          readonly resourceParamsSrc: WritableSignal<
            NoInfer<{
              timeToWait: number;
              searchChange: string;
            }>
          >;
          hasException: Signal<boolean>;
          exceptions: Signal<{
            list: never[];
            params?: never;
            loader?: never;
          }>;
          type: 'resourceLike';
          kind: 'mutation';
        };
        filterChange: {
          '~InternalType': 'Used to avoid TS type erasure';
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
          readonly resourceParamsSrc: WritableSignal<
            NoInfer<{
              filter: string;
            }>
          >;
          hasException: Signal<boolean>;
          exceptions: Signal<{
            list: never[];
            params?: never;
            loader?: never;
          }>;
          additionalInsertion: 'injectedValue';
          type: 'resourceLike';
          kind: 'mutation';
        };
      }>();

      type methods = ReturnType<ReturnType<typeof mutationsOutput>>['methods'];
      expectTypeOf<methods>().toEqualTypeOf<
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
      const searchSource = signalSource<{ searchChangeText: string }>();
      const mutationsOutput = craftMutations(() => ({
        // should enable to provide multiples status
        // should provide async method by id
        searchChange: mutation({
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
        filterChange: mutation(
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
      }));

      type props = ReturnType<ReturnType<typeof mutationsOutput>>['props'];
      expectTypeOf<props>().toEqualTypeOf<{
        searchChange: {
          '~InternalType': 'Used to avoid TS type erasure';
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
          hasException: Signal<boolean>;
          exceptions: Signal<{
            list: never[];
            params?: never;
            loader?: never;
          }>;
          type: 'resourceLike';
          kind: 'mutation';
        };
        filterChange: {
          '~InternalType': 'Used to avoid TS type erasure';
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
          readonly resourceParamsSrc: WritableSignal<
            NoInfer<{
              filter: string;
            }>
          >;
          hasException: Signal<boolean>;
          exceptions: Signal<{
            list: never[];
            params?: never;
            loader?: never;
          }>;
          additionalInsertion: 'injectedValue';
          type: 'resourceLike';
          kind: 'mutation';
        };
      }>();

      type methods = ReturnType<ReturnType<typeof mutationsOutput>>['methods'];
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
      const _mutationsOutput = mutation({
        method: (searchChange: string) => {
          return searchChange;
        },
        loader: async ({ params: searchChange }) => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return { searchChange };
        },
      });
      expectTypeOf<typeof _mutationsOutput>().toEqualTypeOf<
        MutationOutput<
          {
            searchChange: string;
          },
          string,
          string,
          string,
          unknown,
          {}
        >
      >();
    });
  });

  it('should infer correctly the mutation bind to a source', () => {
    TestBed.runInInjectionContext(() => {
      const searchSource = signalSource<{ searchChange: string }>();

      const _mutationsOutput = mutation({
        method: afterRecomputation(searchSource, (searchChange) => {
          return searchChange;
        }),
        loader: async ({ params: searchChange }) => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return { searchChangeResult: searchChange.searchChange };
        },
      });
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
          {}
        >
      >();
    });
  });
});

describe('mutation types with identifier', () => {
  it('should infer correctly the types of mutation', () => {
    TestBed.runInInjectionContext(() => {
      const mutationsOutput = craftMutations(() => ({
        // should enable to provide multiples status
        // should provide async method by id
        searchChange: mutation({
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
            type ExpectTimeToWait = Expect<Equal<typeof timeToWait, number>>;
            type ExpectSearchChange = Expect<
              Equal<typeof searchChange, string>
            >;
            await new Promise((resolve) => setTimeout(resolve, timeToWait));
            return { searchChange };
          },
        }),
        filterChange: mutation(
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
      }));

      type props = ReturnType<ReturnType<typeof mutationsOutput>>['props'];
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
          } & EmptyMutationExceptions)
        | undefined
      >();

      type f = props['filterChange'];
      //.  ^?

      const filter = {} as f;
      expectTypeOf<typeof filter>().toEqualTypeOf<{
        '~InternalType': 'Used to avoid TS type erasure';
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
        readonly resourceParamsSrc: WritableSignal<
          NoInfer<{
            filter: string;
          }>
        >;
        hasException: Signal<boolean>;
        exceptions: Signal<{
          list: never[];
          params?: never;
          loader?: never;
        }>;
        additionalInsertion: 'injectedValue';
        type: 'resourceLike';
        kind: 'mutation';
      }>();

      type methods = ReturnType<ReturnType<typeof mutationsOutput>>['methods'];
      expectTypeOf<methods>().toEqualTypeOf<
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
      const searchSource = signalSource<{ searchChangeText: string }>();
      const mutationsOutput = craftMutations(() => ({
        // should enable to provide multiples status
        // should provide async method by id
        searchChange: mutation({
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
        filterChange: mutation(
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
      }));

      type props = ReturnType<ReturnType<typeof mutationsOutput>>['props'];
      try {
        const search = mutationsOutput({} as any, {} as any)(
          {} as any,
          {} as any,
          {} as any,
          {} as any,
        ).props.searchChange.select('test');
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
            } & EmptyMutationExceptions)
          | undefined
        >();

        const filter = mutationsOutput({} as any, {} as any)(
          {} as any,
          {} as any,
          {} as any,
          {} as any,
        ).props.filterChange;
        expectTypeOf<typeof filter>().toEqualTypeOf<{
          '~InternalType': 'Used to avoid TS type erasure';
          readonly error: Signal<Error | undefined>;
          readonly value: Signal<
            | {
                filter: string;
              }
            | undefined
          >;
          readonly status: Signal<ResourceStatus>;
          readonly isLoading: Signal<boolean>;
          hasValue: () => boolean;
          readonly safeValue: Signal<
            | {
                filter: string;
              }
            | undefined
          >;
          readonly resourceParamsSrc: WritableSignal<
            NoInfer<{
              filter: string;
            }>
          >;
          hasException: Signal<boolean>;
          exceptions: Signal<{
            list: never[];
            params?: never;
            loader?: never;
          }>;
          additionalInsertion: 'injectedValue';
          type: 'resourceLike';
          kind: 'mutation';
        }>();

        type methods = ReturnType<
          ReturnType<typeof mutationsOutput>
        >['methods'];
        //   ^?
        expectTypeOf<methods>().toEqualTypeOf<{
          mutateFilterChange: (args: { filter: string }) => {
            filter: string;
          };
        }>();
      } catch (error) {
        console.error(error);
      }
    });
  });

  it('should infer correctly the mutation bind to a method', () => {
    TestBed.runInInjectionContext(() => {
      const _mutationsOutput = mutation({
        method: (searchChange: string) => {
          return searchChange;
        },
        identifier: (searchChange) => searchChange,
        loader: async ({ params: searchChange }) => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return { searchChange };
        },
      });
      const _entity = _mutationsOutput.select('test');
      expectTypeOf<typeof _entity>().toEqualTypeOf<
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
          } & EmptyMutationExceptions)
        | undefined
      >();
    });
  });

  it('should infer correctly the mutation bind to a source', () => {
    TestBed.runInInjectionContext(() => {
      const searchSource = signalSource<{ searchChange: string }>();

      const _mutationsOutput = mutation({
        method: afterRecomputation(searchSource, (searchChange) => {
          return searchChange;
        }),
        identifier: (params) => params.searchChange,
        loader: async ({ params: searchChange }) => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return { searchChangeResult: searchChange.searchChange };
        },
      });

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

  it('typing: captures exception returned by method and loader', async () => {
    await TestBed.runInInjectionContext(async () => {
      const shouldFail = signal(true);
      const mutationRef = mutation({
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
      });

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

      const mutationRef = mutation({
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
      });

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
      const mutationRef = mutation({
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
      const mutationRef = mutation({
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

      const mutationRef = mutation({
        method: (value: string) =>
          value.length < 3
            ? craftException(
                { code: 'SEARCH_TERM_TOO_SHORT' },
                { min: 3, received: value.length },
              )
            : value,
        loader: loader as any,
      });

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

  it('captures exception returned by loader without exposing it in safeValue', async () => {
    await TestBed.runInInjectionContext(async () => {
      const mutationRef = mutation({
        method: (value: string) => value,
        loader: async () =>
          craftException(
            { code: 'INVALID_USER_ID', scope: 'loader' },
            { from: 'loader' as const },
          ),
      });

      mutationRef.mutate('user-1');
      await vi.runAllTimersAsync();

      expect(mutationRef.exceptions().loader?.INVALID_USER_ID).toEqual({
        from: 'loader',
      });
      expect(mutationRef.safeValue()).toBeUndefined();
      expect(mutationRef.hasException()).toBe(true);
    });
  });

  it('keeps method exceptions global in parallel mutation', async () => {
    await TestBed.runInInjectionContext(async () => {
      const mutationRef = mutation({
        method: (id: 'A' | 'B') =>
          craftException({ code: 'INVALID_ID' }, { params: id }),
        identifier: (id) => id,
        loader: async ({ params }) => ({ id: params }),
      });

      mutationRef.mutate('A');
      await vi.runAllTimersAsync();

      expect(mutationRef.exceptions().params?.payload).toEqual({ params: 'A' });
      expect(mutationRef.exceptions().loader).toEqual({});
    });
  });
});

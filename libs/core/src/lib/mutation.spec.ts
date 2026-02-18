import { ResourceStatus, Signal, WritableSignal } from '@angular/core';
import { afterRecomputation } from './after-recomputation';
import { signalSource } from './signal-source';
import { ReadonlySource } from './util/source.type';
import { TestBed } from '@angular/core/testing';
import { Equal, Expect } from 'test-type';
import { mutation, MutationOutput } from './mutation';
import { craftMutations } from './craft-mutations';
import { methodException } from './business-exception';

describe('mutation', () => {
  it('should enable to define a mutation that can be call with the method', async () => {
    TestBed.runInInjectionContext(async () => {
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
      expect(mutationInstance.value()).toBe('test');
    });
  });

  it('should enable to define async method bind to a source', async () => {
    TestBed.runInInjectionContext(async () => {
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
      expect(myMutation.status()).toBe('loading');
      await vi.runAllTimersAsync();
      expect(myMutation.status()).toBe('resolved');
      expect(myMutation.value()).toBe('test');
    });
  });

  it('should return undefined with safeValue when status is error', async () => {
    TestBed.runInInjectionContext(async () => {
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

  it('should capture method exceptions and skip mutation execution', () => {
    TestBed.runInInjectionContext(() => {
      const loaderSpy = vi.fn(async ({ params }: { params: { id: string } }) => ({
        id: params.id,
      }));

      const mutationInstance = mutation({
        method: (id: string) =>
          id.length === 0
            ? methodException('MISSING_ID', {
                field: 'id',
              })
            : { id },
        loader: loaderSpy,
      });

      mutationInstance.mutate('');

      expect(loaderSpy).not.toHaveBeenCalled();
      expect(mutationInstance.resourceParamsSrc()).toBeUndefined();
      expect(mutationInstance.exceptions?.().method).toEqual({
        MISSING_ID: {
          field: 'id',
        },
      });
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
      type s = props['searchChange'];
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
        | {
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
          }
        | undefined
      >();

      type f = props['filterChange'];
      //.  ^?

      const filter = {} as f;
      expectTypeOf(filter).toEqualTypeOf<{
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
          | {
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
            }
          | undefined
        >();

        const filter = mutationsOutput({} as any, {} as any)(
          {} as any,
          {} as any,
          {} as any,
          {} as any,
        ).props.filterChange;
        expectTypeOf(filter).toEqualTypeOf<{
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
        | {
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
          }
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

import { craftAsyncProcesses } from './craft-async-process';
import { asyncProcess } from './async-process';
import { ResourceStatus, Signal } from '@angular/core';
import { afterRecomputation } from './after-recomputation';
import { signalSource } from './signal-source';
import { ReadonlySource } from './util/source.type';
import { TestBed } from '@angular/core/testing';
import { Equal, Expect } from 'test-type';
describe('AsyncProcess', () => {
  it('should enable to define async method and be called with a method', async () => {
    TestBed.runInInjectionContext(async () => {
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
          type ExpectTimeToWait = Expect<Equal<typeof timeToWait, number>>;
          type ExpectSearchChange = Expect<Equal<typeof searchChange, string>>;
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
      expect(myAsyncProcess.value()).toBe('test');
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
      const myAsyncProcess = asyncProcess({
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
      expect(myAsyncProcess.status()).toBe('loading');
      await vi.runAllTimersAsync();
      expect(myAsyncProcess.status()).toBe('resolved');
      expect(myAsyncProcess.value()).toBe('test');
    });
  });

  it('should return undefined with safeValue when status is error', async () => {
    TestBed.runInInjectionContext(async () => {
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
});

describe('AsyncProcess types without identifier', () => {
  it('should infer correctly the types of AsyncProcess', () => {
    TestBed.runInInjectionContext(() => {
      const AsyncProcessOutput = craftAsyncProcesses(() => ({
        // should enable to provide multiples status
        // should provide async method by id
        searchChange: asyncProcess({
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
        filterChange: asyncProcess(
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

      type props = ReturnType<ReturnType<typeof AsyncProcessOutput>>['props'];
      type s = props['searchChange'];
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
        };
      }>();

      type methods = ReturnType<
        ReturnType<typeof AsyncProcessOutput>
      >['methods'];
      expectTypeOf<methods>().toEqualTypeOf<
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
      const AsyncProcessOutput = craftAsyncProcesses(() => ({
        // should enable to provide multiples status
        // should provide async method by id
        searchChange: asyncProcess({
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
        filterChange: asyncProcess(
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

      type props = ReturnType<ReturnType<typeof AsyncProcessOutput>>['props'];
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
        };
      }>();

      type methods = ReturnType<
        ReturnType<typeof AsyncProcessOutput>
      >['methods'];
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
      }>();
    });
  });
});

describe('AsyncProcess types with identifier', () => {
  it('should infer correctly the types of AsyncProcess', () => {
    TestBed.runInInjectionContext(() => {
      const AsyncProcessOutput = craftAsyncProcesses(() => ({
        // should enable to provide multiples status
        // should provide async method by id
        searchChange: asyncProcess({
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
        filterChange: asyncProcess(
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

      type props = ReturnType<ReturnType<typeof AsyncProcessOutput>>['props'];
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
      }>();

      type methods = ReturnType<
        ReturnType<typeof AsyncProcessOutput>
      >['methods'];
      expectTypeOf<methods>().toEqualTypeOf<
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
      const AsyncProcessOutput = craftAsyncProcesses(() => ({
        // should enable to provide multiples status
        // should provide async method by id
        searchChange: asyncProcess({
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
        filterChange: asyncProcess(
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

      type props = ReturnType<ReturnType<typeof AsyncProcessOutput>>['props'];
      try {
        const search = AsyncProcessOutput({} as any, {} as any)(
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

        const filter = AsyncProcessOutput({} as any, {} as any)(
          {} as any,
          {} as any,
          {} as any,
          {} as any,
        ).props.filterChange;
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
        }>();

        type methods = ReturnType<
          ReturnType<typeof AsyncProcessOutput>
        >['methods'];
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

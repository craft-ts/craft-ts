import { TestBed } from '@angular/core/testing';
import { query } from './query';
import {
  contract,
  craft,
  EmptyContext,
  partialContext,
  PartialContext,
} from './craft';
import { mutation } from './mutation';
import { inject, linkedSignal, Signal, signal } from '@angular/core';
import { craftInputs } from './craft-inputs';
import { craftState } from './craft-state';
import { signalSource } from './signal-source';
import { craftSources } from './craft-sources';
import { afterRecomputation } from './after-recomputation';
import { IsAny } from './util/types/util.type';
import { craftQuery } from './craft-query';
import { craftMutations } from './craft-mutations';
import { ExcludeCommonKeys } from './util/util.type';
import { state } from './state';
import { Equal, Expect } from 'test-type';
import { queryParam } from './query-param';
import { craftQueryParam } from './craft-query-param';
import { provideRouter } from '@angular/router';
import { insertReactOnMutation } from './insert-react-on-mutation';
import { craftQueryParams } from './craft-query-params';
import { source$ } from './source$';

describe('craft', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should enable creating queries and mutations', async () => {
    const { injectCraft, __META_STORE_CONTEXT } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftMutations(() => ({
        save: mutation({
          method: (data: { id: number; name: string }) => data,
          loader: async ({ params }) => params,
        }),
      })),
      craftQuery('test', () =>
        query({
          params: () => 5,
          loader: async ({ params: id }) => ({ id, name: 'test' }),
        }),
      ),
      craftQuery('test2', () =>
        query({
          params: () => 3,
          loader: async ({ params: id }) => ({ id, name: 'test2' }),
        }),
      ),
    );
    await TestBed.runInInjectionContext(async () => {
      const testServerState = injectCraft();

      await vi.runAllTimersAsync();
      expect(testServerState).toBeDefined();
      expect(testServerState.test.value).toBeDefined();
      expect(testServerState.test.value()).toEqual({
        id: 5,
        name: 'test',
      });
      expect(testServerState.test2.value).toBeDefined();
      expect(testServerState.test2.value()).toEqual({
        id: 3,
        name: 'test2',
      });

      expect(testServerState.mutateSave).toBeDefined();
      testServerState.mutateSave({ id: 3, name: 'test' });
      await vi.runAllTimersAsync();
      expect(testServerState.save.value()).toEqual({
        id: 3,
        name: 'test',
      });
    });
  });

  it('a query can react to a mutation change', async () => {
    await TestBed.runInInjectionContext(async () => {
      const { injectCraft } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftMutations(() => ({
          save: mutation({
            method: (data: { id: number; name: string }) => data,
            loader: async ({ params }) => {
              if (params.name === 'error') {
                throw new Error('Error');
              }
              return params;
            },
          }),
        })),
        craftQuery('test', ({ save }) =>
          query(
            {
              params: () => 3,
              loader: async ({ params: id }) => {
                await wait(10000);
                return { id, name: 'test' };
              },
            },
            insertReactOnMutation(save, {
              optimisticUpdate: ({ mutationParams }) => mutationParams,
              reload: {
                onMutationError: true,
              },
            }),
          ),
        ),
      );
      const state = injectCraft();
      await vi.runAllTimersAsync();
      expect(state).toBeDefined();
      expect(state.test.value).toBeDefined();
      expect(state.test.value()).toEqual({ id: 3, name: 'test' });

      state.mutateSave({ id: 3, name: 'testMutated' });
      await vi.runAllTimersAsync();
      expect(state.test.value()).toEqual({ id: 3, name: 'testMutated' });

      state.mutateSave({ id: 3, name: 'error' });
      await vi.advanceTimersByTimeAsync(5000);
      expect(state.test.status()).toEqual('reloading');
    });
  });

  it('should enable declaring useMutationById and useQuery', async () => {
    await TestBed.runInInjectionContext(async () => {
      const { injectCraft } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftMutations(() => ({
          save: mutation({
            method: (data: { id: string; name: string }) => data,
            identifier: (params) => params.id,
            loader: async ({ params }) => {
              if (params.name === 'error') {
                throw new Error('Error');
              }
              return params;
            },
          }),
        })),
        craftQuery('test', ({ save }) =>
          query(
            {
              params: () => '3',
              loader: async ({ params: id }) => {
                await wait(10000);
                return { id, name: 'test' };
              },
            },
            insertReactOnMutation(save, {
              filter: ({ mutationParams, queryResource }) =>
                mutationParams.id === queryResource.value()?.id,
              optimisticUpdate: ({ mutationParams }) => mutationParams,
              reload: {
                onMutationError: true,
              },
            }),
          ),
        ),
      );
      const q = injectCraft();
      await vi.runAllTimersAsync();
      expect(q).toBeDefined();
      expect(q.test.value).toBeDefined();
      expect(q.test.value()).toEqual({ id: '3', name: 'test' });

      q.mutateSave({ id: '3', name: 'testMutated' });
      await vi.runAllTimersAsync();
      expect(q.test.value()).toEqual({ id: '3', name: 'testMutated' });

      q.mutateSave({ id: '3', name: 'error' });
      await vi.advanceTimersByTimeAsync(5000);
      expect(q.test.status()).toEqual('reloading');
    });
  });

  it('should enable declaring useMutationById and craftQueryById', async () => {
    await TestBed.runInInjectionContext(async () => {
      const { injectCraft } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftMutations(() => ({
          save: mutation({
            method: (data: { id: string; name: string }) => data,
            identifier: (params) => '' + params.id,
            loader: async ({ params }) => {
              if (params.name === 'error') {
                throw new Error('Error');
              }
              return params;
            },
          }),
        })),
        craftQuery('test', ({ save }) =>
          query(
            {
              params: () => '3',
              identifier: (data) => data,
              loader: async ({ params: id }) => {
                await wait(10000);
                return { id, name: 'test' };
              },
            },
            insertReactOnMutation(save, {
              filter: ({ mutationParams, queryIdentifier, queryResource }) =>
                mutationParams.id === queryIdentifier,
              optimisticUpdate: ({ mutationParams }) => mutationParams,
              reload: {
                onMutationError: true,
              },
            }),
          ),
        ),
      );
      const m = mutation({
        method: (data: { id: string; name: string }) => data,
        loader: async ({ params }) => params,
      });
      const r = query(
        {
          params: () => '3',
          identifier: (data) => data,
          loader: async ({ params: id }) => {
            await wait(10000);
            return { id, name: 'test' };
          },
        },
        insertReactOnMutation(m, {
          filter: ({ mutationParams, queryIdentifier }) =>
            mutationParams.id === queryIdentifier,
          optimisticUpdate: ({ mutationParams }) => mutationParams,
          reload: {
            onMutationError: true,
          },
        }),
      );
      const q = injectCraft();
      await vi.runAllTimersAsync();
      expect(q).toBeDefined();
      expect(q.test.select('3')?.value).toBeDefined();
      expect(q.test.select('3')?.value()).toEqual({
        id: '3',
        name: 'test',
      });

      q.mutateSave({ id: '3', name: 'testMutated' });
      await vi.runAllTimersAsync();
      expect(q.test.select('3')?.value()).toEqual({
        id: '3',
        name: 'testMutated',
      });

      q.mutateSave({ id: '3', name: 'error' });
      await vi.advanceTimersByTimeAsync(5000);
      expect(q.test.select('3')?.status()).toEqual('reloading');
    });
  });

  it('should enable exporting standalone outputs', async () => {
    const { setPaginationQueryParams } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftQueryParam('pagination', () =>
        queryParam({
          state: {
            page: {
              fallbackValue: 1,
              parse: (value: string) => parseInt(value, 10),
              serialize: (value: unknown) => String(value),
            },
            pageSize: {
              fallbackValue: 10,
              parse: (value: string) => parseInt(value, 10),
              serialize: (value: unknown) => String(value),
            },
          },
        }),
      ),
    );

    expect(setPaginationQueryParams).toBeDefined();
  });

  it('should enable to bind the inputs and the outputs of the store when using injectCraft', async () => {
    await TestBed.runInInjectionContext(async () => {
      const { injectCraft } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftInputs({
          myParams: undefined as number | undefined,
        }),
        craftSources(() => ({
          reset: signalSource<string>(),
        })),
        craftState('numberList', ({ myParams, reset }) =>
          state(
            linkedSignal(() => [myParams() ?? 0]).asReadonly(),
            ({ set, state }) => ({
              addNumber: (numberValue: number) => {
                console.log('numberValue', numberValue);
                const stateValue = state();
                set([...stateValue, numberValue]);
              },
              filterNumber: (filterValue: number) => {
                const stateValue = state();
                set(stateValue.filter((num) => num !== filterValue));
              },
              reset: afterRecomputation(reset, () => {
                set([]);
              }),
            }),
          ),
        ),
      );

      const addNumberSource = signalSource<number>();
      const resetSource = signalSource<string>();
      const store = injectCraft({
        inputs: {
          myParams: signal(10),
        },
        methods: {
          setReset: resetSource,
          numberListAddNumber: addNumberSource,
          // reset: resetSource,
          // addNumber: addNumberSource,
        },
        // sources: {
        //   reset: resetSource,
        // },
      });
      expectTypeOf<IsAny<typeof store>>().toEqualTypeOf<false>();

      expectTypeOf(store.numberListFilterNumber).toBeFunction();
      //@ts-expect-error it should not be exposed, because connected to a Source
      type resetNotExposed = (typeof store)['reset'];

      await vi.runAllTimersAsync();
      expect(store.numberList()).toEqual([10]);

      addNumberSource.set(2);
      await vi.runAllTimersAsync();
      expect(store.numberList()).toEqual([10, 2]);

      store.numberListFilterNumber(10);
      expect(store.numberList()).toEqual([2]);
    });
  });
  it('should enable to plug a store to another store. Standalone outputs should be transmitted. Inputs that are not bind should be transmitted', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });
    await TestBed.runInInjectionContext(async () => {
      const {
        craftStore1,
        setPaginationQueryParams: setPaginationQueryParams1,
      } = craft(
        {
          name: 'store1',
          providedIn: 'root',
        },
        craftInputs({
          myParams1: undefined as string | undefined,
          myParams2: undefined as string | undefined,
        }),
        craftSources(() => ({
          reset: signalSource<string>(),
        })),
        craftState('numberList1', ({ reset }) =>
          state([1], ({ state, set }) => ({
            addNumber: (numberValue: number) => {
              console.log('numberValue', numberValue);
              const stateValue = state();
              set([...stateValue, numberValue]);
            },
            filterNumber: (filterValue: number) => {
              const stateValue = state();
              set(stateValue.filter((num) => num !== filterValue));
            },
            reset: afterRecomputation(reset, () => {
              set([]);
            }),
          })),
        ),
        craftQueryParam('pagination', () =>
          queryParam({
            state: {
              page: {
                fallbackValue: 1,
                parse: (value: string) => parseInt(value, 10),
                serialize: (value: unknown) => String(value),
              },
              pageSize: {
                fallbackValue: 10,
                parse: (value: string) => parseInt(value, 10),
                serialize: (value: unknown) => String(value),
              },
            },
          }),
        ),
      );

      const {
        injectCraft,
        setPaginationQueryParams,
        __META_STORE_CONTEXT,
        _inputs,
      } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftInputs({
          myParams: undefined as string | undefined,
        }),
        craftSources(() => ({
          reset: signalSource<string>(),
        })),
        craftStore1(({ myParams, reset }) => ({
          // here myParams2 is not required, but required when injecting the hist store
          inputs: {
            myParams1: myParams,
          },
          methods: {
            setReset: reset,
          },
        })),
        craftState('numberList2', ({ reset }) =>
          state([1], ({ state, set }) => ({
            addNumber2: (numberValue: number) => {
              const stateValue = state();
              set([...stateValue, numberValue]);
            },
            filterNumber2: (filterValue: number) => {
              const stateValue = state();
              set(stateValue.filter((num) => num !== filterValue));
            },
            reset2: afterRecomputation(reset, () => {
              set([]);
            }),
          })),
        ),
      );
      await TestBed.runInInjectionContext(async () => {
        type test = (typeof __META_STORE_CONTEXT)['context']['_inputs'];
        const addNumberSource = signalSource<number>();
        const resetSource = signalSource<string>();
        const store = injectCraft({
          inputs: {
            myParams: signal('PassMyParam'),
            // myParams2 must be provided here
            myParams2: signal('PassMyParam2'),
          },
          methods: {
            setReset: resetSource,
            numberList1AddNumber: addNumberSource,
            numberList2AddNumber2: addNumberSource,
            // reset: resetSource,
            // addNumber: addNumberSource,
          },
          // sources: {
          //   reset: resetSource,
          // },
        });
        expectTypeOf<IsAny<typeof store>>().toEqualTypeOf<false>();

        expectTypeOf(store.numberList1FilterNumber).toBeFunction();
        expectTypeOf(store.numberList2FilterNumber2).toBeFunction();
        //@ts-expect-error it should not be exposed, because connected to a Source
        type resetNotExposed = (typeof store)['reset'];

        // verify setPaginationQueryParams is exposed
        expectTypeOf<
          Parameters<typeof setPaginationQueryParams>[0]
        >().toEqualTypeOf<{
          page?: number | undefined;
          pageSize?: number | undefined;
        }>();
        console.log('setPaginationQueryParams', setPaginationQueryParams);
        console.log('setPaginationQueryParams1', setPaginationQueryParams1);
        expect(setPaginationQueryParams).toBeDefined();
      });
    });
  });

  it('should enable to plug global store to another. The plugged global store will share an unique instance', async () => {
    const { craftDataPagination } = craft(
      {
        name: 'dataPagination',
        providedIn: 'root',
      },
      craftState('numberList', () =>
        state([1], ({ state, set }) => ({
          addNumber: (numberValue: number) => {
            const stateValue = state();
            set([...stateValue, numberValue]);
          },
          reset: () => {
            set([]);
          },
        })),
      ),
    );

    const { injectHost1Craft } = craft(
      {
        name: 'host1',
        providedIn: 'root',
      },
      craftSources(() => ({
        increment: signalSource<{}>(),
        decrement: signalSource<{}>(),
        reset: signalSource<{}>(),
      })),
      craftState('counter', ({ increment, decrement }) =>
        state(0, ({ state, set }) => ({
          increment: afterRecomputation(increment, () => set(state() + 1)),
          decrement: afterRecomputation(decrement, () => set(state() - 1)),
          reset: () => 0,
        })),
      ),
      craftDataPagination(({ reset }) => ({
        methods: {
          numberListReset: reset,
        },
      })),
    );

    const { injectHost2Craft } = craft(
      {
        name: 'host2',
        providedIn: 'root',
      },
      craftSources(() => ({
        increment: signalSource<{}>(),
        decrement: signalSource<{}>(),
        reset: signalSource<{}>(),
      })),
      craftState('counter', ({ increment, decrement }) =>
        state(0, ({ state, set }) => ({
          increment: afterRecomputation(increment, () => set(state() + 1)),
          decrement: afterRecomputation(decrement, () => set(state() - 1)),
          reset: () => 0,
        })),
      ),
      craftDataPagination(({ reset }) => ({
        methods: {
          numberListReset: reset,
        },
      })),
    );

    await TestBed.runInInjectionContext(async () => {
      const host1 = injectHost1Craft();
      const host2 = injectHost2Craft();

      host1.numberListAddNumber(2);
      expect(host1.numberList()).toEqual([1, 2]);
      expect(host2.numberList()).toEqual([1, 2]);
    });
  });

  it('should enable to plug feature store to another. The plugged feature store will not share an unique instance', async () => {
    const { craftSharedFeature } = craft(
      {
        name: 'sharedFeature',
        providedIn: 'feature',
      },
      craftInputs({
        defaultNumber: undefined as number | undefined,
      }),
      craftState('numberList', ({ defaultNumber }) =>
        state(
          linkedSignal(() => [defaultNumber() ?? 1]).asReadonly(),
          ({ state, set }) => ({
            addNumber: () => {
              return set([...state(), defaultNumber() ?? 1]);
            },
            reset: () => {
              set([]);
            },
          }),
        ),
      ),
    );

    const { injectHost1Craft } = craft(
      {
        name: 'host1',
        providedIn: 'root',
      },
      craftSources(() => ({
        increment: signalSource<{}>(),
        decrement: signalSource<{}>(),
        reset: signalSource<{}>(),
      })),
      craftState('counter', ({ increment, decrement }) =>
        state(1, ({ state, set }) => ({
          increment: afterRecomputation(increment, () => set(state() + 1)),
          decrement: afterRecomputation(decrement, () => set(state() - 1)),
          reset: () => set(0),
        })),
      ),
      craftSharedFeature(({ reset, counter }) => ({
        inputs: {
          defaultNumber: counter,
        },
        methods: {
          numberListReset: reset,
        },
      })),
    );

    const { injectHost2Craft } = craft(
      {
        name: 'host2',
        providedIn: 'root',
      },
      craftSources(() => ({
        increment: signalSource<{}>(),
        decrement: signalSource<{}>(),
        reset: signalSource<{}>(),
      })),
      craftState('counter', ({ decrement }) =>
        state(1, ({ state, set }) => ({
          increment: () => set(state() + 1),
          decrement: afterRecomputation(decrement, () => set(state() - 1)),
          reset: () => set(0),
        })),
      ),
      craftSharedFeature(({ reset, counter }) => ({
        inputs: {
          defaultNumber: counter,
        },
        methods: {
          numberListReset: reset,
        },
      })),
    );

    await TestBed.runInInjectionContext(async () => {
      const host1 = injectHost1Craft();
      const host2 = injectHost2Craft();

      await vi.runAllTimersAsync();

      host2.counterIncrement();
      await vi.runAllTimersAsync();

      host2.numberListAddNumber();
      expect(host1.numberList()).toEqual([1]);
      expect(host2.numberList()).toEqual([2, 2]);
    });
  });
  it('should enable to plug feature store to another. The plugged feature store will not share an unique instance', async () => {
    const { craftDataPagination } = craft(
      {
        name: 'dataPagination',
        providedIn: 'feature',
      },
      craftState('numberList', () =>
        state([1], ({ state, set }) => ({
          addNumber: (numberValue: number) => {
            const stateValue = state();
            set([...stateValue, numberValue]);
          },
          reset: () => {
            set([]);
          },
        })),
      ),
    );

    const { injectHost1Craft } = craft(
      {
        name: 'host1',
        providedIn: 'root',
      },
      craftSources(() => ({
        increment: signalSource<{}>(),
        decrement: signalSource<{}>(),
        reset: signalSource<{}>(),
      })),
      craftState('counter', ({ increment, decrement }) =>
        state(0, ({ state, set }) => ({
          increment: afterRecomputation(increment, () => set(state() + 1)),
          decrement: afterRecomputation(decrement, () => set(state() - 1)),
          reset: () => 0,
        })),
      ),
      craftDataPagination(({ reset }) => ({
        methods: {
          numberListReset: reset,
        },
      })),
    );

    const { injectHost2Craft } = craft(
      {
        name: 'host2',
        providedIn: 'root',
      },
      craftSources(() => ({
        increment: signalSource<{}>(),
        decrement: signalSource<{}>(),
        reset: signalSource<{}>(),
      })),
      craftState('counter', ({ increment, decrement }) =>
        state(0, ({ state, set }) => ({
          increment: afterRecomputation(increment, () => set(state() + 1)),
          decrement: afterRecomputation(decrement, () => set(state() - 1)),
          reset: () => 0,
        })),
      ),
      craftDataPagination(({ reset }) => ({
        methods: {
          numberListReset: reset,
        },
      })),
    );
    await TestBed.runInInjectionContext(async () => {
      const host1 = injectHost1Craft();
      const host2 = injectHost2Craft();

      host1.numberListAddNumber(2);
      expect(host1.numberList()).toEqual([1, 2]);
      expect(host2.numberList()).toEqual([1]);
    });
  });

  it('should enable to plug global store to another. It is possible to not propagate the non set inputs (because, they can come from another place)', async () => {
    const { craftDataPagination } = craft(
      {
        name: 'dataPagination',
        providedIn: 'root',
      },
      craftInputs({
        shouldNotBeExposed: undefined as number | undefined,
      }),
      craftState('numberList', () =>
        state([1], ({ state, set }) => ({
          addNumber: (numberValue: number) => {
            const stateValue = state();
            set([...stateValue, numberValue]);
          },
          reset: () => {
            set([]);
          },
        })),
      ),
    );

    const { injectHost1Craft, _HOST1_META_STORE_CONTEXT } = craft(
      {
        name: 'host1',
        providedIn: 'root',
      },
      craftSources(() => ({
        increment: signalSource<{}>(),
        decrement: signalSource<{}>(),
        reset: signalSource<{}>(),
      })),
      craftState('counter', ({ increment, decrement }) =>
        state(0, ({ state, set }) => ({
          increment: afterRecomputation(increment, () => set(state() + 1)),
          decrement: afterRecomputation(decrement, () => set(state() - 1)),
          reset: () => 0,
        })),
      ),
      craftDataPagination(({ reset, counter }) => ({
        inputs: {
          shouldNotBeExposed: counter,
        },
        methods: {
          numberListReset: reset,
        },
      })),
    );

    type r =
      (typeof _HOST1_META_STORE_CONTEXT)['context']['_dependencies']['dataPagination'];

    const { injectHost2Craft } = craft(
      {
        name: 'host2',
        providedIn: 'root',
      },
      craftSources(() => ({
        increment: signalSource<{}>(),
        decrement: signalSource<{}>(),
        reset: signalSource<{}>(),
      })),
      craftState('counter', ({ increment, decrement }) =>
        state(0, ({ state, set }) => ({
          increment: afterRecomputation(increment, () => set(state() + 1)),
          decrement: afterRecomputation(decrement, () => set(state() - 1)),
          reset: () => 0,
        })),
      ),
      craftDataPagination(({ reset, counter }) => ({
        inputs: {
          shouldNotBeExposed: 'EXTERNALLY_PROVIDED',
        },
        methods: {
          numberListReset: reset,
        },
      })),
    );
    TestBed.runInInjectionContext(() => {
      const host1 = injectHost1Craft();
      // 👇 no error, because shouldNotBeExposed is not propagated
      const host2 = injectHost2Craft();

      host1.numberListAddNumber(2);
      expect(host1.numberList()).toEqual([1, 2]);
      expect(host2.numberList()).toEqual([1, 2]);
    });
  });

  it('should enable to plug global store to another. It is possible to not propagate the non set inputs (because, they can come from another place)', async () => {
    const { craftDataPagination, _DATAPAGINATION_META_STORE_CONTEXT } = craft(
      {
        name: 'dataPagination',
        providedIn: 'root',
      },
      craftInputs({
        shouldNotBeExposed: undefined as number | undefined,
      }),
      craftState('numberList', () =>
        state([1], ({ state, set }) => ({
          addNumber: (numberValue: number) => {
            const stateValue = state();
            set([...stateValue, numberValue]);
          },
          reset: () => {
            set([]);
          },
        })),
      ),
    );

    expectTypeOf<
      (typeof _DATAPAGINATION_META_STORE_CONTEXT)['context']['methods']
    >().branded.toEqualTypeOf<
      {
        [x: `numberList${Capitalize<string>}`]: Function;
        numberListAddNumber: (numberValue: number) => void;
        numberListReset: () => void;
      } & Record<string, Function>
    >();

    expectTypeOf<
      (typeof _DATAPAGINATION_META_STORE_CONTEXT)['context']['props']
    >().branded.toEqualTypeOf<
      {
        numberList: Signal<number[]>;
      } & {}
    >();

    expectTypeOf<
      (typeof _DATAPAGINATION_META_STORE_CONTEXT)['context']['_inputs']
    >().toEqualTypeOf<{
      shouldNotBeExposed: Signal<number | undefined>;
    }>();

    const { injectHost1Craft, _HOST1_META_STORE_CONTEXT } = craft(
      {
        name: 'host1',
        providedIn: 'root',
      },
      craftSources(() => ({
        increment: signalSource<{}>(),
        decrement: signalSource<{}>(),
        reset: signalSource<{}>(),
      })),
      craftState('counter', ({ increment, decrement }) =>
        state(0, ({ state, set }) => ({
          increment: afterRecomputation(increment, () => set(state() + 1)),
          decrement: afterRecomputation(decrement, () => set(state() - 1)),
          reset: () => 0,
        })),
      ),
      craftDataPagination(({ reset, counter }) => ({
        inputs: {
          shouldNotBeExposed: counter,
          // test21: true,
        },
        methods: {
          numberListReset: reset,
        },
      })),
    );
    type t = Pick<
      (typeof _HOST1_META_STORE_CONTEXT)['context'],
      '_dependencies'
    >;
    expectTypeOf<
      (typeof _HOST1_META_STORE_CONTEXT)['storeConfig']
    >().toEqualTypeOf<{
      providedIn: 'root';
      name: 'host1';
      implements?: unknown;
    }>();

    expectTypeOf<
      (typeof _HOST1_META_STORE_CONTEXT)['context']['_dependencies']['dataPagination']['storeConfig']
    >().toEqualTypeOf<{
      providedIn: 'root';
      name: 'dataPagination';
      implements?: unknown;
    }>();

    TestBed.runInInjectionContext(() => {
      const host1 = injectHost1Craft();

      host1.numberListAddNumber(2);
      host1.setReset({});
      expect(host1.numberList()).toEqual([1, 2]);
    });
  });

  it('Typing: should add errorMethodMsg property  with the message You are trying to add methods that are not defined in the connected store..., If the connected methods name does not match', async () => {
    const { craftDataPagination, _DATAPAGINATION_META_STORE_CONTEXT } = craft(
      {
        name: 'dataPagination',
        providedIn: 'root',
      },
      craftInputs({
        shouldNotBeExposed: undefined as number | undefined,
      }),
      craftState('numberList', () =>
        state([1], ({ state, set }) => ({
          addNumber: (numberValue: number) => {
            const stateValue = state();
            set([...stateValue, numberValue]);
          },
          reset: () => {
            set([]);
          },
        })),
      ),
    );

    expectTypeOf<
      (typeof _DATAPAGINATION_META_STORE_CONTEXT)['storeConfig']
    >().toEqualTypeOf<{
      providedIn: 'root';
      name: 'dataPagination';
      implements?: unknown;
    }>();

    expectTypeOf<
      (typeof _DATAPAGINATION_META_STORE_CONTEXT)['context']['methods']
    >().branded.toEqualTypeOf<
      {
        [x: `numberList${Capitalize<string>}`]: Function;
        numberListAddNumber: (numberValue: number) => void;
        numberListReset: () => void;
      } & Record<string, Function>
    >();

    expectTypeOf<
      (typeof _DATAPAGINATION_META_STORE_CONTEXT)['context']['props']
    >().branded.toEqualTypeOf<
      {
        numberList: Signal<number[]>;
      } & {}
    >();

    expectTypeOf<
      (typeof _DATAPAGINATION_META_STORE_CONTEXT)['context']['_inputs']
    >().toEqualTypeOf<{
      shouldNotBeExposed: Signal<number | undefined>;
    }>();

    craft(
      {
        name: 'host1',
        providedIn: 'root',
      },
      craftSources(() => ({
        increment: signalSource<{}>(),
        decrement: signalSource<{}>(),
        reset: signalSource<{}>(),
      })),
      craftState('counter', ({ increment, decrement }) =>
        state(0, ({ state, set }) => ({
          increment: afterRecomputation(increment, () => set(state() + 1)),
          decrement: afterRecomputation(decrement, () => set(state() - 1)),
          reset: () => 0,
        })),
      ),
      //@ts-expect-error test2 is not defined in the connected store methods, so errorMethodMsg is required
      craftDataPagination(({ reset, counter }) => ({
        inputs: {
          shouldNotBeExposed: counter,
        },
        methods: {
          reset,
          test2: true,
        },
      })),
    );
  });

  it('Typing: should add errorMethodMsg property  with the message You are trying to add methods that are not defined in the connected store..., If the connected methods name does not match', async () => {
    const { craftDataPagination, _DATAPAGINATION_META_STORE_CONTEXT } = craft(
      {
        name: 'dataPagination',
        providedIn: 'root',
      },
      craftInputs({
        shouldNotBeExposed: undefined as number | undefined,
      }),
      craftState('numberList', () =>
        state([1], ({ state, set }) => ({
          addNumber: (numberValue: number) => {
            const stateValue = state();
            set([...stateValue, numberValue]);
          },
          reset: () => {
            set([]);
          },
        })),
      ),
    );

    expectTypeOf<
      (typeof _DATAPAGINATION_META_STORE_CONTEXT)['context']['methods']
    >().branded.toEqualTypeOf<
      {
        [x: `numberList${Capitalize<string>}`]: Function;
        numberListAddNumber: (numberValue: number) => void;
        numberListReset: () => void;
      } & Record<string, Function>
    >();

    expectTypeOf<
      (typeof _DATAPAGINATION_META_STORE_CONTEXT)['context']['props']
    >().branded.toEqualTypeOf<
      {
        numberList: Signal<number[]>;
      } & {}
    >();

    craft(
      {
        name: 'host1',
        providedIn: 'root',
      },
      craftSources(() => ({
        increment: signalSource<{}>(),
        decrement: signalSource<{}>(),
        reset: signalSource<{}>(),
      })),
      craftState('counter', ({ increment, decrement }) =>
        state(0, ({ state, set }) => ({
          increment: afterRecomputation(increment, () => set(state() + 1)),
          decrement: afterRecomputation(decrement, () => set(state() - 1)),
          reset: () => 0,
        })),
      ),
      //@ts-expect-error testNotExist is not defined in the connected store inputs, so errorInputMsg is required
      craftDataPagination(({ reset, counter }) => ({
        inputs: {
          shouldNotBeExposed: counter,
          testNotExist: true,
        },
        methods: {
          reset,
        },
      })),
    );
  });

  it('Compose stores and method bind to the host can be bind with observable sources', async () => {
    const { craftGenericQueryParams } = craft(
      {
        name: 'GenericQueryParams',
        providedIn: 'root',
      },
      craftQueryParams(() => ({
        pagination: queryParam(
          {
            state: {
              page: {
                fallbackValue: 1,
                parse: (value: string) => parseInt(value, 10),
                serialize: (value: unknown) => String(value),
              },
            },
          },
          ({ set }) => ({
            reset: () => set({ page: 1 }),
            goTo: (page: number) => set({ page }),
          }),
        ),
      })),
    );

    const { injectHostCraft } = craft(
      {
        name: 'host',
        providedIn: 'root',
      },
      craftSources(() => ({
        reset: source$<void>(),
        goTo: source$<number>(),
      })),
      craftGenericQueryParams(({ reset, goTo }) => ({
        methods: {
          resetPagination: reset,
          goToPagination: goTo,
        },
      })),
    );

    TestBed.configureTestingModule({ providers: [provideRouter([])] });

    await TestBed.runInInjectionContext(async () => {
      const host = injectHostCraft();
      //@ts-expect-error because resetPagination is connected to a source, it should not be exposed as a method
      expect(host.resetPagination).not.toBeDefined();
      //@ts-expect-error because goToPagination is connected to a source, it should not be exposed as a method
      expect(host.goToPagination).not.toBeDefined();

      host.emitGoTo(5);
      expect(host.pagination()).toEqual({
        page: 5,
      });

      host.emitReset();
      expect(host.pagination()).toEqual({
        page: 1,
      });
    });
  });
});

describe('craft metadata', () => {
  it('should expose the store metadata', async () => {
    TestBed.runInInjectionContext(() => {
      const { _SHARED_META_STORE_CONTEXT, craftShared } = craft(
        {
          name: 'shared',
          providedIn: 'feature',
        },
        craftState('test', () =>
          state(1, ({ state, set }) => ({
            increment: () => set(state() + 1),
          })),
        ),
      );

      expectTypeOf<
        (typeof _SHARED_META_STORE_CONTEXT)['storeConfig']
      >().toEqualTypeOf<{
        providedIn: 'feature';
        name: 'shared';
        implements?: unknown;
      }>();

      expectTypeOf<
        (typeof _SHARED_META_STORE_CONTEXT)['context']['methods']
      >().branded.toEqualTypeOf<
        {
          testIncrement: () => number;
        } & Record<string, Function>
      >();

      expectTypeOf<
        (typeof _SHARED_META_STORE_CONTEXT)['context']['props']
      >().branded.toEqualTypeOf<
        {
          test: Signal<number>;
        } & {}
      >();

      const { _DATA_META_STORE_CONTEXT } = craft(
        {
          name: 'data',
          providedIn: 'root',
        },
        craftShared(),
      );
      expectTypeOf<
        (typeof _DATA_META_STORE_CONTEXT)['context']['_dependencies']['shared']
      >().toEqualTypeOf<typeof _SHARED_META_STORE_CONTEXT>();
    });
  });
});

describe('craft options', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should provide the store in the root injector when providedIn is "root"', async () => {
    await TestBed.runInInjectionContext(async () => {
      const { injectUserCraft } = craft(
        {
          name: 'user',
          providedIn: 'root',
        },
        craftMutations(() => ({
          save: mutation({
            method: (data: { id: number; name: string }) => data,
            loader: async ({ params }) => params,
          }),
        })),
        craftQuery('test', () =>
          query({
            params: () => 5,
            loader: async ({ params: id }) => ({ id, name: 'test' }),
          }),
        ),
        craftQuery('test2', () =>
          query({
            params: () => 3,
            loader: async ({ params: id }) => ({ id, name: 'test2' }),
          }),
        ),
      );
      const userServerState = injectUserCraft();
      // todo fix exposed functions
      await vi.runAllTimersAsync();
      expect(userServerState).toBeDefined();
      expect(userServerState.test.value).toBeDefined();
      expect(userServerState.test.value()).toEqual({
        id: 5,
        name: 'test',
      });
      expect(userServerState.test2.value).toBeDefined();
      expect(userServerState.test2.value()).toEqual({
        id: 3,
        name: 'test2',
      });

      expect(userServerState.mutateSave).toBeDefined();
      userServerState.mutateSave({ id: 3, name: 'test' });
      await vi.runAllTimersAsync();
      expect(userServerState.save.value()).toEqual({
        id: 3,
        name: 'test',
      });
    });
  });

  it('should provide a shared store  by default', async () => {
    await TestBed.runInInjectionContext(async () => {
      const { injectUserCraft, UserCraft } = craft(
        {
          name: 'user',
          providedIn: 'root',
        },
        craftMutations(() => ({
          save: mutation({
            method: (data: { id: number; name: string }) => data,
            loader: async ({ params }) => params,
          }),
        })),
        craftQuery('test', () =>
          query({
            params: () => 5,
            loader: async ({ params: id }) => ({ id, name: 'test' }),
          }),
        ),
        craftQuery('test2', () =>
          query({
            params: () => 3,
            loader: async ({ params: id }) => ({ id, name: 'test2' }),
          }),
        ),
      );
      const userServerState = injectUserCraft();
      const sameUserServerState = inject(UserCraft);
      await vi.runAllTimersAsync();
      expect(userServerState).toBeDefined();
      expect(userServerState.test.value).toBeDefined();
      expect(userServerState.test.value()).toEqual({
        id: 5,
        name: 'test',
      });
      expect(userServerState.test2.value).toBeDefined();
      expect(userServerState.test2.value()).toEqual({
        id: 3,
        name: 'test2',
      });

      expect(userServerState.mutateSave).toBeDefined();
      userServerState.mutateSave({ id: 3, name: 'test' });
      await vi.runAllTimersAsync();
      expect(userServerState.save.value()).toEqual({
        id: 3,
        name: 'test',
      });

      expect(sameUserServerState.test2.value).toBeDefined();
      expect(userServerState.save.value()).toEqual({
        id: 3,
        name: 'test',
      });
    });
  });
});

describe('craft preserve all context', () => {
  it('should preserve the context when using craft', async () => {
    await TestBed.runInInjectionContext(async () => {
      craft(
        {
          name: 'test',
          providedIn: 'root',
        },
        () =>
          ({ context }, injector, storeConfig) => {
            expectTypeOf(storeConfig).toEqualTypeOf<{
              name: 'test';
              providedIn: 'root';
            }>();
            return EmptyContext;
          },
      );
      craft(
        {
          name: 'test',
          providedIn: 'root',
        },
        () =>
          ({ context }, injector, storeConfig) => {
            expectTypeOf(storeConfig).toEqualTypeOf<{
              name: 'test';
              providedIn: 'root';
            }>();
            return EmptyContext;
          },
        () =>
          ({ context }, injector, storeConfig) => {
            expectTypeOf(storeConfig).toEqualTypeOf<{
              name: 'test';
              providedIn: 'root';
            }>();
            return EmptyContext;
          },
      );
      craft(
        {
          name: 'test',
          providedIn: 'root',
        },
        () =>
          ({ context }, injector, storeConfig) => {
            expectTypeOf(storeConfig).toEqualTypeOf<{
              name: 'test';
              providedIn: 'root';
            }>();
            return EmptyContext;
          },
        () =>
          ({ context }, injector, storeConfig) => {
            expectTypeOf(storeConfig).toEqualTypeOf<{
              name: 'test';
              providedIn: 'root';
            }>();
            return EmptyContext;
          },
        () =>
          ({ context }, injector, storeConfig) => {
            expectTypeOf(storeConfig).toEqualTypeOf<{
              name: 'test';
              providedIn: 'root';
            }>();
            return EmptyContext;
          },
      );
      craft(
        {
          name: 'test',
          providedIn: 'root',
        },
        () =>
          ({ context }, injector, storeConfig) => {
            expectTypeOf(storeConfig).toEqualTypeOf<{
              name: 'test';
              providedIn: 'root';
            }>();
            return EmptyContext;
          },
        () =>
          ({ context }, injector, storeConfig) => {
            expectTypeOf(storeConfig).toEqualTypeOf<{
              name: 'test';
              providedIn: 'root';
            }>();
            return EmptyContext;
          },
        () =>
          ({ context }, injector, storeConfig) => {
            expectTypeOf(storeConfig).toEqualTypeOf<{
              name: 'test';
              providedIn: 'root';
            }>();
            return EmptyContext;
          },
        () =>
          ({ context }, injector, storeConfig) => {
            expectTypeOf(storeConfig).toEqualTypeOf<{
              name: 'test';
              providedIn: 'root';
            }>();
            return EmptyContext;
          },
      );
    });
  });

  it('should preserve the context when using craft', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });
    await TestBed.runInInjectionContext(async () => {
      const { _TEST_META_STORE_CONTEXT } = craft(
        {
          name: 'test',
          providedIn: 'root',
        },
        craftQueryParam('activeId', () =>
          queryParam({
            state: {
              active: {
                fallbackValue: undefined,
                parse: (value: string) => (value === 'true') as boolean,
                serialize: (value) => String(value),
              },
            },
          }),
        ),
        () => (contextData, injector, storeConfig) => {
          expectTypeOf(storeConfig).toEqualTypeOf<{
            name: 'test';
            providedIn: 'root';
          }>();
          return EmptyContext;
        },
      );

      expectTypeOf<
        (typeof _TEST_META_STORE_CONTEXT)['storeConfig']
      >().toEqualTypeOf<{
        providedIn: 'root';
        name: 'test';
        implements?: unknown;
      }>();

      expectTypeOf<
        (typeof _TEST_META_STORE_CONTEXT)['context']['props']
      >().branded.toEqualTypeOf<
        {
          activeId: Signal<{
            active: boolean;
          }>;
        } & {
          activeIdActive: Signal<boolean>;
        } & {}
      >();
    });
  });

  it('should preserve the context "cloudProxy" when using craft', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });
    await TestBed.runInInjectionContext(async () => {
      const { craftShared } = craft(
        {
          name: 'shared',
          providedIn: 'feature',
        },
        () => () => {
          return partialContext({
            _cloudProxy: {
              testPassingSharedValue: signal('share'),
            },
          }) as PartialContext<{
            _cloudProxy: {
              testPassingSharedValue: Signal<string>;
            };
          }>;
        },
      );
      const { _TEST_META_STORE_CONTEXT } = craft(
        {
          name: 'test',
          providedIn: 'root',
        },
        (outOfInjectionContextCloudProxy) =>
          ({ context }, injector, storeConfig, cloudProxy) => {
            expectTypeOf(cloudProxy).toEqualTypeOf<{}>();
            return partialContext({
              _cloudProxy: {
                testPassingValue: signal('test'),
              },
            }) as PartialContext<{
              _cloudProxy: {
                testPassingValue: Signal<string>;
              };
            }>;
          },
        (outOfInjectionContextCloudProxy) => {
          expectTypeOf(outOfInjectionContextCloudProxy).toEqualTypeOf<{
            testPassingValue: Signal<string>;
          }>();
          return (contextData, injector, storeConfig, cloudProxy) => {
            expectTypeOf(cloudProxy).toEqualTypeOf<{
              testPassingValue: Signal<string>;
            }>();
            return partialContext({});
          };
        },
        craftShared(),
      );
      expectTypeOf<
        Omit<(typeof _TEST_META_STORE_CONTEXT)['context'], '_dependencies'>
      >().toEqualTypeOf<{
        _inputs: ExcludeCommonKeys<{}, {}>;
        _error: {};
        methods: Record<string, Function> &
          ExcludeCommonKeys<Record<string, Function>, {}>;
        props: {};
        _queryParams: {};
        _sources: {};
        _injections: {};
        _AsyncProcess: {};
        _mutation: {};
        _query: {};
        _cloudProxy: {
          testPassingValue: Signal<string>;
        } & {
          testPassingSharedValue: Signal<string>;
        };
      }>();
    });
  });

  it('should preserve the context when used with `craftX`', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });
    await TestBed.runInInjectionContext(async () => {
      const { craftMySharedFeature, _MYSHAREDFEATURE_META_STORE_CONTEXT } =
        craft(
          {
            name: 'mySharedFeature',
            providedIn: 'feature',
          },
          craftQueryParam('pagination', () =>
            queryParam({
              state: {
                page: {
                  fallbackValue: 1,
                  parse: (value: string) => parseInt(value, 10),
                  serialize: (value: unknown) => String(value),
                },
                pageSize: {
                  fallbackValue: 10,
                  parse: (value: string) => parseInt(value, 10),
                  serialize: (value: unknown) => String(value),
                },
              },
            }),
          ),
        );
      expectTypeOf<
        (typeof _MYSHAREDFEATURE_META_STORE_CONTEXT)['storeConfig']
      >().toEqualTypeOf<{
        providedIn: 'feature';
        name: 'mySharedFeature';
        implements?: unknown;
      }>();
      const { _TEST_META_STORE_CONTEXT } = craft(
        {
          name: 'test',
          providedIn: 'root',
        },
        craftMySharedFeature(),
        (_cloudProxy) =>
          ({ context }, injector, storeConfig, _cloudProxy) => {
            expectTypeOf(storeConfig).toEqualTypeOf<{
              name: 'test';
              providedIn: 'root';
            }>();
            return {} as EmptyContext;
          },
      );
      type t = Pick<
        (typeof _TEST_META_STORE_CONTEXT)['context'],
        '_dependencies'
      >;
      expectTypeOf<
        (typeof _TEST_META_STORE_CONTEXT)['storeConfig']
      >().toEqualTypeOf<{
        providedIn: 'root';
        name: 'test';
        implements?: unknown;
      }>();
      expectTypeOf<
        (typeof _TEST_META_STORE_CONTEXT)['context']['_dependencies']['mySharedFeature']['storeConfig']
      >().toEqualTypeOf<{
        providedIn: 'feature';
        name: 'mySharedFeature';
        implements?: unknown;
      }>();
    });
  });
});

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), ms);
  });
}

craft(
  {
    name: 'MyAwesomeStore',
    providedIn: 'root',
  },
  craftSources(() => ({
    reset: signalSource<{}>(),
  })),
  craftState('counter', ({ reset }) =>
    state(0, ({ state, set }) => ({
      increment: () => set(state() + 1),
      decrement: () => set(state() - 1),
      _reset: afterRecomputation(reset, () => set(0)),
    })),
  ),
  craftState('search', ({ reset }) =>
    state('', ({ state, set }) => ({
      setSearch: (value: string) => value,
      _reset: afterRecomputation(reset, () => set('')),
    })),
  ),
);

describe('craft should accept contract/implementation', () => {
  type UserImplementation = {
    user: Signal<{
      id: number;
      name: string;
    }>;
    userSetName: (name: string) => {
      name: string;
      id: number;
    };
  };
  it('should accept contract/implementation', async () => {
    const { injectContractImplementationStoreCraft } = craft(
      {
        name: 'contractImplementationStore',
        providedIn: 'root',
        implements: contract<UserImplementation>(),
      },
      craftState('user', () =>
        state({ id: 1, name: 'test' }, ({ state }) => ({
          setName: (name: string) => ({ ...state(), name }),
        })),
      ),
    );
  });
  it('should accept no contract/implementation', async () => {
    const { injectContractImplementationStoreCraft } = craft(
      {
        name: 'contractImplementationStore',
        providedIn: 'root',
      },
      craftState('user', () =>
        state({ id: 1, name: 'test' }, ({ state }) => ({
          setName: (name: string) => ({ ...state(), name }),
        })),
      ),
    );
  });
  it('should return an error if contract/implementation is not satisfies', async () => {
    const { error } = craft(
      {
        name: 'contractImplementationStore',
        providedIn: 'root',
        implements: contract<UserImplementation>(),
      },
      craftState('other', () => state({ id: 1, name: 'test' })),
    );

    type _ = Expect<
      Equal<
        typeof error,
        'Contract Implementation Error: The current contract is not respected.'
      >
    >;
  });

  it('should return an error if "contract" is not called: contract<...> instead of  contract<...>()', async () => {
    const { error } = craft(
      {
        name: 'contractImplementationStore',
        providedIn: 'root',
        implements: contract<UserImplementation>,
      },
      craftState('other', () => state({ id: 1, name: 'test' })),
    );

    type _ = Expect<
      Equal<
        typeof error,
        'Contract Implementation Error: The current contract is not called properly. Did you forget to call it as a function? i.e., contract<...>()'
      >
    >;
  });
});

describe('scoped craft', () => {
  it('should expose a provide function that can be use in providers array', async () => {
    const { injectScopedStoreCraft, provideScopedStoreCraft } = craft(
      {
        name: 'scopedStore',
        providedIn: 'scoped',
      },
      craftState('counter', () =>
        state(0, ({ state, set }) => ({
          increment: () => set(state() + 1),
          decrement: () => set(state() - 1),
        })),
      ),
    );

    TestBed.configureTestingModule({
      providers: [provideScopedStoreCraft()],
    });

    TestBed.runInInjectionContext(() => {
      const scopedStore = injectScopedStoreCraft();
      expect(scopedStore.counter()).toBe(0);
      scopedStore.counterIncrement();
      expect(scopedStore.counter()).toBe(1);
    });
  });
});

describe('craft signatures', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should work with 1 factory', async () => {
    const { injectTestCraft } = craft(
      {
        name: 'test',
        providedIn: 'root',
      },
      craftState('counter1', () =>
        state(1, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
    );

    await TestBed.runInInjectionContext(async () => {
      const store = injectTestCraft();
      expect(store.counter1()).toBe(1);
      store.counter1Increment();
      expect(store.counter1()).toBe(2);
    });
  });

  it('should work with 2 factories', async () => {
    const { injectTestCraft } = craft(
      {
        name: 'test',
        providedIn: 'root',
      },
      craftState('counter1', () =>
        state(1, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter2', () =>
        state(2, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
    );

    await TestBed.runInInjectionContext(async () => {
      const store = injectTestCraft();
      expect(store.counter1()).toBe(1);
      expect(store.counter2()).toBe(2);
      store.counter1Increment();
      store.counter2Increment();
      expect(store.counter1()).toBe(2);
      expect(store.counter2()).toBe(3);
    });
  });

  it('should work with 3 factories', async () => {
    const { injectTestCraft } = craft(
      {
        name: 'test',
        providedIn: 'root',
      },
      craftState('counter1', () =>
        state(1, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter2', () =>
        state(2, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter3', () =>
        state(3, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
    );

    await TestBed.runInInjectionContext(async () => {
      const store = injectTestCraft();
      expect(store.counter1()).toBe(1);
      expect(store.counter2()).toBe(2);
      expect(store.counter3()).toBe(3);
      store.counter1Increment();
      store.counter2Increment();
      store.counter3Increment();
      expect(store.counter1()).toBe(2);
      expect(store.counter2()).toBe(3);
      expect(store.counter3()).toBe(4);
    });
  });

  it('should work with 4 factories', async () => {
    const { injectTestCraft } = craft(
      {
        name: 'test',
        providedIn: 'root',
      },
      craftState('counter1', () =>
        state(1, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter2', () =>
        state(2, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter3', () =>
        state(3, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter4', () =>
        state(4, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
    );

    await TestBed.runInInjectionContext(async () => {
      const store = injectTestCraft();
      expect(store.counter1()).toBe(1);
      expect(store.counter2()).toBe(2);
      expect(store.counter3()).toBe(3);
      expect(store.counter4()).toBe(4);
      store.counter1Increment();
      store.counter2Increment();
      store.counter3Increment();
      store.counter4Increment();
      expect(store.counter1()).toBe(2);
      expect(store.counter2()).toBe(3);
      expect(store.counter3()).toBe(4);
      expect(store.counter4()).toBe(5);
    });
  });

  it('should work with 5 factories', async () => {
    const { injectTestCraft } = craft(
      {
        name: 'test',
        providedIn: 'root',
      },
      craftState('counter1', () =>
        state(1, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter2', () =>
        state(2, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter3', () =>
        state(3, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter4', () =>
        state(4, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter5', () =>
        state(5, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
    );

    await TestBed.runInInjectionContext(async () => {
      const store = injectTestCraft();
      expect(store.counter1()).toBe(1);
      expect(store.counter2()).toBe(2);
      expect(store.counter3()).toBe(3);
      expect(store.counter4()).toBe(4);
      expect(store.counter5()).toBe(5);
      store.counter1Increment();
      store.counter2Increment();
      store.counter3Increment();
      store.counter4Increment();
      store.counter5Increment();
      expect(store.counter1()).toBe(2);
      expect(store.counter2()).toBe(3);
      expect(store.counter3()).toBe(4);
      expect(store.counter4()).toBe(5);
      expect(store.counter5()).toBe(6);
    });
  });

  it('should work with 6 factories', async () => {
    const { injectTestCraft } = craft(
      {
        name: 'test',
        providedIn: 'root',
      },
      craftState('counter1', () =>
        state(1, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter2', () =>
        state(2, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter3', () =>
        state(3, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter4', () =>
        state(4, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter5', () =>
        state(5, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter6', () =>
        state(6, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
    );

    await TestBed.runInInjectionContext(async () => {
      const store = injectTestCraft();
      expect(store.counter1()).toBe(1);
      expect(store.counter2()).toBe(2);
      expect(store.counter3()).toBe(3);
      expect(store.counter4()).toBe(4);
      expect(store.counter5()).toBe(5);
      expect(store.counter6()).toBe(6);
      store.counter1Increment();
      store.counter2Increment();
      store.counter3Increment();
      store.counter4Increment();
      store.counter5Increment();
      store.counter6Increment();
      expect(store.counter1()).toBe(2);
      expect(store.counter2()).toBe(3);
      expect(store.counter3()).toBe(4);
      expect(store.counter4()).toBe(5);
      expect(store.counter5()).toBe(6);
      expect(store.counter6()).toBe(7);
    });
  });

  it('should work with 7 factories', async () => {
    const { injectTestCraft } = craft(
      {
        name: 'test',
        providedIn: 'root',
      },
      craftState('counter1', () =>
        state(1, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter2', () =>
        state(2, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter3', () =>
        state(3, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter4', () =>
        state(4, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter5', () =>
        state(5, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter6', () =>
        state(6, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter7', () =>
        state(7, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
    );

    await TestBed.runInInjectionContext(async () => {
      const store = injectTestCraft();
      expect(store.counter1()).toBe(1);
      expect(store.counter2()).toBe(2);
      expect(store.counter3()).toBe(3);
      expect(store.counter4()).toBe(4);
      expect(store.counter5()).toBe(5);
      expect(store.counter6()).toBe(6);
      expect(store.counter7()).toBe(7);
      store.counter1Increment();
      store.counter2Increment();
      store.counter3Increment();
      store.counter4Increment();
      store.counter5Increment();
      store.counter6Increment();
      store.counter7Increment();
      expect(store.counter1()).toBe(2);
      expect(store.counter2()).toBe(3);
      expect(store.counter3()).toBe(4);
      expect(store.counter4()).toBe(5);
      expect(store.counter5()).toBe(6);
      expect(store.counter6()).toBe(7);
      expect(store.counter7()).toBe(8);
    });
  });

  it('should work with 8 factories', async () => {
    const { injectTestCraft } = craft(
      {
        name: 'test',
        providedIn: 'root',
      },
      craftState('counter1', () =>
        state(1, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter2', () =>
        state(2, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter3', () =>
        state(3, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter4', () =>
        state(4, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter5', () =>
        state(5, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter6', () =>
        state(6, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter7', () =>
        state(7, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter8', () =>
        state(8, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
    );

    await TestBed.runInInjectionContext(async () => {
      const store = injectTestCraft();
      expect(store.counter1()).toBe(1);
      expect(store.counter2()).toBe(2);
      expect(store.counter3()).toBe(3);
      expect(store.counter4()).toBe(4);
      expect(store.counter5()).toBe(5);
      expect(store.counter6()).toBe(6);
      expect(store.counter7()).toBe(7);
      expect(store.counter8()).toBe(8);
      store.counter1Increment();
      store.counter2Increment();
      store.counter3Increment();
      store.counter4Increment();
      store.counter5Increment();
      store.counter6Increment();
      store.counter7Increment();
      store.counter8Increment();
      expect(store.counter1()).toBe(2);
      expect(store.counter2()).toBe(3);
      expect(store.counter3()).toBe(4);
      expect(store.counter4()).toBe(5);
      expect(store.counter5()).toBe(6);
      expect(store.counter6()).toBe(7);
      expect(store.counter7()).toBe(8);
      expect(store.counter8()).toBe(9);
    });
  });

  it('should work with 9 factories', async () => {
    const { injectTestCraft } = craft(
      {
        name: 'test',
        providedIn: 'root',
      },
      craftState('counter1', () =>
        state(1, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter2', () =>
        state(2, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter3', () =>
        state(3, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter4', () =>
        state(4, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter5', () =>
        state(5, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter6', () =>
        state(6, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter7', () =>
        state(7, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter8', () =>
        state(8, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter9', () =>
        state(9, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
    );

    await TestBed.runInInjectionContext(async () => {
      const store = injectTestCraft();
      expect(store.counter1()).toBe(1);
      expect(store.counter2()).toBe(2);
      expect(store.counter3()).toBe(3);
      expect(store.counter4()).toBe(4);
      expect(store.counter5()).toBe(5);
      expect(store.counter6()).toBe(6);
      expect(store.counter7()).toBe(7);
      expect(store.counter8()).toBe(8);
      expect(store.counter9()).toBe(9);
      store.counter1Increment();
      store.counter2Increment();
      store.counter3Increment();
      store.counter4Increment();
      store.counter5Increment();
      store.counter6Increment();
      store.counter7Increment();
      store.counter8Increment();
      store.counter9Increment();
      expect(store.counter1()).toBe(2);
      expect(store.counter2()).toBe(3);
      expect(store.counter3()).toBe(4);
      expect(store.counter4()).toBe(5);
      expect(store.counter5()).toBe(6);
      expect(store.counter6()).toBe(7);
      expect(store.counter7()).toBe(8);
      expect(store.counter8()).toBe(9);
      expect(store.counter9()).toBe(10);
    });
  });

  it('should work with 10 factories', async () => {
    const { injectTestCraft } = craft(
      {
        name: 'test',
        providedIn: 'root',
      },
      craftState('counter1', () =>
        state(1, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter2', () =>
        state(2, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter3', () =>
        state(3, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter4', () =>
        state(4, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter5', () =>
        state(5, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter6', () =>
        state(6, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter7', () =>
        state(7, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter8', () =>
        state(8, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter9', () =>
        state(9, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
      craftState('counter10', () =>
        state(10, ({ state, set }) => ({
          increment: () => set(state() + 1),
        })),
      ),
    );

    await TestBed.runInInjectionContext(async () => {
      const store = injectTestCraft();
      expect(store.counter1()).toBe(1);
      expect(store.counter2()).toBe(2);
      expect(store.counter3()).toBe(3);
      expect(store.counter4()).toBe(4);
      expect(store.counter5()).toBe(5);
      expect(store.counter6()).toBe(6);
      expect(store.counter7()).toBe(7);
      expect(store.counter8()).toBe(8);
      expect(store.counter9()).toBe(9);
      expect(store.counter10()).toBe(10);
      store.counter1Increment();
      store.counter2Increment();
      store.counter3Increment();
      store.counter4Increment();
      store.counter5Increment();
      store.counter6Increment();
      store.counter7Increment();
      store.counter8Increment();
      store.counter9Increment();
      store.counter10Increment();
      expect(store.counter1()).toBe(2);
      expect(store.counter2()).toBe(3);
      expect(store.counter3()).toBe(4);
      expect(store.counter4()).toBe(5);
      expect(store.counter5()).toBe(6);
      expect(store.counter6()).toBe(7);
      expect(store.counter7()).toBe(8);
      expect(store.counter8()).toBe(9);
      expect(store.counter9()).toBe(10);
      expect(store.counter10()).toBe(11);
    });
  });
});

import { computed, linkedSignal, Signal, signal } from '@angular/core';
import { state, StateOutput } from './state';
import { signalSource } from './signal-source';
import { afterRecomputation } from './after-recomputation';
import { TestBed } from '@angular/core/testing';
import { source$ } from './source$';
import { on$ } from './on$';
import { InsertionsStateFactory } from './query.core';

const runInInjectionContext = <T>(fn: () => T): T =>
  TestBed.runInInjectionContext(fn);

describe('state', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('should create a simple state', () => {
    runInInjectionContext(() => {
      const myState = state(0);

      expect(myState).toBeDefined();
      expectTypeOf(myState).toEqualTypeOf<Signal<number>>();
      expect(myState()).toBe(0);
    });
  });
  it('should create a signal state', () => {
    runInInjectionContext(() => {
      const origin = signal(5);
      const myState = state(linkedSignal(() => origin() * 2));

      expect(myState).toBeDefined();
      expectTypeOf(myState).toEqualTypeOf<Signal<number>>();
      expect(myState()).toBe(10);
    });
  });

  it('should accept insertion, use to add methods and properties', () => {
    runInInjectionContext(() => {
      const origin = signal(5);
      const myState = state(
        linkedSignal(() => origin() * 2),
        ({ update, set }) => ({
          increment: () => update((current) => current + 1),
          reset: () => set(0),
        }),
        ({ state }) => ({
          isOdd: computed(() => state() % 2 === 1),
        }),
      );

      expect(myState).toBeDefined();
      expectTypeOf(myState).toEqualTypeOf<
        StateOutput<
          number,
          {
            increment: () => number;
            reset: () => number;
          } & {
            isOdd: Signal<boolean>;
          }
        >
      >();
      expect(myState()).toBe(10);
      expect(myState.isOdd()).toBe(false);
      myState.increment();
      expect(myState()).toBe(11);
      expect(myState.isOdd()).toBe(true);
      myState.reset();
      expect(myState()).toBe(0);
      expect(myState.isOdd()).toBe(false);
    });
  });

  it('methods can be bind to a source, but not exposed', async () => {
    await runInInjectionContext(async () => {
      const sourceSignal = signalSource<number>();
      const myState = state(0, ({ set }) => ({
        setValue: afterRecomputation(sourceSignal, (value) => {
          set(value);
        }),
        reset: () => set(0),
      }));

      expect(myState).toBeDefined();
      expectTypeOf(myState()).toEqualTypeOf<number>();
      expect(myState()).toBe(0);

      //@ts-expect-error setValue should not be exposed
      type _ShouldNotBeExposed = (typeof myState)['setValue'];
      await vi.runAllTimersAsync();

      sourceSignal.set(34);
      await vi.runAllTimersAsync();
      console.log('post myState()', myState());
      expect(myState()).toBe(34);

      myState.reset();
      await vi.runAllTimersAsync();
      expect(myState()).toBe(0);
    });
  });

  it('methods can be bind to a source$, but not exposed', async () => {
    await runInInjectionContext(async () => {
      const sourceSignal = source$<number>();
      const myState = state(0, ({ set }) => ({
        setValue: on$(sourceSignal, (value) => {
          set(value);
        }),
        reset: () => set(0),
      }));

      expect(myState).toBeDefined();
      expectTypeOf(myState()).toEqualTypeOf<number>();
      expect(myState()).toBe(0);

      //@ts-expect-error setValue should not be exposed
      type _ShouldNotBeExposed = (typeof myState)['setValue'];
      await vi.runAllTimersAsync();

      sourceSignal.emit(34);
      console.log('post myState()', myState());
      expect(myState()).toBe(34);

      myState.reset();
      expect(myState()).toBe(0);
    });
  });

  it('it should work with a linked signal as readonly', async () => {
    await runInInjectionContext(async () => {
      const myRefSigal = signal([0]);
      const insertion: InsertionsStateFactory<
        number[],
        {
          addNumber: (numberValue: number) => number[];
          filterNumber: (filterValue: number) => number[];
        }
      > = ({ set, state }) => ({
        addNumber: (numberValue: number) => {
          const stateValue = state();
          return set([...stateValue, numberValue]);
        },
        filterNumber: (filterValue: number) => {
          const stateValue = state();
          return set(stateValue.filter((num) => num !== filterValue));
        },
      });

      const s = state(linkedSignal(() => myRefSigal()).asReadonly(), insertion);
      expect(s()).toEqual([0]);
    });
  });
});

// todo implements the signature for parallel state
describe('should allow to create multiple states in parallel with shared sources and methods', () => {
  it('expose a create method to generate parallel state', () => {
    runInInjectionContext(() => {
      const myState = state(
        {
          method: (index: number) => index,
          state: ({ params: index }) => ({
            color: 'white',
            index,
          }),
        },
        ({ stateById }) => ({
          changeColor: (id: number) =>
            stateById.select(id)?.update((v) => ({ ...v, color: 'black' })),
        }),
      );

      myState.create(0);
      myState.create(1);
      myState.create(2);

      expect(myState.select(0)).toEqual({ color: 'white', index: 0 });
      expect(myState.select(1)).toEqual({ color: 'white', index: 1 });
      expect(myState.select(2)).toEqual({ color: 'white', index: 2 });

      myState.changeColor(1);

      expect(myState.select(0)).toEqual({ color: 'white', index: 0 });
      expect(myState.select(1)).toEqual({ color: 'black', index: 1 });
      expect(myState.select(2)).toEqual({ color: 'white', index: 2 });
    });
  });

  it('should create a parallel state from a params', () => {
    runInInjectionContext(() => {
      const signalCurrentIndex = signal(0);
      const myState = state(
        {
          params: signalCurrentIndex,
          identifier: (index) => index,
          state: ({ params: index }) => ({
            color: 'white',
            index,
          }),
        },
        ({ stateById }) => ({
          changeColor: (id: number) =>
            stateById.select(id)?.update((v) => ({ ...v, color: 'black' })),
        }),
      );

      TestBed.tick();
      expect(myState(0)).toEqual({ color: 'white', index: 0 });

      signalCurrentIndex.set(1);
      TestBed.tick();
      expect(myState(1)).toEqual({ color: 'white', index: 1 });

      myState.changeColor(1);
      expect(myState(0)).toEqual({ color: 'white', index: 0 });
      expect(myState(1)).toEqual({ color: 'black', index: 1 });
    });
  });

  it('should create a parallel state from a readonly params signal', () => {
    runInInjectionContext(() => {
      const currentIdSource = signal(0);
      const currentId = currentIdSource.asReadonly();
      const itemById = state({
        params: currentId,
        identifier: (id: number) => id,
        state: ({ params: id }: { params: number }) => ({
          id,
          selected: false,
        }),
      });

      TestBed.tick();
      expect(itemById(0)).toEqual({ id: 0, selected: false });

      currentIdSource.set(1);
      TestBed.tick();
      expect(itemById(1)).toEqual({ id: 1, selected: false });
    });
  });

  it('should generate parallel state from a signal list', () => {
    runInInjectionContext(() => {
      const indexList = signal([0, 1, 2]);
      const myState3 = state(
        {
          from: indexList,
          identifier: ({ item: _item, index }) => index,
          state: ({ params: { index } }) => ({
            color: 'white',
            index,
          }),
        },
        ({ stateById }) => ({
          changeColor: (id: number) =>
            stateById.select(id)?.update((v) => ({ ...v, color: 'black' })),
        }),
      );

      TestBed.tick();
      expect(myState3(0)).toEqual({ color: 'white', index: 0 });
      expect(myState3(1)).toEqual({ color: 'white', index: 1 });
      expect(myState3(2)).toEqual({ color: 'white', index: 2 });

      indexList.set([0, 1, 2, 3]);
      TestBed.tick();
      expect(myState3(3)).toEqual({ color: 'white', index: 3 });

      myState3.changeColor(1);
      expect(myState3(0)).toEqual({ color: 'white', index: 0 });
      expect(myState3(1)).toEqual({ color: 'black', index: 1 });
      expect(myState3(2)).toEqual({ color: 'white', index: 2 });
      expect(myState3(3)).toEqual({ color: 'white', index: 3 });
    });
  });

  it('should generate parallel state from a signal list', () => {
    runInInjectionContext(() => {
      const indexMap = signal({
        0: 0,
        1: 1,
        2: 2,
      } as Record<number, number>);
      const myState3 = state(
        {
          from: indexMap, // from only works with signal of list or object
          identifier: ({ key, value: _value }) => key,
          state: ({ params: { key: index } }) => ({
            color: 'white',
            index: Number(index),
          }),
        },
        ({ stateById }) => ({
          changeColor: (id: number) =>
            stateById.select(id)?.update((v) => ({ ...v, color: 'black' })),
        }),
      );

      TestBed.tick();
      expect(myState3(0)).toEqual({ color: 'white', index: 0 });
      expect(myState3(1)).toEqual({ color: 'white', index: 1 });
      expect(myState3(2)).toEqual({ color: 'white', index: 2 });

      indexMap.set({
        0: 0,
        1: 1,
        2: 2,
        3: 3,
      });
      TestBed.tick();
      expect(myState3(3)).toEqual({ color: 'white', index: 3 });

      myState3.changeColor(1);
      expect(myState3(0)).toEqual({ color: 'white', index: 0 });
      expect(myState3(1)).toEqual({ color: 'black', index: 1 });
      expect(myState3(2)).toEqual({ color: 'white', index: 2 });
      expect(myState3(3)).toEqual({ color: 'white', index: 3 });
    });
  });

  // it('use a methodById that helps creating method on a state', () => {
  //   const myState = state(
  //     {
  //       method: (index: number) => index,
  //       state: ({ params: index }) => ({
  //         color: 'white',
  //         index,
  //       }),
  //     },
  //     ({ stateById }) =>
  //       methodById({
  //         changeColor: (id: number) =>
  //           stateById.select(id)?.update((v) => ({ ...v, color: 'black' })),
  //       }),
  //   );

  //   myState.create(0);
  //   myState.create(1);
  //   myState.create(2);

  //   expect(myState.select(0)).toEqual({ color: 'white', index: 0 });
  //   expect(myState.select(1)).toEqual({ color: 'white', index: 1 });
  //   expect(myState.select(2)).toEqual({ color: 'white', index: 2 });

  //   myState.select(1).changeColor();

  //   expect(myState.select(0)).toEqual({ color: 'white', index: 0 });
  //   expect(myState.select(1)).toEqual({ color: 'black', index: 1 });
  //   expect(myState.select(2)).toEqual({ color: 'white', index: 2 });
  // });
});

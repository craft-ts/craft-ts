import { computed, linkedSignal, Signal, signal } from '@angular/core';
import { state, StateOutput } from './state';
import { signalSource } from './signal-source';
import { afterRecomputation } from './after-recomputation';
import { TestBed } from '@angular/core/testing';
import { source$ } from './source$';
import { on$ } from './on$';
import { InsertionsStateFactory } from './query.core';
import {
  methodException,
  withStateExceptions,
} from './business-exception';

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

  it('should expose state exceptions declared via withStateExceptions', () => {
    runInInjectionContext(() => {
      const myState = state(
        withStateExceptions(
          {
            counter: 0,
          },
          {
            counterMustBePositive: {
              min: 0,
            },
          },
        ),
      );

      expect(myState.exceptions?.().state).toEqual({
        counterMustBePositive: {
          min: 0,
        },
      });
    });
  });

  it('should capture business exceptions returned by state insertion methods', () => {
    runInInjectionContext(() => {
      const myState = state(0, () => ({
        fail: () =>
          methodException('COUNTER_LOCKED', {
            current: 0,
          }),
      }));

      myState.fail();

      expect(myState.exceptions?.().method).toEqual({
        COUNTER_LOCKED: {
          current: 0,
        },
      });
    });
  });
});

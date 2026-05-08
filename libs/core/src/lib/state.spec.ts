import { computed, linkedSignal, Signal, signal } from '@angular/core';
import { state, StateOutput } from './state';
import { signalSource } from './signal-source';
import { afterRecomputation } from './after-recomputation';
import { TestBed } from '@angular/core/testing';
import { Source$, source$ } from './source$';
import { on$ } from './on$';
import { InsertionsStateFactory } from './query.core';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { craftService } from './craft-service';
import type { ExtractDeps } from './branded-component/branded-component';

const runInInjectionContext = <T>(fn: () => T): T =>
  TestBed.runInInjectionContext(fn);

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
      expectTypeOf(myState).toEqualTypeOf<StateOutput<number, {}>>();
      expect(myState()).toBe(0);
    });
  });
  it('should create a signal state', () => {
    runInInjectionContext(() => {
      const origin = signal(5);
      const myState = state(linkedSignal(() => origin() * 2));

      expect(myState).toBeDefined();
      expectTypeOf(myState).toEqualTypeOf<StateOutput<number, {}>>();
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

  it('typing: tracks generator dependencies from state config and insertions', () => {
    const { CounterReaderToYield } = craftService(
      { name: 'CounterReader', scope: 'global' },
      () => ({
        read: (): number => 2,
      }),
    );
    const { CounterStepToYield } = craftService(
      { name: 'CounterStep', scope: 'global' },
      () => ({
        step: (): number => 3,
      }),
    );

    runInInjectionContext(() => {
      const myState = state(
        function* () {
          const counter = yield* CounterReaderToYield(
            undefined,
            ({ read }) => ({
              read,
            }),
          );

          return counter.read();
        },
        function* ({ update }) {
          const counterStep = yield* CounterStepToYield();

          return {
            increment: () => update((current) => current + counterStep.step()),
          };
        },
      );

      expectTypeOf(myState()).toEqualTypeOf<number>();
      expectTypeOf<ExtractDeps<typeof myState>>().toEqualTypeOf<{
        CounterReader: {
          scope: 'global';
          dependencies: {};
          browserBoundary: false;
          derivedPropertiesUsed: {
            read: () => number;
          };
          derivedPropertiesExposed: {
            read: () => number;
          };
        };
        CounterStep: {
          scope: 'global';
          dependencies: {};
          browserBoundary: false;
        };
      }>();
    });
  });

  it('should resolve generator state config and generator insertions', () => {
    const { CounterReaderRuntimeToYield } = craftService(
      { name: 'CounterReaderRuntime', scope: 'global' },
      () => ({
        read: (): number => 2,
      }),
    );
    const { CounterStepRuntimeToYield } = craftService(
      { name: 'CounterStepRuntime', scope: 'global' },
      () => ({
        step: (): number => 3,
      }),
    );

    runInInjectionContext(() => {
      const myState = state(
        function* () {
          const counter = yield* CounterReaderRuntimeToYield(
            undefined,
            ({ read }) => ({
              read,
            }),
          );

          return counter.read();
        },
        function* ({ update }) {
          const counterStep = yield* CounterStepRuntimeToYield();

          return {
            increment: () => update((current) => current + counterStep.step()),
          };
        },
      );

      expect(myState()).toBe(2);
      myState.increment();
      expect(myState()).toBe(5);
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

  it('should expose root source$ insertions as callable methods', async () => {
    await runInInjectionContext(async () => {
      const myState = state(
        0,
        ({ set }) => ({
          resetAll$: source$<void>(),
          increment: () => set(1),
        }),
        ({ insertions: { resetAll$ }, set }) => ({
          syncReset: on$(resetAll$, () => set(0)),
        }),
      );

      expectTypeOf(myState.resetAll$).toEqualTypeOf<
        Source$<void> & (() => void)
      >();

      myState.increment();
      expect(myState()).toBe(1);

      myState.resetAll$();
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

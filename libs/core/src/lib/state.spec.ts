import { computed, linkedSignal, Signal, signal } from '@angular/core';
import { state, StateOutput } from './state';
import { signalSource } from './signal-source';
import { afterRecomputation } from './after-recomputation';
import { TestBed } from '@angular/core/testing';
import { Source$, source$ } from './source$';
import { on$ } from './on$';
import { InsertionsStateFactory } from './query.core';
import { craftPipe } from './craft-pipe';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { craftService } from './craft-service';
import type { ExtractDeps } from './branded-component/branded-component';
import {
  provideFnWrapObserver,
  provideFnWrapper,
  type FnWrapper,
} from './fn-wrapper';
import {
  injectStateMethodRuntimeContext,
  type StateMethodRuntimeContext,
} from './state-method-runtime-context';
import { craftUse } from './craft-use';
import type { YieldableInvocation } from './yieldable';
import { craftSignal } from './host/craft-signal';

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
  it('should expose the root state mutation context to method wrappers', () => {
    let runtimeContext: StateMethodRuntimeContext | undefined;
    TestBed.configureTestingModule({
      providers: [
        provideFnWrapper(
          'Warning: dependency injection here is not type-safe and may fail at runtime',
          function* (factory, thisArg, args) {
            runtimeContext = injectStateMethodRuntimeContext();
            return yield* factory.apply(thisArg, args);
          },
        ),
      ],
    });

    runInInjectionContext(() => {
      const counter = craftUse(
        state('counter', 0, ({ update }) => ({
          increment: () => update((current) => current + 1),
        })),
      );

      counter.increment();

      expect(runtimeContext?.kind).toBe('state');
      expect(runtimeContext?.get()).toBe(1);
      expect(runtimeContext?.originalSource).toContain('current + 1');
      runtimeContext?.update((current) => Number(current) + 9);
      expect(craftUse(counter())).toBe(10);
    });
  });
  it('makes direct callbacks returning set yieldable', () => {
    runInInjectionContext(() => {
      const dialog = craftUse(
        state('dialogOpen', false, ({ set }) => ({
          open: () => set(true),
          close: () => set(false),
        })),
      );

      const openInvocation = dialog.open();
      expect(craftUse(dialog())).toBe(true);
      expect(craftUse(openInvocation)).toBe(true);

      craftUse(dialog.close());
      expect(craftUse(dialog())).toBe(false);
    });
  });
  it('should expose insertion methods to wrap observers before invocation', () => {
    const observedSources: string[] = [];
    const observer = provideFnWrapObserver((factory) => {
      const context = injectStateMethodRuntimeContext();
      if (context !== undefined) {
        observedSources.push(factory.toString());
      }
    });

    runInInjectionContext(() => {
      craftUse(
        state('counter', { $self: 0, providers: [observer] }, ({ update }) => ({
          increment: () => update((current) => current + 1),
        })),
      );
    });

    expect(observedSources).toHaveLength(1);
    expect(observedSources[0]).toContain('current + 1');
  });
  it('should create a simple state', () => {
    runInInjectionContext(() => {
      const myState = craftUse(state('myState', 0));

      expect(myState).toBeDefined();
      expectTypeOf(myState).toMatchTypeOf<StateOutput<number, {}>>();
      expect(craftUse(myState())).toBe(0);

      // @ts-expect-error State mutations must be explicitly exposed through an insertion.
      type _ImplicitSet = (typeof myState)['set'];
      expect(Reflect.get(myState, 'set')).toBeUndefined();
    });
  });
  it('should create a signal state', () => {
    runInInjectionContext(() => {
      const origin = signal(5);
      const myState = craftUse(
        state(
          'myState',
          linkedSignal(() => origin() * 2),
        ),
      );

      expect(myState).toBeDefined();
      expectTypeOf(myState).toMatchTypeOf<StateOutput<number, {}>>();
      expect(craftUse(myState())).toBe(10);
    });
  });

  it('writes through when initialized from a Craft writable signal', () => {
    runInInjectionContext(() => {
      const origin = craftSignal(5);
      const myState = craftUse(
        state('myState', origin, ({ set }) => ({
          replace: (value: number) => set(value),
        })),
      );

      myState.replace(9);

      expect(origin()).toBe(9);
      expect(craftUse(myState())).toBe(9);
    });
  });

  it('should accept insertion, use to add methods and properties', () => {
    runInInjectionContext(() => {
      const origin = signal(5);
      const myState = craftUse(
        state(
          'myState',
          linkedSignal(() => origin() * 2),
          (context) =>
            craftPipe(
              context,
              ({ update, set }) => ({
                increment: () => update((current) => current + 1),
                reset: () => set(0),
              }),
              ({ state }) => ({
                isOdd: computed(() => craftUse(state()) % 2 === 1),
              }),
            ),
        ),
      );

      expect(myState).toBeDefined();
      expectTypeOf(myState).toMatchTypeOf<
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
      expect(craftUse(myState())).toBe(10);
      expect(craftUse(myState.isOdd())).toBe(false);
      myState.increment();
      expect(craftUse(myState())).toBe(11);
      expect(craftUse(myState.isOdd())).toBe(true);
      myState.reset();
      expect(craftUse(myState())).toBe(0);
      expect(craftUse(myState.isOdd())).toBe(false);
    });
  });

  it('typing: tracks generator dependencies from state config and insertions', () => {
    const { CounterReader } = craftService(
      { name: 'CounterReader', scope: 'global' },
      () => ({
        read: (): number => 2,
      }),
    );
    const { CounterStep } = craftService(
      { name: 'CounterStep', scope: 'global' },
      () => ({
        step: (): number => 3,
      }),
    );

    runInInjectionContext(() => {
      const myState = craftUse(
        state(
          'myState',
          function* () {
            const counter = yield* CounterReader(undefined, ({ read }) => ({
              read,
            }));

            return counter.read();
          },
          function* ({ update }) {
            const counterStep = yield* CounterStep();

            return {
              increment: () =>
                update((current) => current + counterStep.step()),
            };
          },
        ),
      );

      expectTypeOf(craftUse(myState())).toEqualTypeOf<number>();
      expectTypeOf<ExtractDeps<typeof myState>>().toEqualTypeOf<{
        CounterReader: {
          scope: 'global';
          dependencies: {};
          browserBoundary: false;
          appStart: false;
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
          appStart: false;
        };
      }>();
    });
  });

  it('should resolve generator state config and generator insertions', () => {
    const { CounterReaderRuntime } = craftService(
      { name: 'CounterReaderRuntime', scope: 'global' },
      () => ({
        read: (): number => 2,
      }),
    );
    const { CounterStepRuntime } = craftService(
      { name: 'CounterStepRuntime', scope: 'global' },
      () => ({
        step: (): number => 3,
      }),
    );

    runInInjectionContext(() => {
      const myState = craftUse(
        state(
          'myState',
          function* () {
            const counter = yield* CounterReaderRuntime(
              undefined,
              ({ read }) => ({
                read,
              }),
            );

            return counter.read();
          },
          function* ({ update }) {
            const counterStep = yield* CounterStepRuntime();

            return {
              increment: () =>
                update((current) => current + counterStep.step()),
            };
          },
        ),
      );

      expect(craftUse(myState())).toBe(2);
      myState.increment();
      expect(craftUse(myState())).toBe(5);
    });
  });

  it('methods can be bind to a source, but not exposed', async () => {
    await runInInjectionContext(async () => {
      const sourceSignal = signalSource<number>('sourceSignal');
      const myState = craftUse(
        state('myState', 0, ({ set }) => ({
          setValue: afterRecomputation(sourceSignal, (value) => {
            set(value);
          }),
          reset: () => set(0),
        })),
      );

      expect(myState).toBeDefined();
      expectTypeOf(craftUse(myState())).toEqualTypeOf<number>();
      expect(craftUse(myState())).toBe(0);

      //@ts-expect-error setValue should not be exposed
      type _ShouldNotBeExposed = (typeof myState)['setValue'];
      await vi.runAllTimersAsync();

      sourceSignal.set(34);
      await vi.runAllTimersAsync();
      console.log('post myState()', craftUse(myState()));
      expect(craftUse(myState())).toBe(34);

      myState.reset();
      await vi.runAllTimersAsync();
      expect(craftUse(myState())).toBe(0);
    });
  });

  it('methods can be bind to a source$, but not exposed', async () => {
    await runInInjectionContext(async () => {
      const sourceSignal = source$<number>('sourceSignal');
      const myState = craftUse(
        state('myState', 0, ({ set }) => ({
          setValue: on$(sourceSignal, (value) => {
            set(value);
          }),
          reset: () => set(0),
        })),
      );

      expect(myState).toBeDefined();
      expectTypeOf(craftUse(myState())).toEqualTypeOf<number>();
      expect(craftUse(myState())).toBe(0);

      //@ts-expect-error setValue should not be exposed
      type _ShouldNotBeExposed = (typeof myState)['setValue'];
      await vi.runAllTimersAsync();

      sourceSignal.emit(34);
      console.log('post myState()', craftUse(myState()));
      expect(craftUse(myState())).toBe(34);

      myState.reset();
      expect(craftUse(myState())).toBe(0);
    });
  });

  it('should expose root source$ insertions as callable methods', async () => {
    await runInInjectionContext(async () => {
      const myState = craftUse(
        state('myState', 0, (context) =>
          craftPipe(
            context,
            ({ set }) => ({
              resetAll$: source$<void>('resetAll$'),
              increment: () => set(1),
            }),
            ({ insertions: { resetAll$ }, set }) => ({
              syncReset: on$(resetAll$, () => set(0)),
            }),
          ),
        ),
      );

      craftUse(myState.increment());
      expect(craftUse(myState())).toBe(1);

      craftUse(myState.resetAll$());
      expect(craftUse(myState())).toBe(0);
    });
  });

  it('it should work with a linked signal as readonly', async () => {
    await runInInjectionContext(async () => {
      const myRefSigal = signal([0]);
      const insertion: InsertionsStateFactory<
        number[],
        {
          addNumber: (
            numberValue: number,
          ) => YieldableInvocation<never, number[]>;
          filterNumber: (
            filterValue: number,
          ) => YieldableInvocation<never, number[]>;
        }
      > = ({ set, state }) => ({
        addNumber: (numberValue: number) => {
          const stateValue = craftUse(state());
          return set([...stateValue, numberValue]);
        },
        filterNumber: (filterValue: number) => {
          const stateValue = craftUse(state());
          return set(stateValue.filter((num) => num !== filterValue));
        },
      });

      const s = craftUse(
        state('s', linkedSignal(() => myRefSigal()).asReadonly(), insertion),
      );
      expect(craftUse(s())).toEqual([0]);
    });
  });
});

describe('state — $self config with providers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should resolve $self plain value identically to the direct form', () => {
    runInInjectionContext(() => {
      const myState = craftUse(state('myState', { $self: 42 }));

      expectTypeOf(myState).toMatchTypeOf<StateOutput<number, {}>>();
      expect(craftUse(myState())).toBe(42);
    });
  });

  it('should resolve $self signal value', () => {
    runInInjectionContext(() => {
      const src = signal(7);
      const myState = craftUse(state('myState', { $self: src }));

      expectTypeOf(craftUse(myState())).toEqualTypeOf<number>();
      expect(craftUse(myState())).toBe(7);
    });
  });

  it('should resolve $self generator factory', () => {
    runInInjectionContext(() => {
      const myState = craftUse(
        state('myState', {
          $self: function* () {
            return 99;
          },
        }),
      );

      expectTypeOf(craftUse(myState())).toEqualTypeOf<number>();
      expect(craftUse(myState())).toBe(99);
    });
  });

  it('should work with insertions alongside $self', () => {
    runInInjectionContext(() => {
      const myState = craftUse(
        state('myState', { $self: 0 }, ({ update }) => ({
          increment: () => update((v) => v + 1),
        })),
      );

      expectTypeOf(craftUse(myState())).toEqualTypeOf<number>();
      myState.increment();
      expect(craftUse(myState())).toBe(1);
    });
  });

  it('providers are applied to the state factory (generator $self)', () => {
    const callLog: string[] = [];
    const trackingWrapper: FnWrapper = function* (factory, thisArg, args) {
      callLog.push('state-factory');
      return yield* (
        factory as (...a: unknown[]) => Generator<unknown, unknown, unknown>
      ).apply(thisArg as object, args);
    };

    runInInjectionContext(() => {
      craftUse(
        state('counter', {
          $self: function* () {
            return 0;
          },
          providers: [
            provideFnWrapper(
              'Warning: dependency injection here is not type-safe and may fail at runtime',
              trackingWrapper,
            ),
          ],
        }),
      );

      expect(callLog).toEqual(['state-factory']);
    });
  });

  it('providers are applied to insertion methods', () => {
    const callLog: string[] = [];
    const trackingWrapper: FnWrapper = function* (factory, thisArg, args) {
      callLog.push('insertion-method');
      return yield* (
        factory as (...a: unknown[]) => Generator<unknown, unknown, unknown>
      ).apply(thisArg as object, args);
    };

    runInInjectionContext(() => {
      const myState = craftUse(
        state(
          'myState',
          {
            $self: 0,
            providers: [
              provideFnWrapper(
                'Warning: dependency injection here is not type-safe and may fail at runtime',
                trackingWrapper,
              ),
            ],
          },
          ({ update }) => ({ increment: () => update((v) => v + 1) }),
        ),
      );

      expect(callLog).toEqual([]);
      myState.increment();
      expect(callLog).toEqual(['insertion-method']);
      myState.increment();
      expect(callLog).toEqual(['insertion-method', 'insertion-method']);
    });
  });

  it('providers scoped to one state do not affect a sibling state', () => {
    const callLog: string[] = [];
    const trackingWrapper: FnWrapper = function* (factory, thisArg, args) {
      callLog.push('called');
      return yield* (
        factory as (...a: unknown[]) => Generator<unknown, unknown, unknown>
      ).apply(thisArg as object, args);
    };

    runInInjectionContext(() => {
      const withProvider = craftUse(
        state(
          'withProvider',
          {
            $self: 0,
            providers: [
              provideFnWrapper(
                'Warning: dependency injection here is not type-safe and may fail at runtime',
                trackingWrapper,
              ),
            ],
          },
          ({ update }) => ({ increment: () => update((v) => v + 1) }),
        ),
      );
      const withoutProvider = craftUse(
        state('withoutProvider', 0, ({ update }) => ({
          increment: () => update((v) => v + 1),
        })),
      );

      withoutProvider.increment();
      expect(callLog).toEqual([]);

      withProvider.increment();
      expect(callLog).toEqual(['called']);
    });
  });

  it('typing: $self unwraps to the correct state type', () => {
    runInInjectionContext(() => {
      const plain = craftUse(state('plain', { $self: 'hello' }));
      expectTypeOf(craftUse(plain())).toEqualTypeOf<string>();

      const withSignal = craftUse(state('withSignal', { $self: signal(0) }));
      expectTypeOf(craftUse(withSignal())).toEqualTypeOf<number>();
    });
  });

  it('typing: satisfied BrandedServiceProvider deps are removed from ExtractDeps', () => {
    const { LocalCounter, provideLocalCounter } = craftService(
      { name: 'LocalCounter', scope: 'toProvide' },
      () => ({ value: () => 1 }),
    );

    if (false) {
      const withoutProviders = craftUse(
        state('withoutProviders', function* () {
          const counter = yield* LocalCounter();
          return counter.value();
        }),
      );
      type WithoutDeps = ExtractDeps<typeof withoutProviders>;
      expectTypeOf<
        'LocalCounter' extends keyof WithoutDeps ? true : false
      >().toEqualTypeOf<true>();

      const withProviders = craftUse(
        state('withProviders', {
          $self: function* () {
            const counter = yield* LocalCounter();
            return counter.value();
          },
          providers: [provideLocalCounter()],
        }),
      );
      type WithDeps = ExtractDeps<typeof withProviders>;
      expectTypeOf<
        'LocalCounter' extends keyof WithDeps ? true : false
      >().toEqualTypeOf<false>();
    }
  });
});

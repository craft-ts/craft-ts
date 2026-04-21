import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { craftService } from './craft-service';
import { state } from './state';
import { ToRegister } from './to-register';

describe('ToRegister', () => {
  it('should expose one flat exhaustive key per service in the graph', () => {
    const { ChildCounterToYield, provideChildCounter } = craftService(
      { name: 'ChildCounter', scope: 'toProvide' },
      () =>
        state(0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    const { ParentCounterToYield, provideParentCounter } = craftService(
      { name: 'ParentCounter', scope: 'toProvide' },
      function* () {
        const child = yield* ChildCounterToYield();

        return {
          incrementParent: () => child.increment(),
        };
      },
    );

    const { injectRootCounter, provideRootCounter } = craftService(
      { name: 'RootCounter', scope: 'toProvide' },
      function* () {
        const parent = yield* ParentCounterToYield();

        return {
          incrementRoot: () => parent.incrementParent(),
        };
      },
    );

    type Register = ToRegister<typeof injectRootCounter>;

    expectTypeOf<keyof Register>().toEqualTypeOf<
      'RootCounter' | 'ParentCounter' | 'ChildCounter'
    >();

    const register: Register = {
      RootCounter: provideRootCounter(),
      ParentCounter: provideParentCounter(),
      ChildCounter: provideChildCounter(),
    };

    expect(register.RootCounter).toBeDefined();
  });

  it('should accept real globals, mocks and notReached markers with exact keys', () => {
    const { CounterToYield } = craftService(
      { name: 'Counter', scope: 'global' },
      () =>
        state(10, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    const { injectCounterConsumer, provideCounterConsumer } = craftService(
      { name: 'CounterConsumer', scope: 'toProvide' },
      function* () {
        const counter = yield* CounterToYield();

        return {
          read: () => counter(),
          increment: () => counter.increment(),
        };
      },
    );

    const register: ToRegister<typeof injectCounterConsumer> = {
      CounterConsumer: provideCounterConsumer(),
      Counter: 'real',
    };

    expect(register.Counter).toBe('real');

    const mockedRegister: ToRegister<typeof injectCounterConsumer> = {
      CounterConsumer: provideCounterConsumer(),
      Counter: {
        $self: vi.fn(() => 42),
        increment: vi.fn(),
      },
    };

    expect(mockedRegister.Counter).toBeDefined();

    if (false) {
      //@ts-expect-error missing Counter entry
      const _missing: ToRegister<typeof injectCounterConsumer> = {
        CounterConsumer: provideCounterConsumer(),
      };

      const _extra: ToRegister<typeof injectCounterConsumer> = {
        CounterConsumer: provideCounterConsumer(),
        Counter: 'real',
        //@ts-expect-error extra keys are rejected
        ExtraCounter: 'notReached',
      };

      const _providerOnGlobal: ToRegister<typeof injectCounterConsumer> = {
        CounterConsumer: provideCounterConsumer(),
        //@ts-expect-error global entries cannot receive providers
        Counter: provideCounterConsumer(),
      };

      const _mockedRoot: ToRegister<typeof injectCounterConsumer> = {
        CounterConsumer: {
          //@ts-expect-error root entries cannot be mocked
          read: vi.fn(() => 1),
          increment: vi.fn(),
        },
        Counter: 'real',
      };

      expect(_missing).toBeDefined();
      expect(_extra).toBeDefined();
      expect(_providerOnGlobal).toBeDefined();
      expect(_mockedRoot).toBeDefined();
    }
  });
});

import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { beforeAll, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { craftService } from './craft-service';
import { setupTestingService } from './setup-testing-service';
import { state } from './state';

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

describe('setupTestingService', () => {
  it('should fail at typing time when a required direct dependency is not decided', () => {
    const { CounterToYield } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () =>
        state(0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    const { injectCounterExtended: CounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'toProvide' },
      function* () {
        return yield* CounterToYield();
      },
    );

    if (false) {
      //@ts-expect-error Counter is a required branch decision
      const _missing = setupTestingService(CounterExtended, () => ({}));
      expect(_missing).toBeDefined();
    }
  });

  it('should resolve a provided branch and mock a required child', () => {
    const { ChildCounterToYield } = craftService(
      { name: 'ChildCounter', scope: 'toProvide' },
      () =>
        state(0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    const { ParentCounterToYield } = craftService(
      { name: 'ParentCounter', scope: 'toProvide' },
      function* () {
        const child = yield* ChildCounterToYield();

        return {
          incrementParent: () => child.increment(),
        };
      },
    );

    const { injectRootCounter: RootCounter } = craftService(
      { name: 'RootCounter', scope: 'toProvide' },
      function* () {
        const parent = yield* ParentCounterToYield();

        return {
          incrementRoot: () => parent.incrementParent(),
        };
      },
    );

    const increment = vi.fn();

    const { sut, mocks, register } = setupTestingService(
      RootCounter,
      ({ ParentCounter }) => ({
        ParentCounter: ParentCounter.provide().branch(({ ChildCounter }) => ({
          ChildCounter: ChildCounter.mock({
            increment,
          }),
        })),
      }),
    );

    expectTypeOf(mocks.ChildCounter.increment).toEqualTypeOf(increment);
    sut.incrementRoot();
    expect(mocks.ChildCounter.increment).toHaveBeenCalledTimes(1);
    expect(register.provided.map((entry) => entry.name)).toEqual([
      'RootCounter',
      'ParentCounter',
    ]);
    expect(register.mocked.map((entry) => entry.name)).toEqual([
      'ChildCounter',
    ]);
  });

  it('should prune a mocked parent branch', () => {
    const { ChildCounterToYield } = craftService(
      { name: 'ChildCounter', scope: 'toProvide' },
      () =>
        state(0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    const { ParentCounterToYield } = craftService(
      { name: 'ParentCounter', scope: 'toProvide' },
      function* () {
        const child = yield* ChildCounterToYield();

        return {
          incrementParent: () => child.increment(),
        };
      },
    );

    const { injectRootCounter: RootCounter } = craftService(
      { name: 'RootCounter', scope: 'toProvide' },
      function* () {
        const parent = yield* ParentCounterToYield();

        return {
          incrementRoot: () => parent.incrementParent(),
        };
      },
    );

    const incrementParent = vi.fn();

    const { sut, mocks, register } = setupTestingService(
      RootCounter,
      ({ ParentCounter }) => ({
        ParentCounter: ParentCounter.mock({
          incrementParent,
        }),
      }),
    );

    sut.incrementRoot();
    expect(mocks.ParentCounter.incrementParent).toHaveBeenCalledTimes(1);
    expect(register.provided.map((entry) => entry.name)).toEqual([
      'RootCounter',
    ]);
    expect(register.mocked.map((entry) => entry.name)).toEqual([
      'ParentCounter',
    ]);
  });

  it('should dedupe a shared descendant configured through a single branch', () => {
    const { ChildCounterToYield } = craftService(
      { name: 'ChildCounter', scope: 'toProvide' },
      () =>
        state(0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    const { LeftCounterToYield } = craftService(
      { name: 'LeftCounter', scope: 'toProvide' },
      function* () {
        const child = yield* ChildCounterToYield();

        return {
          incrementLeft: () => child.increment(),
        };
      },
    );

    const { RightCounterToYield } = craftService(
      { name: 'RightCounter', scope: 'toProvide' },
      function* () {
        const child = yield* ChildCounterToYield();

        return {
          incrementRight: () => child.increment(),
        };
      },
    );

    const { injectRootCounter: RootCounter } = craftService(
      { name: 'RootCounter', scope: 'toProvide' },
      function* () {
        const left = yield* LeftCounterToYield();
        const right = yield* RightCounterToYield();

        return {
          incrementRoot: () => {
            left.incrementLeft();
            right.incrementRight();
          },
        };
      },
    );

    const increment = vi.fn();

    const { sut, mocks, register } = setupTestingService(
      RootCounter,
      ({ LeftCounter, RightCounter }) => ({
        LeftCounter: LeftCounter.provide().branch(({ ChildCounter }) => ({
          ChildCounter: ChildCounter.mock({
            increment,
          }),
        })),
        RightCounter: RightCounter.provide(),
      }),
    );

    sut.incrementRoot();
    expect(mocks.ChildCounter.increment).toHaveBeenCalledTimes(2);
    expect(register.provided.map((entry) => entry.name)).toEqual([
      'RootCounter',
      'LeftCounter',
      'RightCounter',
    ]);
    expect(register.mocked.map((entry) => entry.name)).toEqual([
      'ChildCounter',
    ]);
  });

  it('should fail at typing time when a shared service is decided twice across branches', () => {
    const { ChildCounterToYield } = craftService(
      { name: 'ChildCounter', scope: 'toProvide' },
      () =>
        state(0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    const { LeftCounterToYield } = craftService(
      { name: 'LeftCounter', scope: 'toProvide' },
      function* () {
        return yield* ChildCounterToYield();
      },
    );

    const { RightCounterToYield } = craftService(
      { name: 'RightCounter', scope: 'toProvide' },
      function* () {
        return yield* ChildCounterToYield();
      },
    );

    const { injectRootCounter: RootCounter } = craftService(
      { name: 'RootCounter', scope: 'toProvide' },
      function* () {
        yield* LeftCounterToYield();
        return yield* RightCounterToYield();
      },
    );

    if (false) {
      const _duplicate =
        //@ts-expect-error ChildCounter cannot be resolved twice across branches
        setupTestingService(RootCounter, ({ LeftCounter, RightCounter }) => ({
          LeftCounter: LeftCounter.provide().branch(({ ChildCounter }) => ({
            ChildCounter: ChildCounter.mock({
              increment: vi.fn(),
            }),
          })),
          RightCounter: RightCounter.provide().branch(({ ChildCounter }) => ({
            ChildCounter: ChildCounter.mock({
              increment: vi.fn(),
            }),
          })),
        }));
      expect(_duplicate).toBeDefined();
    }
  });

  it('should ignore a global dependency by default and still allow mocking it explicitly', () => {
    const { CounterToYield } = craftService(
      { name: 'Counter', scope: 'global' },
      () =>
        state(10, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    const { injectCounterConsumer: CounterConsumer } = craftService(
      { name: 'CounterConsumer', scope: 'toProvide' },
      function* () {
        const counter = yield* CounterToYield();

        return {
          read: () => counter(),
          increment: () => counter.increment(),
        };
      },
    );

    const defaultRef = setupTestingService(CounterConsumer, () => ({}));
    expect(defaultRef.sut.read()).toBe(10);
    expect(defaultRef.register.provided.map((entry) => entry.name)).toEqual([
      'CounterConsumer',
    ]);
    expect(defaultRef.register.mocked).toEqual([]);

    const rootCallable = vi.fn(() => 41);
    const increment = vi.fn();

    const mockedRef = setupTestingService(CounterConsumer, ({ Counter }) => ({
      Counter: Counter.mock({
        $self: rootCallable,
        increment,
      }),
    }));

    expect(mockedRef.sut.read()).toBe(41);
    mockedRef.sut.increment();
    expect(mockedRef.mocks.Counter()).toBe(41);
    expect(mockedRef.mocks.Counter.increment).toHaveBeenCalledTimes(1);
    expect(mockedRef.register.mocked.map((entry) => entry.name)).toEqual([
      'Counter',
    ]);
  });

  it('should support an explicit raw provider for manuallyProvidedAtRoot dependencies', () => {
    const { CounterToYield, provideCounter } = craftService(
      { name: 'Counter', scope: 'manuallyProvidedAtRoot' },
      () =>
        state(10, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    const { injectGlobalCounter: GlobalCounter } = craftService(
      { name: 'GlobalCounter', scope: 'global' },
      function* () {
        const counter = yield* CounterToYield();

        return {
          read: () => counter(),
          increment: () => counter.increment(),
        };
      },
    );

    const { sut, register } = setupTestingService(GlobalCounter, ({ Counter }) => ({
      Counter: Counter.provide(provideCounter()),
    }));

    expect(sut.read()).toBe(10);
    sut.increment();
    expect(sut.read()).toBe(11);
    expect(register.provided.map((entry) => entry.name)).toEqual([
      'Counter',
    ]);
  });

  it('should require an explicit raw provider when a child service uses $provided', () => {
    const { CounterToYield, provideCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      (inputs: { $provided: { initialValue: number } }) =>
        state(inputs.$provided.initialValue, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    const { injectCounterHost: CounterHost } = craftService(
      { name: 'CounterHost', scope: 'toProvide' },
      function* () {
        const counter = yield* CounterToYield();

        return {
          read: () => counter(),
          increment: () => counter.increment(),
        };
      },
    );

    if (false) {
      const _missingProvider = setupTestingService(
        CounterHost,
        ({ Counter }) => ({
          //@ts-expect-error Counter requires an explicit raw provider because it uses $provided
          Counter: Counter.provide(),
        }),
      );
      expect(_missingProvider).toBeDefined();
    }

    const { sut, register } = setupTestingService(CounterHost, ({ Counter }) => ({
      Counter: Counter.provide(
        provideCounter({
          initialValue: 41,
        }),
      ),
    }));

    expect(sut.read()).toBe(41);
    sut.increment();
    expect(sut.read()).toBe(42);
    expect(register.provided.map((entry) => entry.name)).toEqual([
      'CounterHost',
      'Counter',
    ]);
  });
});

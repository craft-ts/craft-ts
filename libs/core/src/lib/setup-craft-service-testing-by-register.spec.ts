import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { beforeAll, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { craftService } from './craft-service';
import { setupCraftServiceTestingByRegister } from './setup-craft-service-testing-by-register';
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

describe('setupCraftServiceTestingByRegister', () => {
  it('should return the real sut, keep only explicit mocks and allow notReached descendants', () => {
    const { ChildCounterToYield } = craftService(
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

    const incrementParent = vi.fn();

    const { sut, mocks } = setupCraftServiceTestingByRegister(
      injectRootCounter,
      {
        RootCounter: provideRootCounter(),
        ParentCounter: {
          incrementParent,
        },
        ChildCounter: 'notReached',
      },
    );

    expectTypeOf(mocks.ParentCounter.incrementParent).toEqualTypeOf<
      typeof incrementParent
    >();

    sut.incrementRoot();
    expect(mocks.ParentCounter.incrementParent).toHaveBeenCalledTimes(1);
    expect('ChildCounter' in mocks).toBe(false);

    if (false) {
      //@ts-expect-error only mocked services are exposed through `mocks`
      expect(mocks.ChildCounter).toBeDefined();
    }
  });

  it('should use the real implementation for a global dependency marked as real', () => {
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

    const { sut, mocks } = setupCraftServiceTestingByRegister(
      injectCounterConsumer,
      {
        CounterConsumer: provideCounterConsumer(),
        Counter: 'real',
      },
    );

    expect(sut.read()).toBe(10);
    sut.increment();
    expect(sut.read()).toBe(11);
    expect(Object.keys(mocks)).toEqual([]);
  });

  it('should allow mocking a global dependency with a raw object', () => {
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

    const rootCallable = vi.fn(() => 41);
    const increment = vi.fn();

    const { sut, mocks } = setupCraftServiceTestingByRegister(
      injectCounterConsumer,
      {
        CounterConsumer: provideCounterConsumer(),
        Counter: {
          $self: rootCallable,
          increment,
        },
      },
    );

    expect(sut.read()).toBe(41);
    sut.increment();
    expect(mocks.Counter()).toBe(41);
    expect(mocks.Counter.increment).toHaveBeenCalledTimes(1);
  });

  it('should require a provider for manuallyProvidedAtRoot dependencies', () => {
    const { CounterToYield, provideCounter } = craftService(
      { name: 'Counter', scope: 'manuallyProvidedAtRoot' },
      () =>
        state(7, ({ update }) => ({
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

    const { sut } = setupCraftServiceTestingByRegister(
      injectCounterConsumer,
      {
        CounterConsumer: provideCounterConsumer(),
        Counter: provideCounter(),
      },
    );

    expect(sut.read()).toBe(7);
    sut.increment();
    expect(sut.read()).toBe(8);
  });

  it('should keep a shared descendant reachable through a real sibling branch when another branch is mocked', () => {
    const { SharedCounterToYield, provideSharedCounter } = craftService(
      { name: 'SharedCounter', scope: 'toProvide' },
      () =>
        state(0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    const { LeftCounterToYield } = craftService(
      { name: 'LeftCounter', scope: 'toProvide' },
      function* () {
        const shared = yield* SharedCounterToYield();

        return {
          incrementLeft: () => shared.increment(),
        };
      },
    );

    const { RightCounterToYield, provideRightCounter } = craftService(
      { name: 'RightCounter', scope: 'toProvide' },
      function* () {
        const shared = yield* SharedCounterToYield();

        return {
          incrementRight: () => shared.increment(),
          readSharedFromRight: () => shared(),
        };
      },
    );

    const { injectRootCounter, provideRootCounter } = craftService(
      { name: 'RootCounter', scope: 'toProvide' },
      function* () {
        const left = yield* LeftCounterToYield();
        const right = yield* RightCounterToYield();

        return {
          incrementRoot: () => {
            left.incrementLeft();
            right.incrementRight();
          },
          readShared: () => right.readSharedFromRight(),
        };
      },
    );

    const incrementLeft = vi.fn();

    const { sut, mocks } = setupCraftServiceTestingByRegister(
      injectRootCounter,
      {
        RootCounter: provideRootCounter(),
        LeftCounter: {
          incrementLeft,
        },
        RightCounter: provideRightCounter(),
        SharedCounter: provideSharedCounter(),
      },
    );

    sut.incrementRoot();

    expect(mocks.LeftCounter.incrementLeft).toHaveBeenCalledTimes(1);
    expect(sut.readShared()).toBe(1);
    expect('SharedCounter' in mocks).toBe(false);
  });

  it('should allow pruning a deep sub-branch while keeping the same descendant real through another path', () => {
    const { ChildCounterToYield, provideChildCounter } = craftService(
      { name: 'ChildCounter', scope: 'toProvide' },
      () =>
        state(0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    const { MidCounterToYield } = craftService(
      { name: 'MidCounter', scope: 'toProvide' },
      function* () {
        const child = yield* ChildCounterToYield();

        return {
          incrementMid: () => child.increment(),
        };
      },
    );

    const { ParentCounterToYield } = craftService(
      { name: 'ParentCounter', scope: 'toProvide' },
      function* () {
        const mid = yield* MidCounterToYield();

        return {
          incrementParent: () => mid.incrementMid(),
        };
      },
    );

    const { injectRootCounter, provideRootCounter } = craftService(
      { name: 'RootCounter', scope: 'toProvide' },
      function* () {
        const parent = yield* ParentCounterToYield();
        const child = yield* ChildCounterToYield();

        return {
          incrementRoot: () => {
            parent.incrementParent();
            child.increment();
          },
          readChild: () => child(),
        };
      },
    );

    const incrementParent = vi.fn();

    const { sut, mocks } = setupCraftServiceTestingByRegister(
      injectRootCounter,
      {
        RootCounter: provideRootCounter(),
        ParentCounter: {
          incrementParent,
        },
        MidCounter: 'notReached',
        ChildCounter: provideChildCounter(),
      },
    );

    sut.incrementRoot();

    expect(mocks.ParentCounter.incrementParent).toHaveBeenCalledTimes(1);
    expect(sut.readChild()).toBe(1);
    expect('MidCounter' in mocks).toBe(false);
  });

  it('should allow notReached once an entire branch is fully pruned', () => {
    const { SharedCounterToYield } = craftService(
      { name: 'SharedCounter', scope: 'toProvide' },
      () =>
        state(0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    const { LeftCounterToYield } = craftService(
      { name: 'LeftCounter', scope: 'toProvide' },
      function* () {
        const shared = yield* SharedCounterToYield();

        return {
          incrementLeft: () => shared.increment(),
        };
      },
    );

    const { RightCounterToYield, provideRightCounter } = craftService(
      { name: 'RightCounter', scope: 'toProvide' },
      () =>
        state(0, ({ update }) => ({
          incrementRight: () => update((value) => value + 1),
        })),
    );

    const { injectRootCounter, provideRootCounter } = craftService(
      { name: 'RootCounter', scope: 'toProvide' },
      function* () {
        const left = yield* LeftCounterToYield();
        const right = yield* RightCounterToYield();

        return {
          incrementRoot: () => {
            left.incrementLeft();
            right.incrementRight();
          },
          readRight: () => right(),
        };
      },
    );

    const incrementLeft = vi.fn();

    const { sut, mocks } = setupCraftServiceTestingByRegister(
      injectRootCounter,
      {
        RootCounter: provideRootCounter(),
        LeftCounter: {
          incrementLeft,
        },
        RightCounter: provideRightCounter(),
        SharedCounter: 'notReached',
      },
    );

    sut.incrementRoot();

    expect(mocks.LeftCounter.incrementLeft).toHaveBeenCalledTimes(1);
    expect(sut.readRight()).toBe(1);
    expect('SharedCounter' in mocks).toBe(false);
  });

  it('should reject invalid register combinations at typing time', () => {
    const { ChildCounterToYield, provideChildCounter } = craftService(
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

    const { injectRootCounter, provideRootCounter } = craftService(
      { name: 'RootCounter', scope: 'toProvide' },
      function* () {
        const parent = yield* ParentCounterToYield();
        const child = yield* ChildCounterToYield();

        return {
          incrementRoot: () => {
            parent.incrementParent();
            child.increment();
          },
        };
      },
    );

    const { CounterToYield, provideCounter } = craftService(
      { name: 'Counter', scope: 'manuallyProvidedAtRoot' },
      () =>
        state(0, ({ update }) => ({
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

    const { RouterToYield } = craftService(
      { name: 'Router', scope: 'global' },
      () => ({
        url: '/real',
      }),
    );

    const { injectNavigation, provideNavigation } = craftService(
      { name: 'Navigation', scope: 'toProvide' },
      function* () {
        const router = yield* RouterToYield();

        return {
          readUrl: () => router.url,
        };
      },
    );

    if (false) {
      const _mockedRoot = setupCraftServiceTestingByRegister(injectRootCounter, {
        RootCounter: {
          //@ts-expect-error the root cannot be mocked
          incrementRoot: vi.fn(),
        },
        ParentCounter: {
          incrementParent: vi.fn(),
        },
        ChildCounter: 'notReached',
      });

      const _realRoot = setupCraftServiceTestingByRegister(injectRootCounter, {
        //@ts-expect-error the root cannot be marked as real for a toProvide sut
        RootCounter: 'real',
        ParentCounter: {
          incrementParent: vi.fn(),
        },
        ChildCounter: 'notReached',
      });

      const _unreachedRoot = setupCraftServiceTestingByRegister(
        injectRootCounter,
        {
          //@ts-expect-error the root cannot be marked as notReached
          RootCounter: 'notReached',
          ParentCounter: {
            incrementParent: vi.fn(),
          },
          ChildCounter: 'notReached',
        },
      );

      //@ts-expect-error a reachable shared child cannot be marked as notReached
      const _sharedChild = setupCraftServiceTestingByRegister(injectRootCounter, {
        RootCounter: provideRootCounter(),
        ParentCounter: {
          incrementParent: vi.fn(),
        },
        ChildCounter: 'notReached',
      });

      const _realManual = setupCraftServiceTestingByRegister(
        injectCounterConsumer,
        {
          CounterConsumer: provideCounterConsumer(),
          //@ts-expect-error `real` is not valid for manuallyProvidedAtRoot
          Counter: 'real',
        },
      );

      const _providerGlobal = setupCraftServiceTestingByRegister(
        injectNavigation,
        {
          Navigation: provideNavigation(),
          //@ts-expect-error providers are not valid for globals
          Router: provideNavigation(),
        },
      );

      const _reachableChild = setupCraftServiceTestingByRegister(
        injectCounterConsumer,
        //@ts-expect-error a reachable dependency cannot be marked as notReached
        {
          CounterConsumer: provideCounterConsumer(),
          Counter: 'notReached',
        },
      );

      expect(_mockedRoot).toBeDefined();
      expect(_realRoot).toBeDefined();
      expect(_unreachedRoot).toBeDefined();
      expect(_sharedChild).toBeDefined();
      expect(_realManual).toBeDefined();
      expect(_providerGlobal).toBeDefined();
      expect(_reachableChild).toBeDefined();
      expect(provideChildCounter).toBeDefined();
      expect(provideCounter).toBeDefined();
    }
  });
});

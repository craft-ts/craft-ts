import { craftUse } from './craft-use';
import { Component, signal } from '@angular/core';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  craftService,
  onAppStart,
  type GetServiceDependencies,
} from './craft-service';
import {
  setupCraftComponentTestingByRegister,
  setupCraftServiceTestingByRegister,
} from './setup-craft-service-testing-by-register';
import type {
  GetDeps,
  GetPublicComponentProperties,
} from './branded-component/branded-component';
import { state } from './state';

describe('setupCraftServiceTestingByRegister', () => {
  it('should return the real sut, keep only explicit mocks and allow notReached descendants', async () => {
    const { ChildCounter } = craftService(
      { name: 'ChildCounter', scope: 'toProvide' },
      function* () {
        const childCounter = yield* state('childCounter', 0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
        return childCounter;
      },
    );

    const { ParentCounter } = craftService(
      { name: 'ParentCounter', scope: 'toProvide' },
      function* () {
        const child = yield* ChildCounter();

        return {
          incrementParent: () => child.increment(),
        };
      },
    );

    const { RootCounter, provideRootCounter } = craftService(
      { name: 'RootCounter', scope: 'toProvide' },
      function* () {
        const parent = yield* ParentCounter();

        return {
          incrementRoot: () => parent.incrementParent(),
        };
      },
    );

    const incrementParent = vi.fn();

    const { sut, mocks } = await setupCraftServiceTestingByRegister(
      RootCounter,
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

  it('should use the real implementation for a global dependency marked as real', async () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'global' },
      function* () {
        const counter = yield* state('counter', 10, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
        return counter;
      },
    );

    const { CounterConsumer, provideCounterConsumer } = craftService(
      { name: 'CounterConsumer', scope: 'toProvide' },
      function* () {
        const counter = yield* Counter();

        return {
          read: () => craftUse(counter()),
          increment: () => counter.increment(),
        };
      },
    );

    const { sut, mocks } = await setupCraftServiceTestingByRegister(
      CounterConsumer,
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

  it('should allow mocking a global dependency with a raw object', async () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'global' },
      function* () {
        const counter = yield* state('counter', 10, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
        return counter;
      },
    );

    const { CounterConsumer, provideCounterConsumer } = craftService(
      { name: 'CounterConsumer', scope: 'toProvide' },
      function* () {
        const counter = yield* Counter();

        return {
          read: () => craftUse(counter()),
          increment: () => counter.increment(),
        };
      },
    );

    const rootCallable = vi.fn(() => 41);
    const increment = vi.fn();

    const { sut, mocks } = await setupCraftServiceTestingByRegister(
      CounterConsumer,
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

  it('should allow a minimal mock when a dependency is only used through derivations', async () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'global' },
      function* () {
        const counter = yield* state('counter', 0, ({ update }) => ({
          increment: () => update((value) => value + 1),
          decrement: () => update((value) => value - 1),
        }));
        return counter;
      },
    );

    const { CounterFeature, provideCounterFeature } = craftService(
      { name: 'CounterFeature', scope: 'toProvide' },
      function* () {
        return yield* Counter(undefined, ({ $self, increment }) => ({
          $self,
          incrementCounter: increment,
        }));
      },
    );

    const rootCallable = vi.fn(() => 41);
    const increment = vi.fn();

    const { sut, mocks } = await setupCraftServiceTestingByRegister(
      CounterFeature,
      {
        CounterFeature: provideCounterFeature(),
        Counter: {
          $self: rootCallable,
          increment,
        },
      },
    );

    expect(sut()).toBe(41);
    sut.incrementCounter();
    expect(mocks.Counter.increment).toHaveBeenCalledTimes(1);
    expect('$self' in mocks.Counter).toBe(false);

    if (false) {
      //@ts-expect-error minimal derived mocks should not expose unused full-service members
      expect(mocks.Counter.decrement).toBeDefined();
    }
  });

  it('should allow a minimal mock when a dependency is only used through a nested property shortcut', async () => {
    const { QueryApi } = craftService(
      { name: 'QueryApi', scope: 'global' },
      () => ({
        userQuery: {
          isLoading: signal(false),
          data: signal<string | null>(null),
        },
      }),
    );

    const { QueryConsumer, provideQueryConsumer } = craftService(
      { name: 'QueryConsumer', scope: 'toProvide' },
      function* () {
        const isLoading = yield* QueryApi.userQuery.isLoading();
        return { isLoading };
      },
    );

    const mockLoading = signal(true);

    const { sut, mocks } = await setupCraftServiceTestingByRegister(
      QueryConsumer,
      {
        QueryConsumer: provideQueryConsumer(),
        QueryApi: {
          userQuery: { isLoading: mockLoading },
        },
      },
    );

    expect(sut.isLoading).toBe(mockLoading);
    expect(craftUse(sut.isLoading())).toBe(true);
    expect(mocks.QueryApi.userQuery.isLoading).toBe(mockLoading);

    if (false) {
      //@ts-expect-error data was not used so it is not required or exposed in the mock
      expect(mocks.QueryApi.userQuery.data).toBeDefined();
    }
  });

  it('should require all nested properties that are used in the mock', async () => {
    const { QueryApiMulti } = craftService(
      { name: 'QueryApiMulti', scope: 'global' },
      () => ({
        userQuery: {
          isLoading: signal(false),
          data: signal<string | null>(null),
        },
      }),
    );

    const { QueryMultiConsumer, provideQueryMultiConsumer } = craftService(
      { name: 'QueryMultiConsumer', scope: 'toProvide' },
      function* () {
        const isLoading = yield* QueryApiMulti.userQuery.isLoading();
        const data = yield* QueryApiMulti.userQuery.data();
        return { isLoading, data };
      },
    );

    const mockLoading = signal(true);
    const mockData = signal<string | null>('hello');

    const { sut, mocks } = await setupCraftServiceTestingByRegister(
      QueryMultiConsumer,
      {
        QueryMultiConsumer: provideQueryMultiConsumer(),
        QueryApiMulti: {
          userQuery: { isLoading: mockLoading, data: mockData },
        },
      },
    );

    expect(sut.isLoading).toBe(mockLoading);
    expect(sut.data).toBe(mockData);
    expect(mocks.QueryApiMulti.userQuery.isLoading).toBe(mockLoading);
    expect(mocks.QueryApiMulti.userQuery.data).toBe(mockData);

    if (false) {
      setupCraftServiceTestingByRegister(QueryMultiConsumer, {
        QueryMultiConsumer: provideQueryMultiConsumer(),
        // @ts-expect-error both isLoading and data are used so both are required in the mock
        QueryApiMulti: { userQuery: { isLoading: mockLoading } },
      });
    }
  });

  it('should keep a full-service mock public shape without exposing $self', async () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'global' },
      function* () {
        const counter = yield* state('counter', 0, ({ update }) => ({
          increment: () => update((value) => value + 1),
          decrement: () => update((value) => value - 1),
        }));
        return counter;
      },
    );

    const { CounterConsumer, provideCounterConsumer } = craftService(
      { name: 'CounterConsumer', scope: 'toProvide' },
      function* () {
        const counter = yield* Counter();
        const { incrementCounter } = yield* Counter(
          undefined,
          ({ increment }) => ({
            incrementCounter: increment,
          }),
        );

        return {
          read: () => craftUse(counter()),
          increment: () => incrementCounter(),
          decrement: () => counter.decrement(),
        };
      },
    );

    const rootCallable = vi.fn(() => 41);
    const increment = vi.fn();
    const decrement = vi.fn();

    const { sut, mocks } = await setupCraftServiceTestingByRegister(
      CounterConsumer,
      {
        CounterConsumer: provideCounterConsumer(),
        Counter: {
          $self: rootCallable,
          increment,
          decrement,
        },
      },
    );

    expect(sut.read()).toBe(41);
    sut.increment();
    sut.decrement();
    expect(mocks.Counter.increment).toHaveBeenCalledTimes(1);
    expect(mocks.Counter.decrement).toHaveBeenCalledTimes(1);
    expect('$self' in mocks.Counter).toBe(false);

    if (false) {
      //@ts-expect-error public full-service mocks should still hide $self
      expect(mocks.Counter.$self).toBeDefined();
    }
  });

  it('should require a provider for manuallyProvidedAtRoot dependencies', async () => {
    const { Counter, provideCounter } = craftService(
      { name: 'Counter', scope: 'manuallyProvidedAtRoot' },
      function* () {
        const counter = yield* state('counter', 7, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
        return counter;
      },
    );

    const { CounterConsumer, provideCounterConsumer } = craftService(
      { name: 'CounterConsumer', scope: 'toProvide' },
      function* () {
        const counter = yield* Counter();

        return {
          read: () => craftUse(counter()),
          increment: () => counter.increment(),
        };
      },
    );

    const { sut } = await setupCraftServiceTestingByRegister(CounterConsumer, {
      CounterConsumer: provideCounterConsumer(),
      Counter: provideCounter(),
    });

    expect(sut.read()).toBe(7);
    sut.increment();
    expect(sut.read()).toBe(8);
  });

  it('should keep a shared descendant reachable through a real sibling branch when another branch is mocked', async () => {
    const { SharedCounter, provideSharedCounter } = craftService(
      { name: 'SharedCounter', scope: 'toProvide' },
      function* () {
        const sharedCounter = yield* state(
          'sharedCounter',
          0,
          ({ update }) => ({
            increment: () => update((value) => value + 1),
          }),
        );
        return sharedCounter;
      },
    );

    const { LeftCounter } = craftService(
      { name: 'LeftCounter', scope: 'toProvide' },
      function* () {
        const shared = yield* SharedCounter();

        return {
          incrementLeft: () => shared.increment(),
        };
      },
    );

    const { RightCounter, provideRightCounter } = craftService(
      { name: 'RightCounter', scope: 'toProvide' },
      function* () {
        const shared = yield* SharedCounter();

        return {
          incrementRight: () => shared.increment(),
          readSharedFromRight: () => craftUse(shared()),
        };
      },
    );

    const { RootCounter, provideRootCounter } = craftService(
      { name: 'RootCounter', scope: 'toProvide' },
      function* () {
        const left = yield* LeftCounter();
        const right = yield* RightCounter();

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

    const { sut, mocks } = await setupCraftServiceTestingByRegister(
      RootCounter,
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

  it('should allow pruning a deep sub-branch while keeping the same descendant real through another path', async () => {
    const { ChildCounter, provideChildCounter } = craftService(
      { name: 'ChildCounter', scope: 'toProvide' },
      function* () {
        const childCounter = yield* state('childCounter', 0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
        return childCounter;
      },
    );

    const { MidCounter } = craftService(
      { name: 'MidCounter', scope: 'toProvide' },
      function* () {
        const child = yield* ChildCounter();

        return {
          incrementMid: () => child.increment(),
        };
      },
    );

    const { ParentCounter } = craftService(
      { name: 'ParentCounter', scope: 'toProvide' },
      function* () {
        const mid = yield* MidCounter();

        return {
          incrementParent: () => mid.incrementMid(),
        };
      },
    );

    const { RootCounter, provideRootCounter } = craftService(
      { name: 'RootCounter', scope: 'toProvide' },
      function* () {
        const parent = yield* ParentCounter();
        const child = yield* ChildCounter();

        return {
          incrementRoot: () => {
            parent.incrementParent();
            child.increment();
          },
          readChild: () => craftUse(child()),
        };
      },
    );

    const incrementParent = vi.fn();

    const { sut, mocks } = await setupCraftServiceTestingByRegister(
      RootCounter,
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

  it('should allow notReached once an entire branch is fully pruned', async () => {
    const { SharedCounter } = craftService(
      { name: 'SharedCounter', scope: 'toProvide' },
      function* () {
        const sharedCounter = yield* state(
          'sharedCounter',
          0,
          ({ update }) => ({
            increment: () => update((value) => value + 1),
          }),
        );
        return sharedCounter;
      },
    );

    const { LeftCounter } = craftService(
      { name: 'LeftCounter', scope: 'toProvide' },
      function* () {
        const shared = yield* SharedCounter();

        return {
          incrementLeft: () => shared.increment(),
        };
      },
    );

    const { RightCounter, provideRightCounter } = craftService(
      { name: 'RightCounter', scope: 'toProvide' },
      function* () {
        const rightCounter = yield* state('rightCounter', 0, ({ update }) => ({
          incrementRight: () => update((value) => value + 1),
        }));
        return rightCounter;
      },
    );

    const { RootCounter, provideRootCounter } = craftService(
      { name: 'RootCounter', scope: 'toProvide' },
      function* () {
        const left = yield* LeftCounter();
        const right = yield* RightCounter();

        return {
          incrementRoot: () => {
            left.incrementLeft();
            right.incrementRight();
          },
          readRight: () => craftUse(right()),
        };
      },
    );

    const incrementLeft = vi.fn();

    const { sut, mocks } = await setupCraftServiceTestingByRegister(
      RootCounter,
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

  it('should require an explicit appStart decision for reachable real services', async () => {
    const calls: string[] = [];
    const { AppStartRequired } = craftService(
      {
        name: 'AppStartRequired',
        scope: 'global',
        appStart: true,
      },
      function* () {
        yield* onAppStart(() => {
          calls.push('started');
          return undefined;
        });

        return 1;
      },
    );

    const { AppStartRequiredHost, provideAppStartRequiredHost } = craftService(
      { name: 'AppStartRequiredHost', scope: 'toProvide' },
      function* () {
        const startup = yield* AppStartRequired();

        return {
          read: () => startup,
        };
      },
    );

    if (false) {
      //@ts-expect-error reachable real appStart services must be declared as run or ignore
      setupCraftServiceTestingByRegister(AppStartRequiredHost, {
        AppStartRequiredHost: provideAppStartRequiredHost(),
        AppStartRequired: 'real',
      });
    }

    await expect(
      (
        setupCraftServiceTestingByRegister as unknown as (
          target: unknown,
          register: unknown,
        ) => Promise<unknown>
      )(AppStartRequiredHost, {
        AppStartRequiredHost: provideAppStartRequiredHost(),
        AppStartRequired: 'real',
      }),
    ).rejects.toThrow(
      'setupCraftServiceTestingByRegister requires options.appStart decisions for: AppStartRequired.',
    );
    expect(calls).toEqual([]);
  });

  it('should await async appStart hooks before returning', async () => {
    const calls: string[] = [];
    const { AsyncRegisterStartup } = craftService(
      {
        name: 'AsyncRegisterStartup',
        scope: 'global',
        appStart: true,
      },
      function* () {
        yield* onAppStart(
          () =>
            new Promise<void>((resolve) => {
              queueMicrotask(() => {
                calls.push('started');
                resolve();
              });
            }),
        );

        return 1;
      },
    );

    const { AsyncRegisterHost, provideAsyncRegisterHost } = craftService(
      { name: 'AsyncRegisterHost', scope: 'toProvide' },
      function* () {
        return yield* AsyncRegisterStartup();
      },
    );

    await setupCraftServiceTestingByRegister(
      AsyncRegisterHost,
      {
        AsyncRegisterHost: provideAsyncRegisterHost(),
        AsyncRegisterStartup: 'real',
      },
      {
        appStart: {
          AsyncRegisterStartup: 'run',
        },
      },
    );

    expect(calls).toEqual(['started']);
  });

  it('should accept appStart ignore without running the hook', async () => {
    const calls: string[] = [];
    const { IgnoredRegisterStartup } = craftService(
      {
        name: 'IgnoredRegisterStartup',
        scope: 'global',
        appStart: true,
      },
      function* () {
        yield* onAppStart(() => {
          calls.push('started');
          return undefined;
        });

        return 1;
      },
    );

    const { IgnoredRegisterHost, provideIgnoredRegisterHost } = craftService(
      { name: 'IgnoredRegisterHost', scope: 'toProvide' },
      function* () {
        return yield* IgnoredRegisterStartup();
      },
    );

    await setupCraftServiceTestingByRegister(
      IgnoredRegisterHost,
      {
        IgnoredRegisterHost: provideIgnoredRegisterHost(),
        IgnoredRegisterStartup: 'real',
      },
      {
        appStart: {
          IgnoredRegisterStartup: 'ignore',
        },
      },
    );

    expect(calls).toEqual([]);
  });

  it('should not require appStart when the service is mocked', async () => {
    const calls: string[] = [];
    const { MockedRegisterStartup } = craftService(
      {
        name: 'MockedRegisterStartup',
        scope: 'global',
        appStart: true,
      },
      function* () {
        yield* onAppStart(() => {
          calls.push('started');
          return undefined;
        });

        return {
          read: () => 1 as number,
        };
      },
    );

    const { MockedRegisterHost, provideMockedRegisterHost } = craftService(
      { name: 'MockedRegisterHost', scope: 'toProvide' },
      function* () {
        const startup = yield* MockedRegisterStartup();

        return {
          read: startup.read,
        };
      },
    );

    const { sut } = await setupCraftServiceTestingByRegister(
      MockedRegisterHost,
      {
        MockedRegisterHost: provideMockedRegisterHost(),
        MockedRegisterStartup: {
          read: () => 41,
        },
      },
    );

    expect(sut.read()).toBe(41);
    expect(calls).toEqual([]);
  });

  it('should not require appStart when the service is notReached', async () => {
    const calls: string[] = [];
    const { NotReachedRegisterStartup } = craftService(
      {
        name: 'NotReachedRegisterStartup',
        scope: 'global',
        appStart: true,
      },
      function* () {
        yield* onAppStart(() => {
          calls.push('started');
          return undefined;
        });

        return 1;
      },
    );

    const { NotReachedRegisterParent } = craftService(
      { name: 'NotReachedRegisterParent', scope: 'global' },
      function* () {
        const startup = yield* NotReachedRegisterStartup();

        return {
          read: () => startup,
        };
      },
    );

    const { NotReachedRegisterHost, provideNotReachedRegisterHost } =
      craftService(
        { name: 'NotReachedRegisterHost', scope: 'toProvide' },
        function* () {
          return yield* NotReachedRegisterParent();
        },
      );

    await setupCraftServiceTestingByRegister(NotReachedRegisterHost, {
      NotReachedRegisterHost: provideNotReachedRegisterHost(),
      NotReachedRegisterParent: {
        read: () => 41,
      },
      NotReachedRegisterStartup: 'notReached',
    });

    expect(calls).toEqual([]);
  });

  it('should reject invalid register combinations at typing time', () => {
    const { ChildCounter, provideChildCounter } = craftService(
      { name: 'ChildCounter', scope: 'toProvide' },
      function* () {
        const childCounter = yield* state('childCounter', 0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
        return childCounter;
      },
    );

    const { ParentCounter } = craftService(
      { name: 'ParentCounter', scope: 'toProvide' },
      function* () {
        const child = yield* ChildCounter();

        return {
          incrementParent: () => child.increment(),
        };
      },
    );

    const { RootCounter, provideRootCounter } = craftService(
      { name: 'RootCounter', scope: 'toProvide' },
      function* () {
        const parent = yield* ParentCounter();
        const child = yield* ChildCounter();

        return {
          incrementRoot: () => {
            parent.incrementParent();
            child.increment();
          },
        };
      },
    );

    const { Counter, provideCounter } = craftService(
      { name: 'Counter', scope: 'manuallyProvidedAtRoot' },
      function* () {
        const counter = yield* state('counter', 0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
        return counter;
      },
    );

    const { CounterConsumer, provideCounterConsumer } = craftService(
      { name: 'CounterConsumer', scope: 'toProvide' },
      function* () {
        const counter = yield* Counter();

        return {
          read: () => craftUse(counter()),
          increment: () => counter.increment(),
        };
      },
    );

    const { Router } = craftService(
      { name: 'Router', scope: 'global' },
      () => ({
        url: '/real',
      }),
    );

    const { Navigation, provideNavigation } = craftService(
      { name: 'Navigation', scope: 'toProvide' },
      function* () {
        const router = yield* Router();

        return {
          readUrl: () => router.url,
        };
      },
    );

    if (false) {
      const _mockedRoot = setupCraftServiceTestingByRegister(RootCounter, {
        RootCounter: {
          //@ts-expect-error the root cannot be mocked
          incrementRoot: vi.fn(),
        },
        ParentCounter: {
          incrementParent: vi.fn(),
        },
        ChildCounter: 'notReached',
      });

      const _realRoot = setupCraftServiceTestingByRegister(RootCounter, {
        //@ts-expect-error the root cannot be marked as real for a toProvide sut
        RootCounter: 'real',
        ParentCounter: {
          incrementParent: vi.fn(),
        },
        ChildCounter: 'notReached',
      });

      const _unreachedRoot = setupCraftServiceTestingByRegister(RootCounter, {
        //@ts-expect-error the root cannot be marked as notReached
        RootCounter: 'notReached',
        ParentCounter: {
          incrementParent: vi.fn(),
        },
        ChildCounter: 'notReached',
      });

      const _sharedChild = setupCraftServiceTestingByRegister(
        RootCounter,
        //@ts-expect-error a reachable shared child cannot be marked as notReached
        {
          RootCounter: provideRootCounter(),
          ParentCounter: {
            incrementParent: vi.fn(),
          },
          ChildCounter: 'notReached',
        },
      );

      const _realManual = setupCraftServiceTestingByRegister(CounterConsumer, {
        CounterConsumer: provideCounterConsumer(),
        //@ts-expect-error `real` is not valid for manuallyProvidedAtRoot
        Counter: 'real',
      });

      const _providerGlobal = setupCraftServiceTestingByRegister(Navigation, {
        Navigation: provideNavigation(),
        //@ts-expect-error providers are not valid for globals
        Router: provideNavigation(),
      });

      const _reachableChild = setupCraftServiceTestingByRegister(
        CounterConsumer,
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

describe('setupCraftServiceTestingByRegister.boundaryOnly', () => {
  it('should allow mocking reachable browser boundaries while keeping application services real', async () => {
    const { BoundaryOnlyStorage } = craftService(
      {
        name: 'BoundaryOnlyStorage',
        scope: 'global',
        browserBoundary: true,
      },
      () => ({
        read: (): string => 'real-storage',
      }),
    );

    const { BoundaryOnlyDomain } = craftService(
      { name: 'BoundaryOnlyDomain', scope: 'global' },
      function* () {
        const storage = yield* BoundaryOnlyStorage();

        return {
          read: () => `domain:${storage.read()}`,
        };
      },
    );

    const { BoundaryOnlyRoot, provideBoundaryOnlyRoot } = craftService(
      { name: 'BoundaryOnlyRoot', scope: 'toProvide' },
      function* () {
        const domain = yield* BoundaryOnlyDomain();

        return {
          read: domain.read,
        };
      },
    );

    const { sut, mocks } =
      await setupCraftServiceTestingByRegister.boundaryOnly(BoundaryOnlyRoot, {
        toProvideRegister: {
          BoundaryOnlyRoot: provideBoundaryOnlyRoot(),
        },
        boundaryRegister: {
          BoundaryOnlyStorage: {
            read: () => 'mock-storage',
          },
        },
      });

    expect(sut.read()).toBe('domain:mock-storage');
    expect(mocks.BoundaryOnlyStorage.read()).toBe('mock-storage');

    if (false) {
      //@ts-expect-error non-boundary services are never exposed as boundaryOnly mocks
      expect(mocks.BoundaryOnlyDomain).toBeDefined();
    }
  });

  it('should allow real browser boundaries and omit toProvideRegister when no provider is needed', async () => {
    const { BoundaryOnlyRealStorage } = craftService(
      {
        name: 'BoundaryOnlyRealStorage',
        scope: 'global',
        browserBoundary: true,
      },
      () => ({
        read: (): string => 'real-storage',
      }),
    );

    const { BoundaryOnlyRealHost } = craftService(
      { name: 'BoundaryOnlyRealHost', scope: 'global' },
      function* () {
        const storage = yield* BoundaryOnlyRealStorage();

        return {
          read: storage.read,
        };
      },
    );

    const { sut, mocks } =
      await setupCraftServiceTestingByRegister.boundaryOnly(
        BoundaryOnlyRealHost,
        {
          boundaryRegister: {
            BoundaryOnlyRealStorage: 'real',
          },
        },
      );

    expect(sut.read()).toBe('real-storage');
    expect(Object.keys(mocks)).toEqual([]);
  });

  it('should require providers for reachable provider-scoped real services', async () => {
    const { BoundaryOnlyConfig, provideBoundaryOnlyConfig } = craftService(
      { name: 'BoundaryOnlyConfig', scope: 'toProvide' },
      () => ({
        read: (): string => 'provided-config',
      }),
    );

    const { BoundaryOnlyConfigHost, provideBoundaryOnlyConfigHost } =
      craftService(
        { name: 'BoundaryOnlyConfigHost', scope: 'toProvide' },
        function* () {
          const config = yield* BoundaryOnlyConfig();

          return {
            read: config.read,
          };
        },
      );

    if (false) {
      setupCraftServiceTestingByRegister.boundaryOnly(
        BoundaryOnlyConfigHost,
        //@ts-expect-error provider-scoped real dependencies must be listed in toProvideRegister
        {},
      );
    }

    const { sut } = await setupCraftServiceTestingByRegister.boundaryOnly(
      BoundaryOnlyConfigHost,
      {
        toProvideRegister: {
          BoundaryOnlyConfigHost: provideBoundaryOnlyConfigHost(),
          BoundaryOnlyConfig: provideBoundaryOnlyConfig(),
        },
      },
    );

    expect(sut.read()).toBe('provided-config');
  });

  it('should require an explicit decision for each reachable browser boundary', () => {
    const { BoundaryOnlyRequiredBoundary } = craftService(
      {
        name: 'BoundaryOnlyRequiredBoundary',
        scope: 'global',
        browserBoundary: true,
      },
      () => ({
        read: (): string => 'real-boundary',
      }),
    );

    const { BoundaryOnlyRequiredHost } = craftService(
      { name: 'BoundaryOnlyRequiredHost', scope: 'global' },
      function* () {
        const boundary = yield* BoundaryOnlyRequiredBoundary();

        return {
          read: boundary.read,
        };
      },
    );

    if (false) {
      setupCraftServiceTestingByRegister.boundaryOnly(
        BoundaryOnlyRequiredHost,
        //@ts-expect-error reachable browser boundaries must be listed in boundaryRegister
        {},
      );
    }

    expect(BoundaryOnlyRequiredHost).toBeDefined();
  });

  it('should not require descendants of a mocked browser boundary', async () => {
    const { BoundaryOnlyChildBoundary } = craftService(
      {
        name: 'BoundaryOnlyChildBoundary',
        scope: 'global',
        browserBoundary: true,
      },
      () => ({
        read: (): string => 'child',
      }),
    );

    const { BoundaryOnlyParentBoundary } = craftService(
      {
        name: 'BoundaryOnlyParentBoundary',
        scope: 'global',
        browserBoundary: true,
      },
      function* () {
        const child = yield* BoundaryOnlyChildBoundary();

        return {
          read: () => `parent:${child.read()}`,
        };
      },
    );

    const { BoundaryOnlyParentHost } = craftService(
      { name: 'BoundaryOnlyParentHost', scope: 'global' },
      function* () {
        const parent = yield* BoundaryOnlyParentBoundary();

        return {
          read: parent.read,
        };
      },
    );

    const { sut } = await setupCraftServiceTestingByRegister.boundaryOnly(
      BoundaryOnlyParentHost,
      {
        boundaryRegister: {
          BoundaryOnlyParentBoundary: {
            read: () => 'mock-parent',
          },
        },
      },
    );

    expect(sut.read()).toBe('mock-parent');
  });

  it('should keep appStart decisions for reachable real services', async () => {
    const calls: string[] = [];
    const { BoundaryOnlyStartup } = craftService(
      {
        name: 'BoundaryOnlyStartup',
        scope: 'global',
        appStart: true,
      },
      function* () {
        yield* onAppStart(() => {
          calls.push('started');
          return undefined;
        });

        return {
          read: () => 1,
        };
      },
    );

    const { BoundaryOnlyStartupHost } = craftService(
      { name: 'BoundaryOnlyStartupHost', scope: 'global' },
      function* () {
        const startup = yield* BoundaryOnlyStartup();

        return {
          read: startup.read,
        };
      },
    );

    if (false) {
      setupCraftServiceTestingByRegister.boundaryOnly(
        BoundaryOnlyStartupHost,
        //@ts-expect-error reachable real appStart services must be declared as run or ignore
        {},
      );
    }

    const { sut } = await setupCraftServiceTestingByRegister.boundaryOnly(
      BoundaryOnlyStartupHost,
      {
        appStart: {
          BoundaryOnlyStartup: 'run',
        },
      },
    );

    expect(sut.read()).toBe(1);
    expect(calls).toEqual(['started']);
  });

  it('should reject non-boundary mocks at type level and runtime', async () => {
    const { BoundaryOnlyRuntimeDomain } = craftService(
      { name: 'BoundaryOnlyRuntimeDomain', scope: 'global' },
      () => ({
        read: (): string => 'real-domain',
      }),
    );

    const { BoundaryOnlyRuntimeHost } = craftService(
      { name: 'BoundaryOnlyRuntimeHost', scope: 'global' },
      function* () {
        const domain = yield* BoundaryOnlyRuntimeDomain();

        return {
          read: domain.read,
        };
      },
    );

    if (false) {
      setupCraftServiceTestingByRegister.boundaryOnly(BoundaryOnlyRuntimeHost, {
        //@ts-expect-error non-boundary services cannot be listed in boundaryRegister
        boundaryRegister: {
          BoundaryOnlyRuntimeDomain: {
            read: () => 'mock-domain',
          },
        },
      });
    }

    await expect(
      (
        setupCraftServiceTestingByRegister.boundaryOnly as unknown as (
          target: unknown,
          config: unknown,
        ) => Promise<unknown>
      )(BoundaryOnlyRuntimeHost, {
        boundaryRegister: {
          BoundaryOnlyRuntimeDomain: {
            read: () => 'mock-domain',
          },
        },
      }),
    ).rejects.toThrow(
      'boundaryOnly boundaryRegister entry "BoundaryOnlyRuntimeDomain" is not a craftService configured with browserBoundary: true.',
    );
  });
});

// moved to @craft-ng/angular
describe.skip('setupCraftComponentTestingByRegister', () => {
  it('should require appStart decisions and run them before detectChanges', async () => {
    const order: string[] = [];
    const { ComponentRunStartup } = craftService(
      {
        name: 'ComponentRunStartup',
        scope: 'global',
        appStart: true,
      },
      function* () {
        yield* onAppStart(() => {
          order.push('appStart');
          return undefined;
        });

        return 1;
      },
    );

    @Component({
      standalone: true,
      template: '',
    })
    class ComponentRunStartupHost {
      startup = craftUse(ComponentRunStartup());

      ngDoCheck() {
        order.push('detectChanges');
      }
    }

    type GenDeps_ComponentRunStartupHost = GetDeps<{
      deps: {
        ComponentRunStartup: GetServiceDependencies<typeof ComponentRunStartup>;
      };
      provided: {};
      publicProperties: GetPublicComponentProperties<ComponentRunStartupHost>;
    }>;

    if (false) {
      //@ts-expect-error reachable real appStart services must be declared as run or ignore
      setupCraftComponentTestingByRegister(
        ComponentRunStartupHost,
        {} as GenDeps_ComponentRunStartupHost,
        {
          ComponentRunStartup: 'real',
        },
      );
    }

    await setupCraftComponentTestingByRegister(
      ComponentRunStartupHost,
      {} as GenDeps_ComponentRunStartupHost,
      {
        ComponentRunStartup: 'real',
      },
      {
        appStart: {
          ComponentRunStartup: 'run',
        },
        detectChanges: true,
      },
    );

    expect(order).toEqual(['appStart', 'detectChanges']);
  });

  it('should accept appStart ignore without running the component dependency hook', async () => {
    const calls: string[] = [];
    const { ComponentIgnoredStartup } = craftService(
      {
        name: 'ComponentIgnoredStartup',
        scope: 'global',
        appStart: true,
      },
      function* () {
        yield* onAppStart(() => {
          calls.push('started');
          return undefined;
        });

        return 1;
      },
    );

    @Component({
      standalone: true,
      template: '',
    })
    class ComponentIgnoredStartupHost {
      startup = craftUse(ComponentIgnoredStartup());
    }

    type GenDeps_ComponentIgnoredStartupHost = GetDeps<{
      deps: {
        ComponentIgnoredStartup: GetServiceDependencies<
          typeof ComponentIgnoredStartup
        >;
      };
      provided: {};
      publicProperties: GetPublicComponentProperties<ComponentIgnoredStartupHost>;
    }>;

    await setupCraftComponentTestingByRegister(
      ComponentIgnoredStartupHost,
      {} as GenDeps_ComponentIgnoredStartupHost,
      {
        ComponentIgnoredStartup: 'real',
      },
      {
        appStart: {
          ComponentIgnoredStartup: 'ignore',
        },
      },
    );

    expect(calls).toEqual([]);
  });

  it('should not require appStart when the component dependency is mocked', async () => {
    const calls: string[] = [];
    const { ComponentMockedStartup } = craftService(
      {
        name: 'ComponentMockedStartup',
        scope: 'global',
        appStart: true,
      },
      function* () {
        yield* onAppStart(() => {
          calls.push('started');
          return undefined;
        });

        return {
          read: () => 1,
        };
      },
    );

    @Component({
      standalone: true,
      template: '',
    })
    class ComponentMockedStartupHost {
      startup = craftUse(ComponentMockedStartup());
    }

    type GenDeps_ComponentMockedStartupHost = GetDeps<{
      deps: {
        ComponentMockedStartup: GetServiceDependencies<
          typeof ComponentMockedStartup
        >;
      };
      provided: {};
      publicProperties: GetPublicComponentProperties<ComponentMockedStartupHost>;
    }>;

    const { mocks } = await setupCraftComponentTestingByRegister(
      ComponentMockedStartupHost,
      {} as GenDeps_ComponentMockedStartupHost,
      {
        ComponentMockedStartup: {
          read: () => 41,
        },
      },
    );

    expect(mocks.ComponentMockedStartup.read()).toBe(41);
    expect(calls).toEqual([]);
  });

  it('should allow a minimal mock for a component dependency used through a nested inject shortcut', async () => {
    const mockLoading = signal(true);

    const { NestedShortcutQueryApi } = craftService(
      { name: 'NestedShortcutQueryApi', scope: 'global' },
      () => ({
        userQuery: {
          isLoading: signal(false),
          data: signal<string | null>(null),
        },
      }),
    );

    @Component({
      standalone: true,
      template: '',
    })
    class NestedShortcutQueryComponent {
      readonly isLoading = craftUse(
        NestedShortcutQueryApi.userQuery.isLoading(),
      );
    }

    type GenDeps_NestedShortcutQueryComponent = GetDeps<{
      deps: {
        NestedShortcutQueryApi: GetServiceDependencies<
          typeof NestedShortcutQueryApi.userQuery.isLoading
        >;
      };
      provided: {};
      publicProperties: GetPublicComponentProperties<NestedShortcutQueryComponent>;
    }>;

    const { fixture } = await setupCraftComponentTestingByRegister(
      NestedShortcutQueryComponent,
      {} as GenDeps_NestedShortcutQueryComponent,
      {
        NestedShortcutQueryApi: {
          userQuery: { isLoading: mockLoading },
        },
      },
    );

    expect(fixture.componentInstance.isLoading).toBe(mockLoading);
    expect(fixture.componentInstance.isLoading()).toBe(true);
  });

  it('should not require appStart when the component dependency is notReached', async () => {
    const calls: string[] = [];
    const { ComponentNotReachedStartup } = craftService(
      {
        name: 'ComponentNotReachedStartup',
        scope: 'global',
        appStart: true,
      },
      function* () {
        yield* onAppStart(() => {
          calls.push('started');
          return undefined;
        });

        return 1;
      },
    );

    const { ComponentNotReachedParent } = craftService(
      { name: 'ComponentNotReachedParent', scope: 'global' },
      function* () {
        const startup = yield* ComponentNotReachedStartup();

        return {
          read: () => startup,
        };
      },
    );

    @Component({
      standalone: true,
      template: '',
    })
    class ComponentNotReachedStartupHost {
      parent = craftUse(ComponentNotReachedParent());
    }

    type GenDeps_ComponentNotReachedStartupHost = GetDeps<{
      deps: {
        ComponentNotReachedParent: GetServiceDependencies<
          typeof ComponentNotReachedParent
        >;
      };
      provided: {};
      publicProperties: GetPublicComponentProperties<ComponentNotReachedStartupHost>;
    }>;

    await setupCraftComponentTestingByRegister(
      ComponentNotReachedStartupHost,
      {} as GenDeps_ComponentNotReachedStartupHost,
      {
        ComponentNotReachedParent: {
          read: () => 41,
        },
        ComponentNotReachedStartup: 'notReached',
      },
    );

    expect(calls).toEqual([]);
  });
});

// moved to @craft-ng/angular
describe.skip('setupCraftComponentTestingByRegister.boundaryOnly', () => {
  it('should allow component tests to mock only reachable browser boundaries', async () => {
    const { ComponentBoundaryOnlyStorage } = craftService(
      {
        name: 'ComponentBoundaryOnlyStorage',
        scope: 'global',
        browserBoundary: true,
      },
      () => ({
        read: (): string => 'real-storage',
      }),
    );

    const { ComponentBoundaryOnlyDomain } = craftService(
      { name: 'ComponentBoundaryOnlyDomain', scope: 'global' },
      function* () {
        const storage = yield* ComponentBoundaryOnlyStorage();

        return {
          read: () => `component:${storage.read()}`,
        };
      },
    );

    @Component({
      standalone: true,
      template: '{{ domain.read() }}',
    })
    class ComponentBoundaryOnlyHost {
      domain = craftUse(ComponentBoundaryOnlyDomain());
    }

    type GenDeps_ComponentBoundaryOnlyHost = GetDeps<{
      deps: {
        ComponentBoundaryOnlyDomain: GetServiceDependencies<
          typeof ComponentBoundaryOnlyDomain
        >;
      };
      provided: {};
      publicProperties: GetPublicComponentProperties<ComponentBoundaryOnlyHost>;
    }>;

    if (false) {
      setupCraftComponentTestingByRegister.boundaryOnly(
        ComponentBoundaryOnlyHost,
        {} as GenDeps_ComponentBoundaryOnlyHost,
        {
          //@ts-expect-error non-boundary component dependencies cannot be boundary mocks
          boundaryRegister: {
            ComponentBoundaryOnlyDomain: {
              read: () => 'mock-domain',
            },
          },
        },
      );
    }

    const { nativeElement, mocks } =
      await setupCraftComponentTestingByRegister.boundaryOnly(
        ComponentBoundaryOnlyHost,
        {} as GenDeps_ComponentBoundaryOnlyHost,
        {
          boundaryRegister: {
            ComponentBoundaryOnlyStorage: {
              read: () => 'mock-storage',
            },
          },
        },
      );

    expect(nativeElement.textContent?.trim()).toBe('component:mock-storage');
    expect(mocks.ComponentBoundaryOnlyStorage.read()).toBe('mock-storage');
  });

  it('should require providers for component dependencies that stay real', async () => {
    const { ComponentBoundaryOnlyConfig, provideComponentBoundaryOnlyConfig } =
      craftService(
        { name: 'ComponentBoundaryOnlyConfig', scope: 'toProvide' },
        () => ({
          read: (): string => 'provided-config',
        }),
      );

    @Component({
      standalone: true,
      template: '{{ domain.read() }}',
    })
    class ComponentBoundaryOnlyConfigHost {
      domain = craftUse(ComponentBoundaryOnlyConfig());
    }

    type GenDeps_ComponentBoundaryOnlyConfigHost = GetDeps<{
      deps: {
        ComponentBoundaryOnlyConfig: GetServiceDependencies<
          typeof ComponentBoundaryOnlyConfig
        >;
      };
      provided: {};
      publicProperties: GetPublicComponentProperties<ComponentBoundaryOnlyConfigHost>;
    }>;

    if (false) {
      setupCraftComponentTestingByRegister.boundaryOnly(
        ComponentBoundaryOnlyConfigHost,
        {} as GenDeps_ComponentBoundaryOnlyConfigHost,
        //@ts-expect-error provider-scoped component dependencies must be listed in toProvideRegister
        {},
      );
    }

    const { nativeElement } =
      await setupCraftComponentTestingByRegister.boundaryOnly(
        ComponentBoundaryOnlyConfigHost,
        {} as GenDeps_ComponentBoundaryOnlyConfigHost,
        {
          toProvideRegister: {
            ComponentBoundaryOnlyConfig: provideComponentBoundaryOnlyConfig(),
          },
        },
      );

    expect(nativeElement.textContent?.trim()).toBe('provided-config');
    expect(ComponentBoundaryOnlyConfig).toBeDefined();
  });

  it('should run component appStart hooks before detectChanges', async () => {
    const order: string[] = [];
    const { ComponentBoundaryOnlyStartup } = craftService(
      {
        name: 'ComponentBoundaryOnlyStartup',
        scope: 'global',
        appStart: true,
      },
      function* () {
        yield* onAppStart(() => {
          order.push('appStart');
          return undefined;
        });

        return {
          read: () => 'started',
        };
      },
    );

    @Component({
      standalone: true,
      template: '{{ startup.read() }}',
    })
    class ComponentBoundaryOnlyStartupHost {
      startup = craftUse(ComponentBoundaryOnlyStartup());

      ngDoCheck() {
        order.push('detectChanges');
      }
    }

    type GenDeps_ComponentBoundaryOnlyStartupHost = GetDeps<{
      deps: {
        ComponentBoundaryOnlyStartup: GetServiceDependencies<
          typeof ComponentBoundaryOnlyStartup
        >;
      };
      provided: {};
      publicProperties: GetPublicComponentProperties<ComponentBoundaryOnlyStartupHost>;
    }>;

    if (false) {
      setupCraftComponentTestingByRegister.boundaryOnly(
        ComponentBoundaryOnlyStartupHost,
        {} as GenDeps_ComponentBoundaryOnlyStartupHost,
        //@ts-expect-error reachable real appStart component dependencies must be declared
        {},
      );
    }

    const { nativeElement } =
      await setupCraftComponentTestingByRegister.boundaryOnly(
        ComponentBoundaryOnlyStartupHost,
        {} as GenDeps_ComponentBoundaryOnlyStartupHost,
        {
          appStart: {
            ComponentBoundaryOnlyStartup: 'run',
          },
          detectChanges: true,
        },
      );

    expect(nativeElement.textContent?.trim()).toBe('started');
    expect(order).toEqual(['appStart', 'detectChanges']);
  });
});

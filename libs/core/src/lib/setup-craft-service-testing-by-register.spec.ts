import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { beforeAll, describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  craftService,
  onAppStart,
  type GetInjectedServiceDependencies,
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
  it('should return the real sut, keep only explicit mocks and allow notReached descendants', async () => {
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

    const { sut, mocks } = await setupCraftServiceTestingByRegister(
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

  it('should use the real implementation for a global dependency marked as real', async () => {
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

    const { sut, mocks } = await setupCraftServiceTestingByRegister(
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

  it('should allow mocking a global dependency with a raw object', async () => {
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

    const { sut, mocks } = await setupCraftServiceTestingByRegister(
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

  it('should allow a minimal mock when a dependency is only used through derivations', async () => {
    const { CounterToYield } = craftService(
      { name: 'Counter', scope: 'global' },
      () =>
        state(0, ({ update }) => ({
          increment: () => update((value) => value + 1),
          decrement: () => update((value) => value - 1),
        })),
    );

    const { injectCounterFeature, provideCounterFeature } = craftService(
      { name: 'CounterFeature', scope: 'toProvide' },
      function* () {
        return yield* CounterToYield(undefined, ({ $self, increment }) => ({
          $self,
          incrementCounter: increment,
        }));
      },
    );

    const rootCallable = vi.fn(() => 41);
    const increment = vi.fn();

    const { sut, mocks } = await setupCraftServiceTestingByRegister(
      injectCounterFeature,
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

  it('should keep a full-service mock public shape without exposing $self', async () => {
    const { CounterToYield } = craftService(
      { name: 'Counter', scope: 'global' },
      () =>
        state(0, ({ update }) => ({
          increment: () => update((value) => value + 1),
          decrement: () => update((value) => value - 1),
        })),
    );

    const { injectCounterConsumer, provideCounterConsumer } = craftService(
      { name: 'CounterConsumer', scope: 'toProvide' },
      function* () {
        const counter = yield* CounterToYield();
        const { incrementCounter } = yield* CounterToYield(
          undefined,
          ({ increment }) => ({
            incrementCounter: increment,
          }),
        );

        return {
          read: () => counter(),
          increment: () => incrementCounter(),
          decrement: () => counter.decrement(),
        };
      },
    );

    const rootCallable = vi.fn(() => 41);
    const increment = vi.fn();
    const decrement = vi.fn();

    const { sut, mocks } = await setupCraftServiceTestingByRegister(
      injectCounterConsumer,
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

    const { sut } = await setupCraftServiceTestingByRegister(
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

  it('should keep a shared descendant reachable through a real sibling branch when another branch is mocked', async () => {
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

    const { sut, mocks } = await setupCraftServiceTestingByRegister(
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

  it('should allow pruning a deep sub-branch while keeping the same descendant real through another path', async () => {
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

    const { sut, mocks } = await setupCraftServiceTestingByRegister(
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

  it('should allow notReached once an entire branch is fully pruned', async () => {
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

    const { sut, mocks } = await setupCraftServiceTestingByRegister(
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

  it('should require an explicit appStart decision for reachable real services', async () => {
    const calls: string[] = [];
    const { AppStartRequiredToYield } = craftService(
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

    const { injectAppStartRequiredHost, provideAppStartRequiredHost } =
      craftService(
        { name: 'AppStartRequiredHost', scope: 'toProvide' },
        function* () {
          const startup = yield* AppStartRequiredToYield();

          return {
            read: () => startup,
          };
        },
      );

    if (false) {
      //@ts-expect-error reachable real appStart services must be declared as run or ignore
      setupCraftServiceTestingByRegister(injectAppStartRequiredHost, {
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
      )(injectAppStartRequiredHost, {
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
    const { AsyncRegisterStartupToYield } = craftService(
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

    const { injectAsyncRegisterHost, provideAsyncRegisterHost } = craftService(
      { name: 'AsyncRegisterHost', scope: 'toProvide' },
      function* () {
        return yield* AsyncRegisterStartupToYield();
      },
    );

    await setupCraftServiceTestingByRegister(
      injectAsyncRegisterHost,
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
    const { IgnoredRegisterStartupToYield } = craftService(
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

    const { injectIgnoredRegisterHost, provideIgnoredRegisterHost } =
      craftService(
        { name: 'IgnoredRegisterHost', scope: 'toProvide' },
        function* () {
          return yield* IgnoredRegisterStartupToYield();
        },
      );

    await setupCraftServiceTestingByRegister(
      injectIgnoredRegisterHost,
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
    const { MockedRegisterStartupToYield } = craftService(
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

    const { injectMockedRegisterHost, provideMockedRegisterHost } =
      craftService(
        { name: 'MockedRegisterHost', scope: 'toProvide' },
        function* () {
          const startup = yield* MockedRegisterStartupToYield();

          return {
            read: startup.read,
          };
        },
      );

    const { sut } = await setupCraftServiceTestingByRegister(
      injectMockedRegisterHost,
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
    const { NotReachedRegisterStartupToYield } = craftService(
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

    const { NotReachedRegisterParentToYield } = craftService(
      { name: 'NotReachedRegisterParent', scope: 'global' },
      function* () {
        const startup = yield* NotReachedRegisterStartupToYield();

        return {
          read: () => startup,
        };
      },
    );

    const { injectNotReachedRegisterHost, provideNotReachedRegisterHost } =
      craftService(
        { name: 'NotReachedRegisterHost', scope: 'toProvide' },
        function* () {
          return yield* NotReachedRegisterParentToYield();
        },
      );

    await setupCraftServiceTestingByRegister(injectNotReachedRegisterHost, {
      NotReachedRegisterHost: provideNotReachedRegisterHost(),
      NotReachedRegisterParent: {
        read: () => 41,
      },
      NotReachedRegisterStartup: 'notReached',
    });

    expect(calls).toEqual([]);
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
      const _mockedRoot = setupCraftServiceTestingByRegister(
        injectRootCounter,
        {
          RootCounter: {
            //@ts-expect-error the root cannot be mocked
            incrementRoot: vi.fn(),
          },
          ParentCounter: {
            incrementParent: vi.fn(),
          },
          ChildCounter: 'notReached',
        },
      );

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

      const _sharedChild = setupCraftServiceTestingByRegister(
        injectRootCounter,
        //@ts-expect-error a reachable shared child cannot be marked as notReached
        {
          RootCounter: provideRootCounter(),
          ParentCounter: {
            incrementParent: vi.fn(),
          },
          ChildCounter: 'notReached',
        },
      );

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

describe('setupCraftComponentTestingByRegister', () => {
  it('should require appStart decisions and run them before detectChanges', async () => {
    const order: string[] = [];
    const { injectComponentRunStartup } = craftService(
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
      startup = injectComponentRunStartup();

      ngDoCheck() {
        order.push('detectChanges');
      }
    }

    type GenDeps_ComponentRunStartupHost = GetDeps<{
      deps: {
        ComponentRunStartup: GetInjectedServiceDependencies<
          typeof injectComponentRunStartup
        >;
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
    const { injectComponentIgnoredStartup } = craftService(
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
      startup = injectComponentIgnoredStartup();
    }

    type GenDeps_ComponentIgnoredStartupHost = GetDeps<{
      deps: {
        ComponentIgnoredStartup: GetInjectedServiceDependencies<
          typeof injectComponentIgnoredStartup
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
    const { injectComponentMockedStartup } = craftService(
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
      startup = injectComponentMockedStartup();
    }

    type GenDeps_ComponentMockedStartupHost = GetDeps<{
      deps: {
        ComponentMockedStartup: GetInjectedServiceDependencies<
          typeof injectComponentMockedStartup
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

  it('should not require appStart when the component dependency is notReached', async () => {
    const calls: string[] = [];
    const { ComponentNotReachedStartupToYield } = craftService(
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

    const { injectComponentNotReachedParent } = craftService(
      { name: 'ComponentNotReachedParent', scope: 'global' },
      function* () {
        const startup = yield* ComponentNotReachedStartupToYield();

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
      parent = injectComponentNotReachedParent();
    }

    type GenDeps_ComponentNotReachedStartupHost = GetDeps<{
      deps: {
        ComponentNotReachedParent: GetInjectedServiceDependencies<
          typeof injectComponentNotReachedParent
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

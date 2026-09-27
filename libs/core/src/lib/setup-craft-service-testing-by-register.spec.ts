import {
  signal,
} from './host/craft-compat';
import { craftUse } from './craft-use';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  craftService,
  onAppStart,
  type GetServiceDependencies,
} from './craft-service';
import { setupCraftServiceTestingByRegister } from './setup-craft-service-testing-by-register';
import { state } from './state';
import { craftExpose } from './craft-primitive-gen';

describe('setupCraftServiceTestingByRegister', () => {
  it('should return the real sut, keep only explicit mocks and allow notReached descendants', async () => {
    const { ChildCounter } = craftService(
      { name: 'ChildCounter', providedIn: 'toProvide' },
      function* () {
        const childCounter = yield* state('childCounter', 0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
      },
    );

    const { ParentCounter } = craftService(
      { name: 'ParentCounter', providedIn: 'toProvide' },
      function* () {
        const child = (yield* ChildCounter()).childCounter;

        yield* craftExpose('incrementParent', () => child.increment());
      },
    );

    const { RootCounter, provideRootCounter } = craftService(
      { name: 'RootCounter', providedIn: 'toProvide' },
      function* () {
        const parent = yield* ParentCounter();

        yield* craftExpose('incrementRoot', () => parent.incrementParent());
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
      { name: 'Counter', providedIn: 'global' },
      function* () {
        const counter = yield* state('counter', 10, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
      },
    );

    const { CounterConsumer, provideCounterConsumer } = craftService(
      { name: 'CounterConsumer', providedIn: 'toProvide' },
      function* () {
        const counter = (yield* Counter()).counter;

        yield* craftExpose('read', () => craftUse(counter()));
        yield* craftExpose('increment', () => counter.increment());
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
      { name: 'Counter', providedIn: 'global' },
      function* () {
        const counter = yield* state('counter', 10, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
      },
    );

    const { CounterConsumer, provideCounterConsumer } = craftService(
      { name: 'CounterConsumer', providedIn: 'toProvide' },
      function* () {
        const counter = (yield* Counter()).counter;

        yield* craftExpose('read', () => craftUse(counter()));
        yield* craftExpose('increment', () => counter.increment());
      },
    );

    const rootCallable = vi.fn(() => 41);
    const increment = vi.fn();

    const { sut, mocks } = await setupCraftServiceTestingByRegister(
      CounterConsumer,
      {
        CounterConsumer: provideCounterConsumer(),
        Counter: {
          counter: Object.assign(rootCallable, { increment }) as never,
        },
      },
    );

    expect(sut.read()).toBe(41);
    sut.increment();
    expect(rootCallable).toHaveBeenCalled();
    expect(increment).toHaveBeenCalledTimes(1);
    expect(mocks.Counter.counter).toBe(rootCallable);
  });

  it('should allow a minimal mock when a dependency is only used through derivations', async () => {
    const { Counter } = craftService(
      { name: 'Counter', providedIn: 'global' },
      function* () {
        const counter = yield* state('counter', 0, ({ update }) => ({
          increment: () => update((value) => value + 1),
          decrement: () => update((value) => value - 1),
        }));
        yield* craftExpose('increment', counter.increment);
        yield* craftExpose('decrement', counter.decrement);
      },
    );

    const { CounterFeature, provideCounterFeature } = craftService(
      { name: 'CounterFeature', providedIn: 'toProvide' },
      function* () {
        yield* craftExpose(
          'selected',
          yield* Counter(undefined, ({ counter, increment }) => ({
            counter,
            incrementCounter: increment,
          })),
        );
      },
    );

    const rootCallable = vi.fn(() => 41);
    const increment = vi.fn();

    const { sut, mocks } = await setupCraftServiceTestingByRegister(
      CounterFeature,
      {
        CounterFeature: provideCounterFeature(),
        Counter: {
          counter: rootCallable as never,
          increment,
        },
      },
    );

    expect(sut.selected.counter()).toBe(41);
    sut.selected.incrementCounter();
    expect(mocks.Counter.increment).toHaveBeenCalledTimes(1);

    if (false) {
      //@ts-expect-error minimal derived mocks should not expose unused full-service members
      expect(mocks.Counter.decrement).toBeDefined();
    }
  });

  it('should allow a minimal mock when a dependency is only used through a nested property shortcut', async () => {
    const { QueryApi } = craftService(
      { name: 'QueryApi', providedIn: 'global' },
      function* () {
        yield* craftExpose('userQuery', {
          isLoading: signal(false),
          data: signal<string | null>(null),
        });
      },
    );

    const { QueryConsumer, provideQueryConsumer } = craftService(
      { name: 'QueryConsumer', providedIn: 'toProvide' },
      function* () {
        const isLoading = yield* QueryApi.userQuery.isLoading();
        yield* craftExpose('isLoading', isLoading);
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
      { name: 'QueryApiMulti', providedIn: 'global' },
      function* () {
        yield* craftExpose('userQuery', {
          isLoading: signal(false),
          data: signal<string | null>(null),
        });
      },
    );

    const { QueryMultiConsumer, provideQueryMultiConsumer } = craftService(
      { name: 'QueryMultiConsumer', providedIn: 'toProvide' },
      function* () {
        const isLoading = yield* QueryApiMulti.userQuery.isLoading();
        const data = yield* QueryApiMulti.userQuery.data();
        yield* craftExpose('isLoading', isLoading);
        yield* craftExpose('data', data);
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

  it('should keep a full-service mock public shape', async () => {
    const { Counter } = craftService(
      { name: 'Counter', providedIn: 'global' },
      function* () {
        const counter = yield* state('counter', 0, ({ update }) => ({
          increment: () => update((value) => value + 1),
          decrement: () => update((value) => value - 1),
        }));
        yield* craftExpose('increment', counter.increment);
        yield* craftExpose('decrement', counter.decrement);
      },
    );

    const { CounterConsumer, provideCounterConsumer } = craftService(
      { name: 'CounterConsumer', providedIn: 'toProvide' },
      function* () {
        const { counter, decrement } = yield* Counter();
        const { incrementCounter } = yield* Counter(
          undefined,
          ({ increment }) => ({
            incrementCounter: increment,
          }),
        );

        yield* craftExpose('read', () => craftUse(counter()));
        yield* craftExpose('increment', () => incrementCounter());
        yield* craftExpose('decrement', () => decrement());
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
          counter: rootCallable as never,
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
  });

  it('should require a provider for manuallyProvidedAtRoot dependencies', async () => {
    const { Counter, provideCounter } = craftService(
      { name: 'Counter', providedIn: 'manuallyProvidedAtRoot' },
      function* () {
        const counter = yield* state('counter', 7, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
      },
    );

    const { CounterConsumer, provideCounterConsumer } = craftService(
      { name: 'CounterConsumer', providedIn: 'toProvide' },
      function* () {
        const counter = (yield* Counter()).counter;

        yield* craftExpose('read', () => craftUse(counter()));
        yield* craftExpose('increment', () => counter.increment());
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
      { name: 'SharedCounter', providedIn: 'toProvide' },
      function* () {
        const sharedCounter = yield* state(
          'sharedCounter',
          0,
          ({ update }) => ({
            increment: () => update((value) => value + 1),
          }),
        );
      },
    );

    const { LeftCounter } = craftService(
      { name: 'LeftCounter', providedIn: 'toProvide' },
      function* () {
        const shared = (yield* SharedCounter()).sharedCounter;

        yield* craftExpose('incrementLeft', () => shared.increment());
      },
    );

    const { RightCounter, provideRightCounter } = craftService(
      { name: 'RightCounter', providedIn: 'toProvide' },
      function* () {
        const shared = (yield* SharedCounter()).sharedCounter;

        yield* craftExpose('incrementRight', () => shared.increment());
        yield* craftExpose('readSharedFromRight', () => craftUse(shared()));
      },
    );

    const { RootCounter, provideRootCounter } = craftService(
      { name: 'RootCounter', providedIn: 'toProvide' },
      function* () {
        const left = yield* LeftCounter();
        const right = yield* RightCounter();

        yield* craftExpose('incrementRoot', () => {
          left.incrementLeft();
          right.incrementRight();
        });
        yield* craftExpose('readShared', () => right.readSharedFromRight());
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
      { name: 'ChildCounter', providedIn: 'toProvide' },
      function* () {
        const childCounter = yield* state('childCounter', 0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
      },
    );

    const { MidCounter } = craftService(
      { name: 'MidCounter', providedIn: 'toProvide' },
      function* () {
        const child = (yield* ChildCounter()).childCounter;

        yield* craftExpose('incrementMid', () => child.increment());
      },
    );

    const { ParentCounter } = craftService(
      { name: 'ParentCounter', providedIn: 'toProvide' },
      function* () {
        const mid = yield* MidCounter();

        yield* craftExpose('incrementParent', () => mid.incrementMid());
      },
    );

    const { RootCounter, provideRootCounter } = craftService(
      { name: 'RootCounter', providedIn: 'toProvide' },
      function* () {
        const parent = yield* ParentCounter();
        const child = (yield* ChildCounter()).childCounter;

        yield* craftExpose('incrementRoot', () => {
          parent.incrementParent();
          child.increment();
        });
        yield* craftExpose('readChild', () => craftUse(child()));
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
      { name: 'SharedCounter', providedIn: 'toProvide' },
      function* () {
        const sharedCounter = yield* state(
          'sharedCounter',
          0,
          ({ update }) => ({
            increment: () => update((value) => value + 1),
          }),
        );
      },
    );

    const { LeftCounter } = craftService(
      { name: 'LeftCounter', providedIn: 'toProvide' },
      function* () {
        const shared = (yield* SharedCounter()).sharedCounter;

        yield* craftExpose('incrementLeft', () => shared.increment());
      },
    );

    const { RightCounter, provideRightCounter } = craftService(
      { name: 'RightCounter', providedIn: 'toProvide' },
      function* () {
        const rightCounter = yield* state('rightCounter', 0, ({ update }) => ({
          incrementRight: () => update((value) => value + 1),
        }));
      },
    );

    const { RootCounter, provideRootCounter } = craftService(
      { name: 'RootCounter', providedIn: 'toProvide' },
      function* () {
        const left = yield* LeftCounter();
        const right = (yield* RightCounter()).rightCounter;

        yield* craftExpose('incrementRoot', () => {
          left.incrementLeft();
          right.incrementRight();
        });
        yield* craftExpose('readRight', () => craftUse(right()));
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
        providedIn: 'global',
        appStart: true,
      },
      function* () {
        yield* onAppStart(() => {
          calls.push('started');
          return undefined;
        });

      },
    );

    const { AppStartRequiredHost, provideAppStartRequiredHost } = craftService(
      { name: 'AppStartRequiredHost', providedIn: 'toProvide' },
      function* () {
        const startup = yield* AppStartRequired();

        yield* craftExpose('read', () => startup);
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
        providedIn: 'global',
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

      },
    );

    const { AsyncRegisterHost, provideAsyncRegisterHost } = craftService(
      { name: 'AsyncRegisterHost', providedIn: 'toProvide' },
      function* () {
        yield* craftExpose('asyncRegisterStartup', yield* AsyncRegisterStartup());
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
        providedIn: 'global',
        appStart: true,
      },
      function* () {
        yield* onAppStart(() => {
          calls.push('started');
          return undefined;
        });

      },
    );

    const { IgnoredRegisterHost, provideIgnoredRegisterHost } = craftService(
      { name: 'IgnoredRegisterHost', providedIn: 'toProvide' },
      function* () {
        yield* craftExpose('ignoredRegisterStartup', yield* IgnoredRegisterStartup());
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
        providedIn: 'global',
        appStart: true,
      },
      function* () {
        yield* onAppStart(() => {
          calls.push('started');
          return undefined;
        });

        yield* craftExpose('read', () => 1 as number);
      },
    );

    const { MockedRegisterHost, provideMockedRegisterHost } = craftService(
      { name: 'MockedRegisterHost', providedIn: 'toProvide' },
      function* () {
        const startup = yield* MockedRegisterStartup();

        yield* craftExpose('read', startup.read);
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
        providedIn: 'global',
        appStart: true,
      },
      function* () {
        yield* onAppStart(() => {
          calls.push('started');
          return undefined;
        });

      },
    );

    const { NotReachedRegisterParent } = craftService(
      { name: 'NotReachedRegisterParent', providedIn: 'global' },
      function* () {
        const startup = yield* NotReachedRegisterStartup();

        yield* craftExpose('read', () => startup);
      },
    );

    const { NotReachedRegisterHost, provideNotReachedRegisterHost } =
      craftService(
        { name: 'NotReachedRegisterHost', providedIn: 'toProvide' },
        function* () {
          yield* craftExpose('notReachedRegisterParent', yield* NotReachedRegisterParent());
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
      { name: 'ChildCounter', providedIn: 'toProvide' },
      function* () {
        const childCounter = yield* state('childCounter', 0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
      },
    );

    const { ParentCounter } = craftService(
      { name: 'ParentCounter', providedIn: 'toProvide' },
      function* () {
        const child = (yield* ChildCounter()).childCounter;

        yield* craftExpose('incrementParent', () => child.increment());
      },
    );

    const { RootCounter, provideRootCounter } = craftService(
      { name: 'RootCounter', providedIn: 'toProvide' },
      function* () {
        const parent = yield* ParentCounter();
        const child = (yield* ChildCounter()).childCounter;

        yield* craftExpose('incrementRoot', () => {
          parent.incrementParent();
          child.increment();
        });
      },
    );

    const { Counter, provideCounter } = craftService(
      { name: 'Counter', providedIn: 'manuallyProvidedAtRoot' },
      function* () {
        const counter = yield* state('counter', 0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
      },
    );

    const { CounterConsumer, provideCounterConsumer } = craftService(
      { name: 'CounterConsumer', providedIn: 'toProvide' },
      function* () {
        const counter = (yield* Counter()).counter;

        yield* craftExpose('read', () => craftUse(counter()));
        yield* craftExpose('increment', () => counter.increment());
      },
    );

    const { Router } = craftService(
      { name: 'Router', providedIn: 'global' },
      function* () {
        yield* craftExpose('url', '/real');
      },
    );

    const { Navigation, provideNavigation } = craftService(
      { name: 'Navigation', providedIn: 'toProvide' },
      function* () {
        const router = yield* Router();

        yield* craftExpose('readUrl', () => router.url);
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
        providedIn: 'global',
        browserBoundary: true,
      },
      function* () {
        yield* craftExpose('read', (): string => 'real-storage');
      },
    );

    const { BoundaryOnlyDomain } = craftService(
      { name: 'BoundaryOnlyDomain', providedIn: 'global' },
      function* () {
        const storage = yield* BoundaryOnlyStorage();

        yield* craftExpose('read', () => `domain:${storage.read()}`);
      },
    );

    const { BoundaryOnlyRoot, provideBoundaryOnlyRoot } = craftService(
      { name: 'BoundaryOnlyRoot', providedIn: 'toProvide' },
      function* () {
        const domain = yield* BoundaryOnlyDomain();

        yield* craftExpose('read', domain.read);
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
        providedIn: 'global',
        browserBoundary: true,
      },
      function* () {
        yield* craftExpose('read', (): string => 'real-storage');
      },
    );

    const { BoundaryOnlyRealHost } = craftService(
      { name: 'BoundaryOnlyRealHost', providedIn: 'global' },
      function* () {
        const storage = yield* BoundaryOnlyRealStorage();

        yield* craftExpose('read', storage.read);
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
      { name: 'BoundaryOnlyConfig', providedIn: 'toProvide' },
      function* () {
        yield* craftExpose('read', (): string => 'provided-config');
      },
    );

    const { BoundaryOnlyConfigHost, provideBoundaryOnlyConfigHost } =
      craftService(
        { name: 'BoundaryOnlyConfigHost', providedIn: 'toProvide' },
        function* () {
          const config = yield* BoundaryOnlyConfig();

          yield* craftExpose('read', config.read);
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
        providedIn: 'global',
        browserBoundary: true,
      },
      function* () {
        yield* craftExpose('read', (): string => 'real-boundary');
      },
    );

    const { BoundaryOnlyRequiredHost } = craftService(
      { name: 'BoundaryOnlyRequiredHost', providedIn: 'global' },
      function* () {
        const boundary = yield* BoundaryOnlyRequiredBoundary();

        yield* craftExpose('read', boundary.read);
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
        providedIn: 'global',
        browserBoundary: true,
      },
      function* () {
        yield* craftExpose('read', (): string => 'child');
      },
    );

    const { BoundaryOnlyParentBoundary } = craftService(
      {
        name: 'BoundaryOnlyParentBoundary',
        providedIn: 'global',
        browserBoundary: true,
      },
      function* () {
        const child = yield* BoundaryOnlyChildBoundary();

        yield* craftExpose('read', () => `parent:${child.read()}`);
      },
    );

    const { BoundaryOnlyParentHost } = craftService(
      { name: 'BoundaryOnlyParentHost', providedIn: 'global' },
      function* () {
        const parent = yield* BoundaryOnlyParentBoundary();

        yield* craftExpose('read', parent.read);
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
        providedIn: 'global',
        appStart: true,
      },
      function* () {
        yield* onAppStart(() => {
          calls.push('started');
          return undefined;
        });

        yield* craftExpose('read', () => 1);
      },
    );

    const { BoundaryOnlyStartupHost } = craftService(
      { name: 'BoundaryOnlyStartupHost', providedIn: 'global' },
      function* () {
        const startup = yield* BoundaryOnlyStartup();

        yield* craftExpose('read', startup.read);
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
      { name: 'BoundaryOnlyRuntimeDomain', providedIn: 'global' },
      function* () {
        yield* craftExpose('read', (): string => 'real-domain');
      },
    );

    const { BoundaryOnlyRuntimeHost } = craftService(
      { name: 'BoundaryOnlyRuntimeHost', providedIn: 'global' },
      function* () {
        const domain = yield* BoundaryOnlyRuntimeDomain();

        yield* craftExpose('read', domain.read);
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

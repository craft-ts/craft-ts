import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { provideRouter, Router } from '@angular/router';
import { setupCraftServiceTest, mock } from './setup-craft-service-test';
import {
  craftDependency,
  craftService,
  GetInjectedServiceDependencies,
  GetServiceTrackingMetadata,
} from './craft-service';
import { state } from './state';

@Component({
  standalone: true,
  template: '',
})
class CheckoutPage {}

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

describe('setupCraftServiceTest', () => {
  it('should keep metadata as a secondary setupCraftServiceTest entry', () => {
    const {
      injectCounter: Counter,
      CounterToYield,
      COUNTER_META_DATA,
    } = craftService({ name: 'Counter', scope: 'toProvide' }, () =>
      state(0, ({ update }) => ({
        increment: () => update((value) => value + 1),
      })),
    );

    const { COUNTER_EXTENDED_META_DATA } = craftService(
      { name: 'CounterExtended', scope: 'toProvide' },
      function* () {
        const counter = yield* CounterToYield();

        return {
          read: () => counter(),
        };
      },
    );

    const rootCallable = vi.fn(() => 14);

    const { sut, mocks } = setupCraftServiceTest(COUNTER_EXTENDED_META_DATA, {
      Counter: mock({
        $self: rootCallable,
        increment: vi.fn(),
      }),
    });

    expect(COUNTER_META_DATA.inject).toBe(Counter);
    expect(sut.read()).toBe(14);
    expect(mocks.Counter()).toBe(14);
  });

  it('should fail at typing time when a required child craftService is not covered', () => {
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
      //@ts-expect-error Counter should be covered because it is a toProvide dependency
      setupCraftServiceTest(CounterExtended, {});
    }
  });

  it('should enable a mocked ancestor to prune a branch of required descendants', () => {
    const { ChildCounterToYield } = craftService(
      { name: 'ChildCounter', scope: 'toProvide' },
      () =>
        state(0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    const { injectParentCounter: ParentCounter, ParentCounterToYield } =
      craftService({ name: 'ParentCounter', scope: 'toProvide' }, function* () {
        const counter = yield* ChildCounterToYield();

        return {
          increment: counter.increment,
        };
      });

    const { injectRootCounter: RootCounter } = craftService(
      { name: 'RootCounter', scope: 'toProvide' },
      function* () {
        return yield* ParentCounterToYield();
      },
    );

    const testRef = setupCraftServiceTest(RootCounter, {
      ParentCounter: mock({
        increment: vi.fn(),
      }),
    });

    expect(ParentCounter).toBeDefined();
    expect(testRef.mocks.ParentCounter.increment).toBeTypeOf('function');
  });

  it('should still require descendants when a craftService is covered with its real raw provider', () => {
    const { CounterToYield } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () =>
        state(0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    const {
      injectParentCounter: ParentCounter,
      ParentCounterToYield,
      provideParentCounter,
    } = craftService(
      { name: 'ParentCounter', scope: 'toProvide' },
      function* () {
        const counter = yield* CounterToYield();

        return {
          increment: counter.increment,
        };
      },
    );

    const { injectRootCounter: RootCounter } = craftService(
      { name: 'RootCounter', scope: 'toProvide' },
      function* () {
        return yield* ParentCounterToYield();
      },
    );

    // eslint-disable-next-line no-constant-condition
    if (false) {
      //@ts-expect-error Counter should remain required because ParentCounter is provided and does not prune its children
      setupCraftServiceTest(RootCounter, {
        ParentCounter: provideParentCounter(),
      });
    }

    expect(ParentCounter).toBeDefined();
  });

  it('should not require overriding a global dependency', () => {
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

    const { sut } = setupCraftServiceTest(CounterConsumer, {});

    expect(sut.read()).toBe(10);
    sut.increment();
    expect(sut.read()).toBe(11);
  });

  it('should allow mocking a global dependency with an implicit mock override', () => {
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

    const rootCallable = vi.fn(() => 41);
    const increment = vi.fn();

    const { sut, mocks } = setupCraftServiceTest(CounterConsumer, {
      Counter: mock({
        $self: rootCallable,
        increment,
      }),
    });

    expect(sut.read()).toBe(41);
    sut.increment();
    expect(mocks.Counter()).toBe(41);
    expect(mocks.Counter.increment).toHaveBeenCalledTimes(1);
    expect('$self' in mocks.Counter).toBe(false);
    //@ts-expect-error $self should never be part of the public mock
    expect(mocks.Counter.$self).toBeUndefined();
  });

  it('should allow mocking a global dependency with the explicit inject helper fallback', () => {
    const { injectCounter: Counter, CounterToYield } = craftService(
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

    const rootCallable = vi.fn(() => 41);
    const increment = vi.fn();

    const { sut, mocks } = setupCraftServiceTest(CounterConsumer, {
      Counter: mock(Counter, {
        $self: rootCallable,
        increment,
      }),
    });

    expect(sut.read()).toBe(41);
    sut.increment();
    expect(mocks.Counter()).toBe(41);
    expect(mocks.Counter.increment).toHaveBeenCalledTimes(1);
    expect('$self' in mocks.Counter).toBe(false);
    //@ts-expect-error $self should never be part of the public mock
    expect(mocks.Counter.$self).toBeUndefined();
  });

  it('should type derived mocks with only the used properties and keep extras optional', () => {
    const { injectCounter: Counter, CounterToYield } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      (inputs: { $provided: { initialValue: number } }) =>
        state(inputs.$provided.initialValue, ({ update }) => ({
          increment: () => update((value) => value + 1),
          decrement: () => update((value) => value - 1),
        })),
    );

    const { injectCounterExtended: CounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'toProvide' },
      function* () {
        return yield* CounterToYield(undefined, ({ $self, increment }) => ({
          $self,
          incrementCounter: increment,
        }));
      },
    );

    if (false) {
      //@ts-expect-error $self is required because the derivation uses it
      setupCraftServiceTest(CounterExtended, {
        Counter: mock({
          increment: vi.fn(),
        }),
      });
    }

    const increment = vi.fn();
    const decrement = vi.fn();
    const rootCallable = vi.fn(() => 41);

    const { sut, mocks } = setupCraftServiceTest(CounterExtended, {
      Counter: mock({
        $self: rootCallable,
        increment,
        decrement,
      }),
    });

    expect(Counter).toBeDefined();
    expectTypeOf(mocks.Counter.increment).toEqualTypeOf(increment);
    expectTypeOf(mocks.Counter()).toEqualTypeOf<number>();
    expect(sut()).toBe(41);
    sut.incrementCounter();
    expect(mocks.Counter.increment).toHaveBeenCalledTimes(1);
    expect(mocks.Counter.decrement).toHaveBeenCalledTimes(0);
    expect('$self' in mocks.Counter).toBe(false);
  });

  it('should keep explicit mock fallback with inject helper', () => {
    const { injectCounter: Counter, CounterToYield } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () =>
        state(0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    const { injectCounterExtended: CounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'toProvide' },
      function* () {
        const counter = yield* CounterToYield();

        return {
          read: () => counter(),
          incrementThroughCounter: () => counter.increment(),
        };
      },
    );

    const increment = vi.fn();
    const rootCallable = vi.fn(() => 41);

    const { sut, mocks } = setupCraftServiceTest(CounterExtended, {
      Counter: mock(Counter, {
        $self: rootCallable,
        increment,
      }),
    });

    expect(sut.read()).toBe(41);
    sut.incrementThroughCounter();
    expect(mocks.Counter()).toBe(41);
    expect(mocks.Counter.increment).toHaveBeenCalledTimes(1);
  });

  it('should support a real raw provider override for manuallyProvidedAtRoot dependencies', () => {
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

    const { sut } = setupCraftServiceTest(GlobalCounter, {
      Counter: provideCounter(),
    });

    expect(sut.read()).toBe(10);
    sut.increment();
    expect(sut.read()).toBe(11);
  });

  it('should support a real raw provider override for a toProvide dependency that needs $provided', () => {
    const { CounterToYield, provideCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      (inputs: { $provided: { initialValue: number } }) =>
        state(inputs.$provided.initialValue, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    const { injectCounterExtended: CounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'toProvide' },
      function* () {
        const counter = yield* CounterToYield();

        return {
          read: () => counter(),
          increment: () => counter.increment(),
        };
      },
    );

    const { sut } = setupCraftServiceTest(CounterExtended, {
      Counter: provideCounter({ initialValue: 10 }),
    });

    expect(sut.read()).toBe(10);
    sut.increment();
    expect(sut.read()).toBe(11);
  });

  it('should require an explicit provider in options.providers when the SUT itself needs $provided', () => {
    const { injectCounter: Counter, provideCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      (inputs: { $provided: { initialValue: number } }) =>
        state(inputs.$provided.initialValue, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    expect(() => setupCraftServiceTest(Counter, {})).toThrow(
      'setupCraftServiceTest requires an explicit provider for "Counter" because it uses $provided.',
    );

    const { sut } = setupCraftServiceTest(
      Counter,
      {},
      {
        providers: [provideCounter({ initialValue: 5 })],
      },
    );

    expect(sut()).toBe(5);
  });

  it('should allow a global adapted Router without override when provideRouter is supplied', () => {
    const { RouterToYield } = craftDependency({
      name: 'Router',
      scope: 'global',
      token: Router,
    });

    const { injectNavigation: Navigation } = craftService(
      { name: 'Navigation', scope: 'toProvide' },
      function* () {
        const router = yield* RouterToYield();

        return {
          readUrl: () => router.url,
        };
      },
    );

    const { sut } = setupCraftServiceTest(
      Navigation,
      {},
      {
        providers: [provideRouter([])],
      },
    );

    expect(typeof sut.readUrl()).toBe('string');
  });

  it('should allow mocking a global adapted Router', async () => {
    const { RouterToYield } = craftDependency({
      name: 'Router',
      scope: 'global',
      token: Router,
    });

    const { injectNavigation: Navigation } = craftService(
      { name: 'Navigation', scope: 'toProvide' },
      function* () {
        const router = yield* RouterToYield(undefined, ({ navigateByUrl }) => ({
          navigateByUrl,
        }));

        return {
          goToCheckout: () => router.navigateByUrl('/checkout'),
        };
      },
    );

    const navigateByUrl = vi.fn(() => Promise.resolve(true));
    const { sut, mocks } = setupCraftServiceTest(Navigation, {
      Router: mock({
        navigateByUrl,
      }),
    });

    await sut.goToCheckout();

    expect(mocks.Router.navigateByUrl).toHaveBeenCalledWith('/checkout');
  });

  it('should require explicit coverage for a manuallyProvidedAtRoot adapted Router', async () => {
    const { provideRouter: provideRouterDependency, RouterToYield } =
      craftDependency({
        name: 'Router',
        scope: 'manuallyProvidedAtRoot',
        token: Router,
        provide: () =>
          provideRouter([{ path: 'checkout', component: CheckoutPage }]),
      });

    const { injectNavigation: Navigation } = craftService(
      { name: 'Navigation', scope: 'global' },
      function* () {
        const router = yield* RouterToYield();

        return {
          readUrl: () => router.url,
        };
      },
    );

    // eslint-disable-next-line no-constant-condition
    if (false) {
      //@ts-expect-error Router should be explicitly covered because it is manuallyProvidedAtRoot
      setupCraftServiceTest(Navigation, {}, { providers: [provideRouter([])] });
    }

    const { sut } = setupCraftServiceTest(Navigation, {
      Router: provideRouterDependency(),
    });

    expect(typeof sut.readUrl()).toBe('string');

    const { injectRouteNavigation: RouteNavigation } = craftService(
      { name: 'RouteNavigation', scope: 'global' },
      function* () {
        const router = yield* RouterToYield();

        return {
          goToCheckout: () => router.navigateByUrl('/checkout'),
          readUrl: () => router.url,
        };
      },
    );

    const routeNavigationTest = setupCraftServiceTest(RouteNavigation, {
      Router: provideRouterDependency(),
    });

    await routeNavigationTest.sut.goToCheckout();

    expect(routeNavigationTest.sut.readUrl()).toBe('/checkout');
  });

  it('should help with autocompletion the mocking of a global service dependency', async () => {
    const { injectService1, Service1ToYield } = craftService(
      { name: 'Service1', scope: 'global' },
      () => {
        return state(0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
      },
    );

    const { injectService2, Service2ToYield } = craftService(
      { name: 'Service2', scope: 'global' },
      () => {
        return state(0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
      },
    );

    const { injectServiceHost } = craftService(
      { name: 'ServiceHost', scope: 'global' },
      function* () {
        const _service1 = yield* Service1ToYield();
        const _service2 = yield* Service2ToYield();

        return state(0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
      },
    );

    setupCraftServiceTest(injectServiceHost, {}); // todo I do not have any autcompletion/help to isolate my current global service
    setupCraftServiceTest(injectServiceHost, { Service1: mock({}) }); // todo mock does not help to build the mock of my current global service
  });
});

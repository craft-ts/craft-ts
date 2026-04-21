import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { provideRouter, Router } from '@angular/router';
import { craftDependency, craftService } from './craft-service';
import { state } from './state';
import { setupTest } from './setup-test';

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

describe('setupTest', () => {
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
      setupTest(CounterExtended, () => ({}));
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

    const testRef = setupTest(
      RootCounter,
      ({ ParentCounter: ParentCounterDep, _nestedDeps: { ChildCounter } }) => ({
        ParentCounter: ParentCounterDep.mock({
          increment: vi.fn(),
        }),
      }),
    );

    expect(ParentCounter).toBeDefined();
    expect(ChildCounterToYield).toBeDefined();
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
      setupTest(RootCounter, () => ({
        ParentCounter: provideParentCounter(),
      }));
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

    const { sut } = setupTest(CounterConsumer, () => ({}));

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

    const { sut, mocks } = setupTest(CounterConsumer, ({ Counter }) => ({
      Counter: Counter.mock({
        $self: rootCallable,
        increment,
      }),
    }));

    expect(sut.read()).toBe(41);
    sut.increment();
    expect(mocks.Counter()).toBe(41);
    expect(mocks.Counter.increment).toHaveBeenCalledTimes(1);
    expect('$self' in mocks.Counter).toBe(false);
    //@ts-expect-error $self should never be part of the public mock
    expect(mocks.Counter.$self).toBeUndefined();
  });

  it('should expose direct dependency helpers through the callback API', () => {
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

    const { sut, mocks } = setupTest(CounterConsumer, ({ Counter }) => ({
      Counter: Counter.mock({
        $self: rootCallable,
        increment,
      }),
    }));

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
      setupTest(CounterExtended, ({ Counter }) => ({
        //@ts-expect-error $self is required because the derivation uses it
        Counter: Counter.mock({
          increment: vi.fn(),
        }),
      }));
    }

    const increment = vi.fn();
    const decrement = vi.fn();
    const rootCallable = vi.fn(() => 41);

    const { sut, mocks } = setupTest(
      CounterExtended,
      ({ Counter: CounterDep }) => ({
        Counter: CounterDep.mock({
          $self: rootCallable,
          increment,
          decrement,
        }),
      }),
    );

    expect(Counter).toBeDefined();
    expectTypeOf(mocks.Counter.increment).toEqualTypeOf(increment);
    expectTypeOf(mocks.Counter()).toEqualTypeOf<number>();
    expect(sut()).toBe(41);
    sut.incrementCounter();
    expect(mocks.Counter.increment).toHaveBeenCalledTimes(1);
    expect(mocks.Counter.decrement).toHaveBeenCalledTimes(0);
    expect('$self' in mocks.Counter).toBe(false);
  });

  it('should expose nested dependencies through _nestedDeps for typed mocking', () => {
    const { CounterToYield } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      (inputs: { $provided: { initialValue: number } }) =>
        state(inputs.$provided.initialValue, ({ update }) => ({
          increment: () => update((value) => value + 1),
          decrement: () => update((value) => value - 1),
        })),
    );

    const { CounterExtendedToYield } = craftService(
      { name: 'CounterExtended', scope: 'toProvide' },
      function* () {
        return yield* CounterToYield(undefined, ({ $self, increment }) => ({
          $self,
          incrementCounter: increment,
        }));
      },
    );

    const increment = vi.fn();
    const decrement = vi.fn();
    const rootCallable = vi.fn(() => 41);

    const { injectRootCounter: RootCounter } = craftService(
      { name: 'RootCounter', scope: 'toProvide' },
      function* () {
        return yield* CounterExtendedToYield();
      },
    );

    const { sut, mocks } = setupTest(
      RootCounter,
      ({ CounterExtended, _nestedDeps: { Counter } }) => ({
        CounterExtended: CounterExtended.mock({
          incrementCounter: vi.fn(),
          $self: vi.fn(() => 99),
        }),
        Counter: Counter.mock({
          $self: rootCallable,
          increment,
          decrement,
        }),
      }),
    );

    expectTypeOf(mocks.Counter.increment).toEqualTypeOf(increment);
    expectTypeOf(mocks.Counter()).toEqualTypeOf<number>();
    expectTypeOf(mocks.CounterExtended.incrementCounter).toBeFunction();
    expect(sut()).toBe(99);
    sut.incrementCounter();
    expect(mocks.CounterExtended.incrementCounter).toHaveBeenCalledTimes(1);
    expect(mocks.Counter.increment).toHaveBeenCalledTimes(0);
    expect(mocks.Counter.decrement).toHaveBeenCalledTimes(0);
  });

  it('should keep nested dependency coverage pruned when an ancestor is mocked', () => {
    const { injectCounter: Counter, CounterToYield } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () =>
        state(0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    const { injectCounterExtended: CounterExtended, CounterExtendedToYield } =
      craftService(
        { name: 'CounterExtended', scope: 'toProvide' },
        function* () {
          const counter = yield* CounterToYield();

          return {
            read: () => counter(),
            incrementThroughCounter: () => counter.increment(),
          };
        },
      );

    const { injectCounterHost: CounterHost } = craftService(
      { name: 'CounterHost', scope: 'toProvide' },
      function* () {
        return yield* CounterExtendedToYield();
      },
    );

    const incrementThroughCounter = vi.fn();
    const rootCallable = vi.fn(() => 41);

    const { sut, mocks } = setupTest(
      CounterHost,
      ({ CounterExtended, _nestedDeps: { Counter } }) => ({
        CounterExtended: CounterExtended.mock({
          read: rootCallable,
          incrementThroughCounter,
        }),
      }),
    );

    expect(sut.read()).toBe(41);
    sut.incrementThroughCounter();
    expect(mocks.CounterExtended.read).toBe(rootCallable);
    expect(mocks.CounterExtended.incrementThroughCounter).toHaveBeenCalledTimes(
      1,
    );
    expect(Counter).toBeDefined();
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

    const { sut } = setupTest(GlobalCounter, () => ({
      Counter: provideCounter(),
    }));

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

    const { sut } = setupTest(CounterExtended, () => ({
      Counter: provideCounter({ initialValue: 10 }),
    }));

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

    expect(() => setupTest(Counter, () => ({}))).toThrow(
      'setupTest requires an explicit provider for "Counter" because it uses $provided.',
    );

    const { sut } = setupTest(Counter, () => ({}), {
      providers: [provideCounter({ initialValue: 5 })],
    });

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

    const { sut } = setupTest(Navigation, () => ({}), {
      providers: [provideRouter([])],
    });

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
    const { sut, mocks } = setupTest(Navigation, ({ Router }) => ({
      Router: Router.mock({
        navigateByUrl,
      }),
    }));

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
      setupTest(Navigation, () => ({}), { providers: [provideRouter([])] });
    }

    const { sut } = setupTest(Navigation, () => ({
      Router: provideRouterDependency(),
    }));

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

    const routeNavigationTest = setupTest(RouteNavigation, () => ({
      Router: provideRouterDependency(),
    }));

    await routeNavigationTest.sut.goToCheckout();

    expect(routeNavigationTest.sut.readUrl()).toBe('/checkout');
  });

  it('should allow typed helper mocks for a global service dependency', () => {
    const { Service1ToYield } = craftService(
      { name: 'Service1', scope: 'global' },
      () =>
        state(0, ({ update }) => ({
          increment: () => update((value) => value + 1),
          decrement: () => update((value) => value - 1),
        })),
    );

    const { injectServiceHost } = craftService(
      { name: 'ServiceHost', scope: 'global' },
      function* () {
        const service1 = yield* Service1ToYield();

        return {
          incrementThroughService1: () => service1.increment(),
        };
      },
    );

    const increment = vi.fn();

    const { sut, mocks } = setupTest(injectServiceHost, ({ _nestedDeps: {} }) => ({

    }));

    expectTypeOf(mocks.Service1.increment).toEqualTypeOf(increment);
    sut.incrementThroughService1();
    expect(mocks.Service1.increment).toHaveBeenCalledTimes(1);
  });

  it('should reject unknown object shorthand override keys at typing time', () => {
    const { Service1ToYield } = craftService(
      { name: 'Service1', scope: 'global' },
      () =>
        state(0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    const { injectServiceHost } = craftService(
      { name: 'ServiceHost', scope: 'global' },
      function* () {
        const service1 = yield* Service1ToYield();

        return {
          incrementThroughService1: () => service1.increment(),
        };
      },
    );

    if (false) {
      //@ts-expect-error UnknownService is not part of ServiceHost dependencies
      setupTest(injectServiceHost, () => ({
        UnknownService: {},
      }));
    }
  });
});

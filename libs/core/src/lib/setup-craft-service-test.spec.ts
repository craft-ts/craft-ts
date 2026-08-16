import { Component, inject, Injectable, InjectionToken } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { type GetDeps, type GetPublicComponentProperties } from '../index';
import { craftService, ɵtoCraftService as toCraftService } from './craft-service';
import { mock, setupCraftServiceTest } from './setup-craft-service-test';
import { state } from './state';
import { craftUse } from './craft-use';

@Component({
  standalone: true,
  template: '',
})
class CheckoutPage {}

describe('setupCraftServiceTest', () => {
  it('should keep metadata as a secondary setupCraftServiceTest entry', () => {
    const { Counter: Counter, COUNTER_META_DATA } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      function* () {
        const counter = yield* state('counter', 0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
        return counter;
      },
    );

    const { COUNTER_EXTENDED_META_DATA } = craftService(
      { name: 'CounterExtended', scope: 'toProvide' },
      function* () {
        const counter = yield* Counter();

        return {
          read: () => craftUse(counter()),
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

    expect(COUNTER_META_DATA.inject).toBeTypeOf('function');
    expect(sut.read()).toBe(14);
    expect(mocks.Counter()).toBe(14);
  });

  it('should fail at typing time when a required child craftService is not covered', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      function* () {
        const counter = yield* state('counter', 0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
        return counter;
      },
    );

    const { CounterExtended: CounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'toProvide' },
      function* () {
        return yield* Counter();
      },
    );

    if (false) {
      //@ts-expect-error Counter should be covered because it is a toProvide dependency
      setupCraftServiceTest(CounterExtended, {});
    }
  });

  it('should enable a mocked ancestor to prune a branch of required descendants', () => {
    const { ChildCounter } = craftService(
      { name: 'ChildCounter', scope: 'toProvide' },
      function* () {
        const childCounter = yield* state('childCounter', 0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
        return childCounter;
      },
    );

    const { ParentCounter: ParentCounter } = craftService(
      { name: 'ParentCounter', scope: 'toProvide' },
      function* () {
        const counter = yield* ChildCounter();

        return {
          increment: counter.increment,
        };
      },
    );

    const { RootCounter: RootCounter } = craftService(
      { name: 'RootCounter', scope: 'toProvide' },
      function* () {
        return yield* ParentCounter();
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
    const { Counter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      function* () {
        const counter = yield* state('counter', 0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
        return counter;
      },
    );

    const { ParentCounter: ParentCounter, provideParentCounter } = craftService(
      { name: 'ParentCounter', scope: 'toProvide' },
      function* () {
        const counter = yield* Counter();

        return {
          increment: counter.increment,
        };
      },
    );

    const { RootCounter: RootCounter } = craftService(
      { name: 'RootCounter', scope: 'toProvide' },
      function* () {
        return yield* ParentCounter();
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
    const { Counter } = craftService(
      { name: 'Counter', scope: 'global' },
      function* () {
        const counter = yield* state('counter', 10, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
        return counter;
      },
    );

    const { CounterConsumer: CounterConsumer } = craftService(
      { name: 'CounterConsumer', scope: 'toProvide' },
      function* () {
        const counter = yield* Counter();

        return {
          read: () => craftUse(counter()),
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
    const { Counter } = craftService(
      { name: 'Counter', scope: 'global' },
      function* () {
        const counter = yield* state('counter', 10, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
        return counter;
      },
    );

    const { CounterConsumer: CounterConsumer } = craftService(
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
    const { Counter: Counter } = craftService(
      { name: 'Counter', scope: 'global' },
      function* () {
        const counter = yield* state('counter', 10, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
        return counter;
      },
    );

    const { CounterConsumer: CounterConsumer } = craftService(
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
    const { Counter: Counter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      function* (inputs: { $provided: { initialValue: number } }) {
        const counter = yield* state(
          'counter',
          inputs.$provided.initialValue,
          ({ update }) => ({
            increment: () => update((value) => value + 1),
            decrement: () => update((value) => value - 1),
          }),
        );
        return counter;
      },
    );

    const { CounterExtended: CounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'toProvide' },
      function* () {
        return yield* Counter(undefined, ({ $self, increment }) => ({
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
    const { Counter: Counter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      function* () {
        const counter = yield* state('counter', 0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
        return counter;
      },
    );

    const { CounterExtended: CounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'toProvide' },
      function* () {
        const counter = yield* Counter();

        return {
          read: () => craftUse(counter()),
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
    const { Counter, provideCounter } = craftService(
      { name: 'Counter', scope: 'manuallyProvidedAtRoot' },
      function* () {
        const counter = yield* state('counter', 10, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
        return counter;
      },
    );

    const { GlobalCounter: GlobalCounter } = craftService(
      { name: 'GlobalCounter', scope: 'global' },
      function* () {
        const counter = yield* Counter();

        return {
          read: () => craftUse(counter()),
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
    const { Counter, provideCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      function* (inputs: { $provided: { initialValue: number } }) {
        const counter = yield* state(
          'counter',
          inputs.$provided.initialValue,
          ({ update }) => ({
            increment: () => update((value) => value + 1),
          }),
        );
        return counter;
      },
    );

    const { CounterExtended: CounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'toProvide' },
      function* () {
        const counter = yield* Counter();

        return {
          read: () => craftUse(counter()),
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
    const { Counter: Counter, provideCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      function* (inputs: { $provided: { initialValue: number } }) {
        const counter = yield* state(
          'counter',
          inputs.$provided.initialValue,
          ({ update }) => ({
            increment: () => update((value) => value + 1),
          }),
        );
        return counter;
      },
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

    expect(craftUse(sut())).toBe(5);
  });

  it('should require an explicit provider when a raw external dependency only uses provider inputs', () => {
    const API_BASE_URL = new InjectionToken<string>('ApiBaseUrl');

    @Injectable()
    class CatalogDriver {
      readonly baseUrl = inject(API_BASE_URL);

      fetchProducts() {
        return `${this.baseUrl}/products`;
      }
    }

    const { Catalog: Catalog, provideCatalog } = toCraftService({
      name: 'Catalog',
      scope: 'toProvide',
      token: CatalogDriver,
      provide: (provided: { apiBaseUrl: string }) => [
        {
          provide: API_BASE_URL,
          useValue: provided.apiBaseUrl,
        },
        {
          provide: CatalogDriver,
          useClass: CatalogDriver,
        },
      ],
    });

    expect(() => setupCraftServiceTest(Catalog, {})).toThrow(
      'setupCraftServiceTest requires an explicit provider for "Catalog" because it uses $provided.',
    );

    const { sut } = setupCraftServiceTest(
      Catalog,
      {},
      {
        providers: [provideCatalog({ apiBaseUrl: '/api' })],
      },
    );

    expect(sut.fetchProducts()).toBe('/api/products');
  });

  // moved to @craft-ng/angular
  it.skip('should allow a global adapted Router without override when provideRouter is supplied', () => {
    const { Router: RouterService } = toCraftService({
      name: 'Router',
      scope: 'global',
      token: Router,
    });

    const { Navigation: Navigation } = craftService(
      { name: 'Navigation', scope: 'toProvide' },
      function* () {
        const router = yield* RouterService();

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
    const { Router: RouterService } = toCraftService({
      name: 'Router',
      scope: 'global',
      token: Router,
    });

    const { Navigation: Navigation } = craftService(
      { name: 'Navigation', scope: 'toProvide' },
      function* () {
        const router = yield* RouterService(undefined, ({ navigateByUrl }) => ({
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

  // moved to @craft-ng/angular
  it.skip('should require explicit coverage for a manuallyProvidedAtRoot adapted Router', async () => {
    const { provideRouter: provideRouterDependency, Router: RouterService } =
      toCraftService({
        name: 'Router',
        scope: 'manuallyProvidedAtRoot',
        token: Router,
        provide: () =>
          provideRouter([{ path: 'checkout', component: CheckoutPage }]),
      });

    const { Navigation: Navigation } = craftService(
      { name: 'Navigation', scope: 'global' },
      function* () {
        const router = yield* RouterService();

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

    const { RouteNavigation: RouteNavigation } = craftService(
      { name: 'RouteNavigation', scope: 'global' },
      function* () {
        const router = yield* RouterService();

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
    const { Service1 } = craftService(
      { name: 'Service1', scope: 'global' },
      () => {
        return craftUse(
          state('service1', 0, ({ update }) => ({
            increment: () => update((value) => value + 1),
          })),
        );
      },
    );

    const { Service2 } = craftService(
      { name: 'Service2', scope: 'global' },
      () => {
        return craftUse(
          state('service2', 0, ({ update }) => ({
            increment: () => update((value) => value + 1),
          })),
        );
      },
    );

    const { ServiceHost } = craftService(
      { name: 'ServiceHost', scope: 'global' },
      function* () {
        const _service1 = yield* Service1();
        const _service2 = yield* Service2();

        return yield* state('serviceHost', 0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
      },
    );

    setupCraftServiceTest(ServiceHost, {}); // todo I do not have any autcompletion/help to isolate my current global service
    setupCraftServiceTest(ServiceHost, { Service1: mock({}) }); // todo mock does not help to build the mock of my current global service
  });
});

export type GenDeps_CheckoutPage = GetDeps<{
  deps: {};
  provided: {};
  publicProperties: GetPublicComponentProperties<CheckoutPage>;
}>;

import { provideCraftRouter as provideRouter } from './craft-router';

/**
 * A stand-in DI token. These specs never drove a real router — they only
 * needed some external service to adapt through `toCraftService`.
 */
class Router {
  readonly url: string = '/';
  navigateByUrl(_url: string): Promise<boolean> {
    return Promise.resolve(true);
  }
}
import {
  inject,
  InjectionToken,
} from './host/craft-compat';
import { type GetDeps, type GetPublicComponentProperties } from '../index';
import { craftService, ɵtoCraftService as toCraftService } from './craft-service';
import { mock, setupCraftServiceTest } from './setup-craft-service-test';
import { state } from './state';
import { craftUse } from './craft-use';
import { craftExpose } from './craft-primitive-gen';

class CheckoutPage {}

describe('setupCraftServiceTest', () => {
  it('should keep metadata as a secondary setupCraftServiceTest entry', () => {
    const { Counter: Counter, COUNTER_META_DATA } = craftService(
      { name: 'Counter', providedIn: 'toProvide' },
      function* () {
        yield* state('counter', 0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
      },
    );

    const { COUNTER_EXTENDED_META_DATA } = craftService(
      { name: 'CounterExtended', providedIn: 'toProvide' },
      function* () {
        const counter = (yield* Counter()).counter;

        yield* craftExpose('read', () => craftUse(counter()));
      },
    );

    const rootCallable = vi.fn(() => 14);

    const { sut, mocks } = setupCraftServiceTest(COUNTER_EXTENDED_META_DATA, {
      Counter: mock({
        counter: Object.assign(rootCallable, { increment: vi.fn() }),
      }),
    });

    expect(COUNTER_META_DATA.inject).toBeTypeOf('function');
    expect(sut.read()).toBe(14);
    expect(mocks.Counter.counter()).toBe(14);
  });

  it('should fail at typing time when a required child craftService is not covered', () => {
    const { Counter } = craftService(
      { name: 'Counter', providedIn: 'toProvide' },
      function* () {
        yield* state('counter', 0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
      },
    );

    const { CounterExtended: CounterExtended } = craftService(
      { name: 'CounterExtended', providedIn: 'toProvide' },
      function* () {
        yield* craftExpose('counter', (yield* Counter()).counter);
      },
    );

    if (false) {
      //@ts-expect-error Counter should be covered because it is a toProvide dependency
      setupCraftServiceTest(CounterExtended, {});
    }
  });

  it('should enable a mocked ancestor to prune a branch of required descendants', () => {
    const { ChildCounter } = craftService(
      { name: 'ChildCounter', providedIn: 'toProvide' },
      function* () {
        yield* state('childCounter', 0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
      },
    );

    const { ParentCounter: ParentCounter } = craftService(
      { name: 'ParentCounter', providedIn: 'toProvide' },
      function* () {
        const counter = (yield* ChildCounter()).childCounter;

        yield* craftExpose('increment', counter.increment);
      },
    );

    const { RootCounter: RootCounter } = craftService(
      { name: 'RootCounter', providedIn: 'toProvide' },
      function* () {
        yield* craftExpose('parentCounter', yield* ParentCounter());
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
      { name: 'Counter', providedIn: 'toProvide' },
      function* () {
        yield* state('counter', 0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
      },
    );

    const { ParentCounter: ParentCounter, provideParentCounter } = craftService(
      { name: 'ParentCounter', providedIn: 'toProvide' },
      function* () {
        const counter = (yield* Counter()).counter;

        yield* craftExpose('increment', counter.increment);
      },
    );

    const { RootCounter: RootCounter } = craftService(
      { name: 'RootCounter', providedIn: 'toProvide' },
      function* () {
        yield* craftExpose('parentCounter', yield* ParentCounter());
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
      { name: 'Counter', providedIn: 'global' },
      function* () {
        yield* state('counter', 10, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
      },
    );

    const { CounterConsumer: CounterConsumer } = craftService(
      { name: 'CounterConsumer', providedIn: 'toProvide' },
      function* () {
        const counter = (yield* Counter()).counter;

        yield* craftExpose('read', () => craftUse(counter()));
        yield* craftExpose('increment', () => counter.increment());
      },
    );

    const { sut } = setupCraftServiceTest(CounterConsumer, {});

    expect(sut.read()).toBe(10);
    sut.increment();
    expect(sut.read()).toBe(11);
  });

  it('should allow mocking a global dependency with an implicit mock override', () => {
    const { Counter } = craftService(
      { name: 'Counter', providedIn: 'global' },
      function* () {
        yield* state('counter', 10, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
      },
    );

    const { CounterConsumer: CounterConsumer } = craftService(
      { name: 'CounterConsumer', providedIn: 'toProvide' },
      function* () {
        const counter = (yield* Counter()).counter;

        yield* craftExpose('read', () => craftUse(counter()));
        yield* craftExpose('increment', () => counter.increment());
      },
    );

    const rootCallable = vi.fn(() => 41);
    const increment = vi.fn();

    const { sut, mocks } = setupCraftServiceTest(CounterConsumer, {
      Counter: mock({
        counter: Object.assign(rootCallable, { increment }),
      }),
    });

    expect(sut.read()).toBe(41);
    sut.increment();
    expect(mocks.Counter.counter()).toBe(41);
    expect(mocks.Counter.counter.increment).toHaveBeenCalledTimes(1);
  });

  it('should allow mocking a global dependency with the explicit inject helper fallback', () => {
    const { Counter: Counter } = craftService(
      { name: 'Counter', providedIn: 'global' },
      function* () {
        yield* state('counter', 10, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
      },
    );

    const { CounterConsumer: CounterConsumer } = craftService(
      { name: 'CounterConsumer', providedIn: 'toProvide' },
      function* () {
        const counter = (yield* Counter()).counter;

        yield* craftExpose('read', () => craftUse(counter()));
        yield* craftExpose('increment', () => counter.increment());
      },
    );

    const rootCallable = vi.fn(() => 41);
    const increment = vi.fn();

    const { sut, mocks } = setupCraftServiceTest(CounterConsumer, {
      Counter: mock({
        counter: Object.assign(rootCallable, { increment }),
      }),
    });

    expect(sut.read()).toBe(41);
    sut.increment();
    expect(mocks.Counter.counter()).toBe(41);
    expect(mocks.Counter.counter.increment).toHaveBeenCalledTimes(1);
  });

  it('should type derived mocks with only the used properties and keep extras optional', () => {
    const { Counter: Counter } = craftService(
      { name: 'Counter', providedIn: 'toProvide' },
      function* (inputs: { $provided: { initialValue: number } }) {
        const counter = yield* state(
          'counter',
          inputs.$provided.initialValue,
          ({ update }) => ({
            increment: () => update((value) => value + 1),
            decrement: () => update((value) => value - 1),
          }),
        );
        yield* craftExpose('increment', counter.increment);
        yield* craftExpose('decrement', counter.decrement);
      },
    );

    const { CounterExtended: CounterExtended } = craftService(
      { name: 'CounterExtended', providedIn: 'toProvide' },
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

    if (false) {
      //@ts-expect-error counter is required because the derivation uses it
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
        // A mocked root stands in for the whole state the derivation reads.
        counter: rootCallable as never,
        increment,
        decrement,
      }),
    });

    expect(Counter).toBeDefined();
    expectTypeOf(mocks.Counter.increment).toEqualTypeOf(increment);
    expect(sut.selected.counter()).toBe(41);
    sut.selected.incrementCounter();
    expect(mocks.Counter.increment).toHaveBeenCalledTimes(1);
    expect(mocks.Counter.decrement).toHaveBeenCalledTimes(0);
  });

  it('should keep explicit mock fallback with inject helper', () => {
    const { Counter: Counter } = craftService(
      { name: 'Counter', providedIn: 'toProvide' },
      function* () {
        yield* state('counter', 0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
      },
    );

    const { CounterExtended: CounterExtended } = craftService(
      { name: 'CounterExtended', providedIn: 'toProvide' },
      function* () {
        const counter = (yield* Counter()).counter;

        yield* craftExpose('read', () => craftUse(counter()));
        yield* craftExpose('incrementThroughCounter', () => counter.increment());
      },
    );

    const increment = vi.fn();
    const rootCallable = vi.fn(() => 41);

    const { sut, mocks } = setupCraftServiceTest(CounterExtended, {
      Counter: mock({
        counter: Object.assign(rootCallable, { increment }),
      }),
    });

    expect(sut.read()).toBe(41);
    sut.incrementThroughCounter();
    expect(mocks.Counter.counter()).toBe(41);
    expect(mocks.Counter.counter.increment).toHaveBeenCalledTimes(1);
  });

  it('should support a real raw provider override for manuallyProvidedAtRoot dependencies', () => {
    const { Counter, provideCounter } = craftService(
      { name: 'Counter', providedIn: 'manuallyProvidedAtRoot' },
      function* () {
        yield* state('counter', 10, ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
      },
    );

    const { GlobalCounter: GlobalCounter } = craftService(
      { name: 'GlobalCounter', providedIn: 'global' },
      function* () {
        const counter = (yield* Counter()).counter;

        yield* craftExpose('read', () => craftUse(counter()));
        yield* craftExpose('increment', () => counter.increment());
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
      { name: 'Counter', providedIn: 'toProvide' },
      function* (inputs: { $provided: { initialValue: number } }) {
        yield* state(
          'counter',
          inputs.$provided.initialValue,
          ({ update }) => ({
            increment: () => update((value) => value + 1),
          }),
        );
      },
    );

    const { CounterExtended: CounterExtended } = craftService(
      { name: 'CounterExtended', providedIn: 'toProvide' },
      function* () {
        const counter = (yield* Counter()).counter;

        yield* craftExpose('read', () => craftUse(counter()));
        yield* craftExpose('increment', () => counter.increment());
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
      { name: 'Counter', providedIn: 'toProvide' },
      function* (inputs: { $provided: { initialValue: number } }) {
        yield* state(
          'counter',
          inputs.$provided.initialValue,
          ({ update }) => ({
            increment: () => update((value) => value + 1),
          }),
        );
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

    expect(craftUse(sut.counter())).toBe(5);
  });

  it('should require an explicit provider when a raw external dependency only uses provider inputs', () => {
    const API_BASE_URL = new InjectionToken<string>('ApiBaseUrl');

        class CatalogDriver {
      readonly baseUrl = inject(API_BASE_URL);

      fetchProducts() {
        return `${this.baseUrl}/products`;
      }
    }

    const { Catalog: Catalog, provideCatalog } = toCraftService({
      name: 'Catalog',
      providedIn: 'toProvide',
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

  it('should allow mocking a global adapted Router', async () => {
    const { Router: RouterService } = toCraftService({
      name: 'Router',
      providedIn: 'global',
      token: Router,
    });

    const { Navigation: Navigation } = craftService(
      { name: 'Navigation', providedIn: 'toProvide' },
      function* () {
        const router = yield* RouterService(undefined, ({ navigateByUrl }) => ({
          navigateByUrl,
        }));

        yield* craftExpose('goToCheckout', () => router.navigateByUrl('/checkout'));
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

  it('should help with autocompletion the mocking of a global service dependency', async () => {
    const { Service1 } = craftService(
      { name: 'Service1', providedIn: 'global' },
      function* () {
        yield* craftExpose('value', craftUse(
          state('service1', 0, ({ update }) => ({
            increment: () => update((value) => value + 1),
          })),
        ));
      },
    );

    const { Service2 } = craftService(
      { name: 'Service2', providedIn: 'global' },
      function* () {
        yield* craftExpose('value', craftUse(
          state('service2', 0, ({ update }) => ({
            increment: () => update((value) => value + 1),
          })),
        ));
      },
    );

    const { ServiceHost } = craftService(
      { name: 'ServiceHost', providedIn: 'global' },
      function* () {
        const _service1 = yield* Service1();
        const _service2 = yield* Service2();

        yield* craftExpose('state', yield* state('serviceHost', 0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })));
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

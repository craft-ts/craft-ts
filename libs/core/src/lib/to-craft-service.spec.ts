import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { Injectable, inject, InjectionToken, signal } from '@angular/core';
import { state } from './state';
import { toCraftService, craftService } from './craft-service';
import type {
  GetInjectedServiceDependencies,
  GetServiceOutput,
} from './craft-service';

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

beforeEach(() => {
  TestBed.resetTestingModule();
});

describe('toCraftService', () => {
  it('should adapt an injectable class in global scope and keep exposed methods bound to the source instance', async () => {
    @Injectable({
      providedIn: 'root',
    })
    class RouterLike {
      readonly currentUrl = signal('/');

      navigateByUrl(url: string) {
        this.currentUrl.set(url);
        return Promise.resolve(true);
      }
    }

    const { RouterLikeToYield } = toCraftService({
      name: 'RouterLike',
      scope: 'global',
      token: RouterLike,
    });

    const { injectNavigation } = craftService(
      { name: 'Navigation', scope: 'global' },
      function* () {
        const routerLike = yield* RouterLikeToYield(
          undefined,
          ({ navigateByUrl }) => ({
            navigateByUrl,
          }),
        );

        return {
          goToCheckout: () => routerLike.navigateByUrl('/checkout'),
        };
      },
    );

    await TestBed.runInInjectionContext(async () => {
      const navigation = injectNavigation();
      const routerLike = inject(RouterLike);

      await navigation.goToCheckout();

      expect(routerLike.currentUrl()).toBe('/checkout');
    });
  });

  it('should support the callback form in global scope', () => {
    const CURRENT_ROUTE = new InjectionToken<{ path: string }>('CurrentRoute');

    TestBed.configureTestingModule({
      providers: [
        {
          provide: CURRENT_ROUTE,
          useValue: {
            path: '/checkout',
          },
        },
      ],
    });

    const { injectCurrentRoute } = toCraftService({
      name: 'CurrentRoute',
      scope: 'global',
      inject: () => inject(CURRENT_ROUTE),
    });

    TestBed.runInInjectionContext(() => {
      expect(injectCurrentRoute().path).toBe('/checkout');
    });
  });

  it('should support $self derivation for callable external dependencies', () => {
    function createCounter() {
      return state(10, ({ update }) => ({
        increment: () => update((value) => value + 1),
      }));
    }

    const COUNTER = new InjectionToken<ReturnType<typeof createCounter>>(
      'Counter',
    );

    TestBed.configureTestingModule({
      providers: [
        {
          provide: COUNTER,
          useFactory: createCounter,
        },
      ],
    });

    const { CounterToYield } = toCraftService({
      name: 'Counter',
      scope: 'global',
      token: COUNTER,
    });

    const { injectCounterFacade } = craftService(
      { name: 'CounterFacade', scope: 'global' },
      function* () {
        return yield* CounterToYield(undefined, ({ $self, increment }) => ({
          $self,
          incrementCounter: increment,
        }));
      },
    );

    TestBed.runInInjectionContext(() => {
      const counterFacade = injectCounterFacade();

      expect(counterFacade()).toBe(10);
      counterFacade.incrementCounter();
      expect(counterFacade()).toBe(11);
      expect('$self' in counterFacade).toBe(false);
      //@ts-expect-error $self should never be exposed publicly
      expect(counterFacade.$self).toBeUndefined();
    });
  });

  it('should expose provideX for toProvide dependencies and compose external providers', () => {
    @Injectable()
    class CounterDriver {
      readonly total = signal(0);

      increment() {
        this.total.update((value) => value + 1);
      }
    }

    const { injectCounterDriver, provideCounterDriver } = toCraftService({
      name: 'CounterDriver',
      scope: 'toProvide',
      token: CounterDriver,
      provide: () => [
        {
          provide: CounterDriver,
          useClass: CounterDriver,
        },
      ],
    });

    TestBed.configureTestingModule({
      providers: [provideCounterDriver()],
    });

    TestBed.runInInjectionContext(() => {
      const counterDriver = injectCounterDriver();

      expect(counterDriver.total()).toBe(0);
      counterDriver.increment();
      expect(counterDriver.total()).toBe(1);
    });
  });

  it('should infer provider inputs for raw toProvide external dependencies without exposing $provided publicly', () => {
    const API_BASE_URL = new InjectionToken<string>('ApiBaseUrl');

    @Injectable()
    class CatalogDriver {
      readonly baseUrl = inject(API_BASE_URL);

      fetchProducts() {
        return `${this.baseUrl}/products`;
      }
    }

    const { injectCatalog, provideCatalog } = toCraftService({
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

    if (false) {
      provideCatalog({ apiBaseUrl: '/api' });

      //@ts-expect-error $provided should not be a public inject binding for raw dependencies
      injectCatalog({
        $provided: { apiBaseUrl: '/override' },
      });
    }

    TestBed.configureTestingModule({
      providers: [provideCatalog({ apiBaseUrl: '/api' })],
    });

    TestBed.runInInjectionContext(() => {
      expect(injectCatalog().fetchProducts()).toBe('/api/products');
    });
  });

  it('should expose $provided to dependency adaptations while keeping it hidden from public bindings', () => {
    const API_BASE_URL = new InjectionToken<string>('ApiBaseUrl');

    @Injectable()
    class CatalogDriver {
      readonly baseUrl = inject(API_BASE_URL);

      fetchProducts() {
        return `${this.baseUrl}/products`;
      }
    }

    const { injectCatalog, CatalogToYield, provideCatalog } = toCraftService(
      {
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
      },
      (
        catalog,
        inputs: { $provided: { apiBaseUrl: string }; prefix: string },
      ) => ({
        fetchPrefixedProducts: () =>
          `${inputs.prefix}:${catalog.fetchProducts()}`,
        readDriverBaseUrl: () => catalog.baseUrl,
        readProvidedBaseUrl: () => inputs.$provided.apiBaseUrl,
      }),
    );

    TestBed.configureTestingModule({
      providers: [provideCatalog({ apiBaseUrl: '/api' })],
    });

    if (false) {
      //@ts-expect-error $provided should not be a public inject binding for toCraftService
      injectCatalog({
        prefix: 'catalog',
        $provided: { apiBaseUrl: '/override' },
      });
    }

    if (false) {
      //@ts-expect-error $provided should not be a public yield binding for toCraftService
      CatalogToYield({
        prefix: 'catalog',
        $provided: { apiBaseUrl: '/override' },
      });
    }

    TestBed.runInInjectionContext(() => {
      const catalog = injectCatalog({ prefix: 'catalog' });

      expect(catalog.readDriverBaseUrl()).toBe('/api');
      expect(catalog.readProvidedBaseUrl()).toBe('/api');
      expect(catalog.fetchPrefixedProducts()).toBe('catalog:/api/products');
    });
  });

  it('should expose XToProvide and provideX for manuallyProvidedAtRoot dependencies', () => {
    @Injectable()
    class CounterDriver {
      readonly total = signal(0);

      increment() {
        this.total.update((value) => value + 1);
      }
    }

    const {
      injectCounterDriver,
      provideCounterDriver,
      CounterDriverToProvide,
    } = toCraftService({
      name: 'CounterDriver',
      scope: 'manuallyProvidedAtRoot',
      token: CounterDriver,
      provide: () => [
        {
          provide: CounterDriver,
          useClass: CounterDriver,
        },
      ],
    });

    TestBed.configureTestingModule({
      providers: [provideCounterDriver()],
    });

    TestBed.runInInjectionContext(() => {
      const counterDriver = injectCounterDriver();
      const providedCounterDriver = inject(CounterDriverToProvide);

      expect(counterDriver).toBe(providedCounterDriver);
      counterDriver.increment();
      expect(providedCounterDriver.total()).toBe(1);
    });
  });

  it('should infer provider inputs for raw manuallyProvidedAtRoot external dependencies', () => {
    const API_BASE_URL = new InjectionToken<string>('ApiBaseUrl');

    @Injectable()
    class CatalogDriver {
      readonly baseUrl = inject(API_BASE_URL);

      fetchProducts() {
        return `${this.baseUrl}/products`;
      }
    }

    const { injectCatalog, provideCatalog, CatalogToProvide } = toCraftService({
      name: 'Catalog',
      scope: 'manuallyProvidedAtRoot',
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

    if (false) {
      provideCatalog({ apiBaseUrl: '/api' });

      //@ts-expect-error $provided should not be a public inject binding for raw dependencies
      injectCatalog({
        $provided: { apiBaseUrl: '/override' },
      });
    }

    TestBed.configureTestingModule({
      providers: [provideCatalog({ apiBaseUrl: '/api' })],
    });

    TestBed.runInInjectionContext(() => {
      const catalog = injectCatalog();
      const providedCatalog = inject(CatalogToProvide);

      expect(catalog).toBe(providedCatalog);
      expect(catalog.fetchProducts()).toBe('/api/products');
    });
  });

  it('should track derived properties like a craftService leaf dependency', () => {
    function createCounter() {
      return state(10, ({ update }) => ({
        increment: () => update((value) => value + 1),
        decrement: () => update((value) => value - 1),
      }));
    }

    const COUNTER = new InjectionToken<ReturnType<typeof createCounter>>(
      'Counter',
    );

    TestBed.configureTestingModule({
      providers: [
        {
          provide: COUNTER,
          useFactory: createCounter,
        },
      ],
    });

    const { CounterToYield } = toCraftService({
      name: 'Counter',
      scope: 'global',
      token: COUNTER,
    });

    const { injectCounterFacade } = craftService(
      { name: 'CounterFacade', scope: 'global' },
      function* () {
        return yield* CounterToYield(
          undefined,
          function* ({ $self, increment, decrement }) {
            yield* decrement();

            return {
              $self,
              incrementCounter: increment,
            };
          },
        );
      },
    );

    type CounterFacadeDependencies = GetInjectedServiceDependencies<
      typeof injectCounterFacade
    >;

    expectTypeOf<CounterFacadeDependencies>().toEqualTypeOf<{
      scope: 'global';
      dependencies: {
        Counter: {
          scope: 'global';
          dependencies: {};
          derivedPropertiesUsed: {
            $self: GetServiceOutput<typeof CounterToYield>;
            increment: GetServiceOutput<typeof CounterToYield>['increment'];
            decrement: GetServiceOutput<typeof CounterToYield>['decrement'];
          };
          derivedPropertiesExposed: {
            $self: GetServiceOutput<typeof CounterToYield>;
            incrementCounter: GetServiceOutput<
              typeof CounterToYield
            >['increment'];
          };
        };
      };
    }>();
  });
});

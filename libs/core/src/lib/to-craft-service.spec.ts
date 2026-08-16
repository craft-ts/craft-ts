import {
  inject,
  InjectionToken,
  signal,
} from './host/craft-compat';
import { TestBed } from './host/craft-test-bed';
import { Component, Injectable } from '@angular/core';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { state } from './state';
import {
  craftService,
  getServiceMetaData,
  ɵtoCraftService as toCraftService,
} from './craft-service';
import type {
  GetServiceDependencies,
  GetServiceOutput,
  GetServiceReferenceMeta,
  GetServiceTrackingMetadata,
} from './craft-service';
import { craftUse } from './craft-use';
import { CraftActivatedRoute } from './craft-activated-route';

@Component({
  standalone: true,
  template: '',
})
class CheckoutPage {}

beforeEach(() => {
  TestBed.resetTestingModule();
});

describe('toCraftService', () => {
  it('adapts Angular ActivatedRoute as a global Craft service', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });

    TestBed.runInInjectionContext(() => {
      const activatedRoute = craftUse(CraftActivatedRoute());

      expect(activatedRoute.snapshot.url).toEqual([]);
    });
  });

  it('should adapt an injectable class in global scope and keep exposed methods bound to the source instance', async () => {
    @Injectable({
      providedIn: 'root',
    })
    class RouterLikeSource {
      readonly currentUrl = signal('/');

      navigateByUrl(url: string) {
        this.currentUrl.set(url);
        return Promise.resolve(true);
      }
    }

    const { RouterLike } = toCraftService({
      name: 'RouterLike',
      scope: 'global',
      token: RouterLikeSource,
    });

    const { Navigation } = craftService(
      { name: 'Navigation', scope: 'global' },
      function* () {
        const routerLike = yield* RouterLike(
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
      const navigation = craftUse(Navigation());
      const routerLike = inject(RouterLikeSource);

      await navigation.goToCheckout();

      expect(routerLike.currentUrl()).toBe('/checkout');
    });
  });

  it('should expose single-property shortcuts from toCraftService yield helpers', async () => {
    @Injectable({
      providedIn: 'root',
    })
    class RouterLikeShortcutSource {
      readonly currentUrl = signal('/');

      navigateByUrl(url: string) {
        this.currentUrl.set(url);
        return Promise.resolve(true);
      }
    }

    const { RouterLikeShortcut } = toCraftService({
      name: 'RouterLikeShortcut',
      scope: 'global',
      token: RouterLikeShortcutSource,
    });

    const { ShortcutNavigation } = craftService(
      { name: 'ShortcutNavigation', scope: 'global' },
      function* () {
        const navigateByUrl = yield* RouterLikeShortcut.navigateByUrl();

        expectTypeOf(navigateByUrl).toEqualTypeOf<
          GetServiceOutput<typeof RouterLikeShortcut>['navigateByUrl']
        >();

        return {
          goToCheckout: () => navigateByUrl('/checkout'),
        };
      },
    );

    expect(getServiceMetaData(RouterLikeShortcut.navigateByUrl).name).toBe(
      'RouterLikeShortcut',
    );

    await TestBed.runInInjectionContext(async () => {
      const navigation = craftUse(ShortcutNavigation());
      const routerLike = inject(RouterLikeShortcutSource);

      await navigation.goToCheckout();

      expect(routerLike.currentUrl()).toBe('/checkout');
    });
  });

  it('should call toCraftService method shortcuts directly when there are no public inputs', async () => {
    @Injectable({
      providedIn: 'root',
    })
    class RouterLikeDirectShortcutSource {
      readonly currentUrl = signal('/');

      navigateByUrl(url: string) {
        this.currentUrl.set(url);
        return Promise.resolve(true);
      }
    }

    const { RouterLikeDirectShortcut } = toCraftService({
      name: 'RouterLikeDirectShortcut',
      scope: 'global',
      token: RouterLikeDirectShortcutSource,
    });

    const { DirectShortcutNavigation } = craftService(
      { name: 'DirectShortcutNavigation', scope: 'global' },
      function* () {
        const result =
          yield* RouterLikeDirectShortcut.navigateByUrl('/checkout');

        expectTypeOf(result).toEqualTypeOf<
          ReturnType<
            GetServiceOutput<typeof RouterLikeDirectShortcut>['navigateByUrl']
          >
        >();

        return result;
      },
    );

    await TestBed.runInInjectionContext(async () => {
      const routerLike = inject(RouterLikeDirectShortcutSource);

      await expect(craftUse(DirectShortcutNavigation())).resolves.toBe(true);
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

    const { CurrentRoute } = toCraftService({
      name: 'CurrentRoute',
      scope: 'global',
      inject: () => inject(CURRENT_ROUTE),
    });

    TestBed.runInInjectionContext(() => {
      expect(craftUse(CurrentRoute()).path).toBe('/checkout');
    });
  });

  it('should expose browserBoundary in runtime metadata and preserve literal typing', () => {
    const ROUTE = new InjectionToken<{ path: string }>('Route');

    TestBed.configureTestingModule({
      providers: [
        {
          provide: ROUTE,
          useValue: {
            path: '/checkout',
          },
        },
      ],
    });

    const { BrowserRoute, BROWSER_ROUTE_META_DATA } = toCraftService({
      name: 'BrowserRoute',
      scope: 'global',
      inject: () => inject(ROUTE),
      browserBoundary: true,
    });

    const { DEFAULT_ROUTE_META_DATA } = toCraftService({
      name: 'DefaultRoute',
      scope: 'global',
      inject: () => inject(ROUTE),
    });

    expect(BROWSER_ROUTE_META_DATA.browserBoundary).toBe(true);
    expect(DEFAULT_ROUTE_META_DATA.browserBoundary).toBe(false);
    expect(getServiceMetaData(BrowserRoute).browserBoundary).toBe(true);

    expectTypeOf(BROWSER_ROUTE_META_DATA.browserBoundary).toEqualTypeOf<true>();
    expectTypeOf(
      DEFAULT_ROUTE_META_DATA.browserBoundary,
    ).toEqualTypeOf<false>();
    expectTypeOf<
      GetServiceReferenceMeta<typeof BrowserRoute>['browserBoundary']
    >().toEqualTypeOf<true>();
    expectTypeOf<
      GetServiceTrackingMetadata<typeof BrowserRoute>['browserBoundary']
    >().toEqualTypeOf<true>();
  });

  it('should support $self derivation for callable external dependencies', () => {
    function createCounter() {
      return craftUse(
        state('counter', 10, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
      );
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

    const { Counter, COUNTER_META_DATA } = toCraftService({
      name: 'Counter',
      scope: 'global',
      token: COUNTER,
      browserBoundary: true,
    });

    const { CounterFacade } = craftService(
      { name: 'CounterFacade', scope: 'global' },
      function* () {
        return yield* Counter(undefined, ({ $self, increment }) => ({
          $self,
          incrementCounter: increment,
        }));
      },
    );

    TestBed.runInInjectionContext(() => {
      const counterFacade = craftUse(CounterFacade());

      expect(craftUse(counterFacade())).toBe(10);
      counterFacade.incrementCounter();
      expect(craftUse(counterFacade())).toBe(11);
      expect('$self' in counterFacade).toBe(false);
      //@ts-expect-error $self should never be exposed publicly
      expect(counterFacade.$self).toBeUndefined();
    });
  });

  it('should expose provideX for toProvide dependencies and compose external providers', () => {
    @Injectable()
    class CounterDriverSource {
      readonly total = signal(0);

      increment() {
        this.total.update((value) => value + 1);
      }
    }

    const { CounterDriver, provideCounterDriver } = toCraftService({
      name: 'CounterDriver',
      scope: 'toProvide',
      token: CounterDriverSource,
      provide: () => [
        {
          provide: CounterDriverSource,
          useClass: CounterDriverSource,
        },
      ],
    });

    TestBed.configureTestingModule({
      providers: [provideCounterDriver()],
    });

    TestBed.runInInjectionContext(() => {
      const counterDriver = craftUse(CounterDriver());

      expect(craftUse(counterDriver.total())).toBe(0);
      counterDriver.increment();
      expect(craftUse(counterDriver.total())).toBe(1);
    });
  });

  it('should infer provider inputs for raw toProvide external dependencies without exposing $provided publicly', () => {
    const API_BASE_URL = new InjectionToken<string>('ApiBaseUrl');

    @Injectable()
    class CatalogDriverSource {
      readonly baseUrl = inject(API_BASE_URL);

      fetchProducts() {
        return `${this.baseUrl}/products`;
      }
    }

    const { Catalog, provideCatalog } = toCraftService({
      name: 'Catalog',
      scope: 'toProvide',
      token: CatalogDriverSource,
      provide: (provided: { apiBaseUrl: string }) => [
        {
          provide: API_BASE_URL,
          useValue: provided.apiBaseUrl,
        },
        {
          provide: CatalogDriverSource,
          useClass: CatalogDriverSource,
        },
      ],
    });

    if (false) {
      provideCatalog({ apiBaseUrl: '/api' });

      craftUse(
        // @ts-expect-error $provided should not be a public inject binding for raw dependencies
        Catalog({
          $provided: { apiBaseUrl: '/override' },
        }),
      );
    }

    TestBed.configureTestingModule({
      providers: [provideCatalog({ apiBaseUrl: '/api' })],
    });

    TestBed.runInInjectionContext(() => {
      expect(craftUse(Catalog()).fetchProducts()).toBe('/api/products');
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

    const { Catalog, provideCatalog } = toCraftService(
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
      Catalog({
        prefix: 'catalog',
        $provided: { apiBaseUrl: '/override' },
      });
    }

    if (false) {
      //@ts-expect-error $provided should not be a public yield binding for toCraftService
      Catalog({
        prefix: 'catalog',
        $provided: { apiBaseUrl: '/override' },
      });
    }

    TestBed.runInInjectionContext(() => {
      const catalog = craftUse(Catalog({ prefix: 'catalog' }));

      expect(catalog.readDriverBaseUrl()).toBe('/api');
      expect(catalog.readProvidedBaseUrl()).toBe('/api');
      expect(catalog.fetchPrefixedProducts()).toBe('catalog:/api/products');
    });
  });

  it('should expose XToProvide and provideX for manuallyProvidedAtRoot dependencies', () => {
    @Injectable()
    class CounterDriverSource {
      readonly total = signal(0);

      increment() {
        this.total.update((value) => value + 1);
      }
    }

    const { CounterDriver, provideCounterDriver, CounterDriverToProvide } =
      toCraftService({
        name: 'CounterDriver',
        scope: 'manuallyProvidedAtRoot',
        token: CounterDriverSource,
        provide: () => [
          {
            provide: CounterDriverSource,
            useClass: CounterDriverSource,
          },
        ],
      });

    TestBed.configureTestingModule({
      providers: [provideCounterDriver()],
    });

    TestBed.runInInjectionContext(() => {
      const counterDriver = craftUse(CounterDriver());
      const providedCounterDriver = inject(CounterDriverToProvide);

      expect(counterDriver).toBe(providedCounterDriver);
      counterDriver.increment();
      expect(providedCounterDriver.total()).toBe(1);
    });
  });

  it('should forward provider rest arguments and expose both Router tokens for manuallyProvidedAtRoot dependencies', () => {
    const { CraftRouter, provideCraftRouter, CraftRouterToProvide } =
      toCraftService({
        name: 'CraftRouter',
        scope: 'manuallyProvidedAtRoot',
        token: Router,
        provide: provideRouter,
      });

    TestBed.configureTestingModule({
      providers: [
        provideCraftRouter(
          [{ path: 'checkout', component: CheckoutPage }],
          withComponentInputBinding(),
        ),
      ],
    });

    TestBed.runInInjectionContext(() => {
      const angularRouter = inject(Router);
      const craftRouter = inject(CraftRouterToProvide);

      expect(craftUse(CraftRouter()).url).toBe(angularRouter.url);
      expect(craftRouter.url).toBe(angularRouter.url);
      expect(typeof craftRouter.navigateByUrl).toBe('function');
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

    const { Catalog, provideCatalog, CatalogToProvide } = toCraftService({
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

      craftUse(
        // @ts-expect-error $provided should not be a public inject binding for raw dependencies
        Catalog({
          $provided: { apiBaseUrl: '/override' },
        }),
      );
    }

    TestBed.configureTestingModule({
      providers: [provideCatalog({ apiBaseUrl: '/api' })],
    });

    TestBed.runInInjectionContext(() => {
      const catalog = craftUse(Catalog());
      const providedCatalog = inject(CatalogToProvide);

      expect(catalog).toBe(providedCatalog);
      expect(catalog.fetchProducts()).toBe('/api/products');
    });
  });

  it('should track derived properties like a craftService leaf dependency', () => {
    function createCounter() {
      return craftUse(
        state('counter', 10, ({ update }) => ({
          increment: () => update((value) => value + 1),
          decrement: () => update((value) => value - 1),
        })),
      );
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

    const { Counter, COUNTER_META_DATA } = toCraftService({
      name: 'Counter',
      scope: 'global',
      inject: () => inject(COUNTER),
      browserBoundary: true,
    });

    const { CounterFacade } = craftService(
      { name: 'CounterFacade', scope: 'global' },
      function* () {
        return yield* Counter(
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

    type CounterFacadeDependencies = GetServiceDependencies<
      typeof CounterFacade
    >;

    expectTypeOf(COUNTER_META_DATA.browserBoundary).toEqualTypeOf<true>();
    expectTypeOf<
      GetServiceTrackingMetadata<typeof Counter>['browserBoundary']
    >().toEqualTypeOf<true>();
    expectTypeOf<
      CounterFacadeDependencies['scope']
    >().toEqualTypeOf<'global'>();
    expectTypeOf<
      CounterFacadeDependencies['browserBoundary']
    >().toEqualTypeOf<false>();
    expectTypeOf<
      CounterFacadeDependencies['dependencies']['Counter']['scope']
    >().toEqualTypeOf<'global'>();
    expectTypeOf<
      CounterFacadeDependencies['dependencies']['Counter']['browserBoundary']
    >().toEqualTypeOf<true>();
    expectTypeOf<
      CounterFacadeDependencies['dependencies']['Counter']['derivedPropertiesUsed']
    >().toEqualTypeOf<{
      $self: GetServiceOutput<typeof Counter>;
      increment: GetServiceOutput<typeof Counter>['increment'];
      decrement: GetServiceOutput<typeof Counter>['decrement'];
    }>();
    expectTypeOf<
      CounterFacadeDependencies['dependencies']['Counter']['derivedPropertiesExposed']
    >().toEqualTypeOf<{
      $self: GetServiceOutput<typeof Counter>;
      incrementCounter: GetServiceOutput<typeof Counter>['increment'];
    }>();
  });
});

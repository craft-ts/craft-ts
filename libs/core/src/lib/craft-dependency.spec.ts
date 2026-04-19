import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import {
  Injectable,
  inject,
  InjectionToken,
  signal,
} from '@angular/core';
import { state } from './state';
import { craftDependency, craftService } from './craft-service';
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

describe('craftDependency', () => {
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

    const { RouterLikeToYield } = craftDependency({
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

    const { injectCurrentRoute } = craftDependency({
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

    const { CounterToYield } = craftDependency({
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

    const { injectCounterDriver, provideCounterDriver } = craftDependency({
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

  it('should expose XToProvide and provideX for manuallyProvidedAtRoot dependencies', () => {
    @Injectable()
    class CounterDriver {
      readonly total = signal(0);

      increment() {
        this.total.update((value) => value + 1);
      }
    }

    const { injectCounterDriver, provideCounterDriver, CounterDriverToProvide } =
      craftDependency({
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

    const { CounterToYield } = craftDependency({
      name: 'Counter',
      scope: 'global',
      token: COUNTER,
    });

    const { injectCounterFacade } = craftService(
      { name: 'CounterFacade', scope: 'global' },
      function* () {
        return yield* CounterToYield(undefined, function* ({
          $self,
          increment,
          decrement,
        }) {
          yield* decrement();

          return {
            $self,
            incrementCounter: increment,
          };
        });
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
          mustBeProvided: [];
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
      mustBeProvided: [];
    }>();
  });

  it('should only allow the callback form on global scope', () => {
    const CURRENT_ROUTE = new InjectionToken<{ path: string }>('CurrentRoute');

    const { injectCurrentRoute } = craftDependency({
      name: 'CurrentRoute',
      scope: 'global',
      token: CURRENT_ROUTE,
    });

    expect(injectCurrentRoute).toBeDefined();

    if (false) {
      const { provideCounterDriver } = craftDependency({
        name: 'CounterDriver',
        scope: 'toProvide',
        token: CURRENT_ROUTE,
        provide: () => [],
      });

      expect(provideCounterDriver).toBeDefined();
    }

    if (false) {
      const { provideCounterDriver } = craftDependency({
        name: 'CounterDriver',
        scope: 'manuallyProvidedAtRoot',
        token: CURRENT_ROUTE,
        provide: () => [],
      });

      expect(provideCounterDriver).toBeDefined();
    }

    if (false) {
      //@ts-expect-error callback-based dependencies should stay limited to global scope
      craftDependency({
        name: 'CounterDriver',
        scope: 'toProvide',
        inject: () => inject(CURRENT_ROUTE),
      });
    }

    if (false) {
      //@ts-expect-error callback-based dependencies should stay limited to global scope
      craftDependency({
        name: 'CounterDriver',
        scope: 'manuallyProvidedAtRoot',
        inject: () => inject(CURRENT_ROUTE),
      });
    }
  });
});

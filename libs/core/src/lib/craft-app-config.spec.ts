import '@angular/compiler';
import { ApplicationInitStatus, InjectionToken, Type } from '@angular/core';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { TestBed } from '@angular/core/testing';
import { beforeAll, describe, expect, expectTypeOf, it } from 'vitest';
import { GetDeps } from './branded-component/branded-component';
import { craftAppConfig, toApplicationConfig } from './craft-app-config';
import { craftRoutes } from './craft-routes';
import {
  craftService,
  GetInjectedServiceDependencies,
  onAppStart,
  runServiceAppStart,
} from './craft-service';

const appStartCalls: string[] = [];

const { injectAppStartCounter } = craftService(
  {
    name: 'AppStartCounter',
    scope: 'toProvide',
    appStart: true,
  },
  function* () {
    yield* onAppStart(() => {
      appStartCalls.push('started');
      return undefined;
    });
    return 1;
  },
);

declare module './craft-app-config' {
  interface CraftAppStartRegistry {
    MustRunOnStart: typeof injectAppStartCounter;
  }
}

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

describe('craftAppConfig', () => {
  it('should expose APP_CONFIG_META_DATA with computed missing providers', () => {
    const { injectCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );

    type CounterRouteDeps = GetDeps<{
      deps: {
        Counter: GetInjectedServiceDependencies<typeof injectCounter>;
      };
      provided: {};
      publicProperties: {};
    }>;

    const { appRoutes } = craftRoutes([
      {
        path: 'counter',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as CounterRouteDeps,
      },
    ]);

    const appConfig = craftAppConfig({
      routingDeps: appRoutes.META_DATA,
    });

    expectTypeOf(appConfig.APP_CONFIG_META_DATA).toEqualTypeOf<
      readonly [
        {
          path: 'counter';
          deps: {
            Counter: GetInjectedServiceDependencies<typeof injectCounter>;
          };
          provided: {};
          publicProperties: {};
          missingProvider: {
            Counter: GetInjectedServiceDependencies<typeof injectCounter>;
          };
        },
      ]
    >();
  });

  it('should remove app providers from APP_CONFIG_META_DATA', () => {
    const { injectCounter, provideCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );

    type CounterRouteDeps = GetDeps<{
      deps: {
        Counter: GetInjectedServiceDependencies<typeof injectCounter>;
      };
      provided: {};
      publicProperties: {};
    }>;

    const { appRoutes } = craftRoutes([
      {
        path: 'counter',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as CounterRouteDeps,
      },
    ]);

    const appConfig = craftAppConfig({
      routingDeps: appRoutes.META_DATA,
      providers: [provideCounter()],
    });

    expectTypeOf(appConfig.APP_CONFIG_META_DATA).toEqualTypeOf<
      readonly [
        {
          path: 'counter';
          deps: {};
          provided: {};
          publicProperties: {};
        },
      ]
    >();
  });

  it('should remove app providers from lazy child routes in APP_CONFIG_META_DATA', () => {
    const { injectCounter, provideCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );

    type ChildRouteDeps = GetDeps<{
      deps: {
        Counter: GetInjectedServiceDependencies<typeof injectCounter>;
      };
      provided: {};
      publicProperties: {};
    }>;

    const childRoutes = craftRoutes([
      {
        path: 'child',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as ChildRouteDeps,
      },
    ]);
    const { appRoutes } = craftRoutes([
      {
        path: 'lazy-parent',
        loadChildren: () => childRoutes.appRoutes,
      },
    ]);

    const appConfig = craftAppConfig({
      routingDeps: appRoutes.META_DATA,
      providers: [provideCounter()],
    });

    expectTypeOf(appConfig.APP_CONFIG_META_DATA).toEqualTypeOf<
      readonly [
        {
          path: 'lazy-parent';
        },
        {
          path: 'lazy-parent/child';
          deps: {};
          provided: {};
          publicProperties: {};
        },
      ]
    >();
  });

  it('should include generator guard missing providers in APP_CONFIG_META_DATA', () => {
    const { injectCounter, CounterToYield } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );

    type GuardRouteDeps = GetDeps<{
      provided: {};
      publicProperties: {};
    }>;

    const { appRoutes } = craftRoutes([
      {
        path: 'counter',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as GuardRouteDeps,
        canActivate: function* () {
          yield* CounterToYield();
          return true;
        },
      },
    ]);

    const appConfig = craftAppConfig({
      routingDeps: appRoutes.META_DATA,
    });

    expectTypeOf(appConfig.APP_CONFIG_META_DATA).toEqualTypeOf<
      readonly [
        {
          path: 'counter';
          deps: {
            Counter: GetInjectedServiceDependencies<typeof injectCounter>;
          };
          provided: {};
          publicProperties: {};
          missingProvider: {
            Counter: GetInjectedServiceDependencies<typeof injectCounter>;
          };
        },
      ]
    >();
  });

  it('should convert to ApplicationConfig', () => {
    const marker = new InjectionToken<string>('marker');
    const appConfig = craftAppConfig({
      routingDeps: [] as const,
      providers: [
        {
          provide: marker,
          useValue: 'kept',
        },
      ] as const,
    });

    const applicationConfig = toApplicationConfig(appConfig);

    expect(applicationConfig.providers).toEqual(appConfig.providers);
    expect(applicationConfig.providers).not.toBe(appConfig.providers);
  });
});

describe('craftAppConfig appStart', () => {
  it('should treat appStart services as provided at app root in APP_CONFIG_META_DATA', () => {
    type CounterRouteDeps = GetDeps<{
      deps: {
        AppStartCounter: GetInjectedServiceDependencies<typeof injectAppStartCounter>;
      };
      provided: {};
      publicProperties: {};
    }>;

    const { appRoutes } = craftRoutes([
      {
        path: 'counter',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as CounterRouteDeps,
      },
    ]);

    const appConfig = craftAppConfig({
      routingDeps: appRoutes.META_DATA,
    });

    expectTypeOf(appConfig.APP_CONFIG_META_DATA).toEqualTypeOf<
      readonly [
        {
          path: 'counter';
          deps: {};
          provided: {};
          publicProperties: {};
        },
      ]
    >();
  });

  it('should run registered appStart services during app initialization', async () => {
    appStartCalls.length = 0;

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [...craftAppConfig({ routingDeps: [] as const }).providers],
    });

    await TestBed.inject(ApplicationInitStatus).donePromise;

    expect(appStartCalls).toEqual(['started']);
  });

  it('should run generator-based appStart callbacks during app initialization', async () => {
    const generatorAppStartCalls: string[] = [];
    let resolveAppStart!: () => void;
    const waitForAppStart = new Promise<void>((resolve) => {
      resolveAppStart = resolve;
    });

    craftService(
      {
        name: 'GeneratorAppStart',
        scope: 'global',
        appStart: true,
      },
      function* () {
        yield* onAppStart(function* () {
          generatorAppStartCalls.push('generator-started');
          return waitForAppStart;
        });

        return 1;
      },
    );

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [...craftAppConfig({ routingDeps: [] as const }).providers],
    });

    const pendingInitialization = TestBed.inject(ApplicationInitStatus).donePromise;

    expect(generatorAppStartCalls).toEqual(['generator-started']);

    resolveAppStart();
    await pendingInitialization;
  });

  it('should reject nested onAppStart declarations inside generator callbacks', () => {
    const { injectNestedAppStart } = craftService(
      {
        name: 'NestedAppStart',
        scope: 'global',
        appStart: true,
      },
      function* () {
        yield* onAppStart(function* () {
          yield* (onAppStart(() => undefined) as Generator<any, void, unknown>);

          return undefined;
        });

        return 1;
      },
    );

    TestBed.runInInjectionContext(() => {
      const service = injectNestedAppStart();

      expect(() => runServiceAppStart(injectNestedAppStart, service)).toThrow(
        'onAppStart(...) generator callbacks cannot declare onAppStart(...) recursively.',
      );
    });
  });
});

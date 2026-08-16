import '@angular/compiler';
import { ApplicationInitStatus, InjectionToken, Type } from '@angular/core';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { TestBed } from '@angular/core/testing';
import { beforeAll, describe, expect, expectTypeOf, it } from 'vitest';
import type { AppCheckedDI } from './app-checked-di';
import { GetDeps } from './branded-component/branded-component';
import { craftAppConfig, toApplicationConfig } from './craft-app-config';
import { CraftHttpClient, type CraftHttpRequest } from './craft-http-client';
import {
  appStartCalls,
  AppStartCounter,
  requiredAppStart,
} from './craft-app-config.app-start.fixture';
import { craftRoutes } from './craft-routes';
import type { AppProvidedServiceNamesOf } from './route-checked-di';
import {
  craftService,
  GetServiceDependencies,
  onAppStart,
  runServiceAppStart,
  ɵtoCraftService as toCraftService,
} from './craft-service';
import { craftUse } from './craft-use';

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
    const { Counter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );

    type CounterRouteDeps = GetDeps<{
      deps: {
        Counter: GetServiceDependencies<typeof Counter>;
      };
      provided: {};
      publicProperties: {};
    }>;

    const { appRoutes } = craftRoutes('app', [
      {
        path: 'counter',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as CounterRouteDeps,
      },
    ]);

    // @ts-expect-error craftAppConfig must acknowledge registered appStart services.
    craftAppConfig({ routingDeps: appRoutes.META_DATA });

    const appConfig = craftAppConfig({
      appStart: requiredAppStart,
      routingDeps: appRoutes.META_DATA,
    });

    expectTypeOf(appConfig.APP_CONFIG_META_DATA).toMatchTypeOf<
      readonly [
        {
          path: 'counter';
          deps: {
            Counter: GetServiceDependencies<typeof Counter>;
          };
          provided: {};
          publicProperties: {};
          missingProvider: {
            Counter: GetServiceDependencies<typeof Counter>;
          };
        },
      ]
    >();
  });

  it('should remove app providers from APP_CONFIG_META_DATA', () => {
    const { Counter, provideCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );

    type CounterRouteDeps = GetDeps<{
      deps: {
        Counter: GetServiceDependencies<typeof Counter>;
      };
      provided: {};
      publicProperties: {};
    }>;

    const { appRoutes } = craftRoutes('app', [
      {
        path: 'counter',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as CounterRouteDeps,
      },
    ]);

    const appConfig = craftAppConfig({
      appStart: requiredAppStart,
      routingDeps: appRoutes.META_DATA,
      providers: [provideCounter()],
    });

    expectTypeOf(appConfig.APP_CONFIG_META_DATA).toMatchTypeOf<
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

  it('should ignore plain Angular providers when extracting Craft provider names', () => {
    const { provideCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );
    const token = new InjectionToken<string>('plain-provider');

    const appConfig = craftAppConfig({
      appStart: requiredAppStart,
      routingDeps: [] as const,
      providers: [
        { provide: token, useValue: 'value' },
        provideCounter(),
      ] as const,
    });

    type ProvidedNames = AppProvidedServiceNamesOf<typeof appConfig>;

    expectTypeOf<ProvidedNames>().toEqualTypeOf<'Counter' | 'AppStartCounter'>();
  });

  it('should make app providers available to AppCheckedDI for AppComponent', () => {
    const { Counter, provideCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );

    type AppComponentDeps = GetDeps<{
      deps: {
        Counter: GetServiceDependencies<typeof Counter>;
      };
      provided: {};
      publicProperties: {};
    }>;

    const appConfig = craftAppConfig({
      appStart: requiredAppStart,
      routingDeps: [] as const,
      providers: [provideCounter()] as const,
    });

    type CheckedDI = AppCheckedDI<
      AppComponentDeps,
      typeof appConfig.APP_CONFIG_META_DATA
    >;

    expectTypeOf<CheckedDI>().toEqualTypeOf<true>();
  });

  it('should remove app providers from lazy child routes in APP_CONFIG_META_DATA', () => {
    const { Counter, provideCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );

    type ChildRouteDeps = GetDeps<{
      deps: {
        Counter: GetServiceDependencies<typeof Counter>;
      };
      provided: {};
      publicProperties: {};
    }>;

    const childRoutes = craftRoutes('app', [
      {
        path: 'child',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as ChildRouteDeps,
      },
    ]);
    const { appRoutes } = craftRoutes('app', [
      {
        path: 'lazy-parent',
        loadChildren: () => childRoutes.appRoutes,
      },
    ]);

    const appConfig = craftAppConfig({
      appStart: requiredAppStart,
      routingDeps: appRoutes.META_DATA,
      providers: [provideCounter()],
    });

    expectTypeOf(appConfig.APP_CONFIG_META_DATA).toMatchTypeOf<
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

  it('should remove route missing providers satisfied by manuallyProvidedAtRoot output values', () => {
    class RouterLike {
      navigateByUrl(_url: string) {
        return Promise.resolve(true);
      }
    }

    const { CraftRouter, provideCraftRouter } = toCraftService({
      name: 'CraftRouter',
      scope: 'manuallyProvidedAtRoot',
      token: RouterLike,
      provide: () => [
        {
          provide: RouterLike,
          useClass: RouterLike,
        },
      ],
    });

    type RouterRouteDeps = GetDeps<{
      deps: {};
      provided: {};
      publicProperties: {};
      missingProvider: {
        Router: ReturnType<typeof CraftRouter>;
      };
    }>;

    const { appRoutes } = craftRoutes('app', [
      {
        path: 'router',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as RouterRouteDeps,
      },
    ]);

    const appConfig = craftAppConfig({
      appStart: requiredAppStart,
      routingDeps: appRoutes.META_DATA,
      providers: [provideCraftRouter()],
    });

    expectTypeOf(appConfig.APP_CONFIG_META_DATA).toMatchTypeOf<
      readonly [
        {
          path: 'router';
          deps: {};
          provided: {};
          publicProperties: {};
        },
      ]
    >();
  });

  it('should include generator guard missing providers in APP_CONFIG_META_DATA', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );

    type GuardRouteDeps = GetDeps<{
      provided: {};
      publicProperties: {};
    }>;

    const { appRoutes } = craftRoutes('app', [
      {
        path: 'counter',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as GuardRouteDeps,
        canActivate: function* () {
          yield* Counter();
          return true;
        },
      },
    ]);

    const appConfig = craftAppConfig({
      appStart: requiredAppStart,
      routingDeps: appRoutes.META_DATA,
    });

    expectTypeOf(appConfig.APP_CONFIG_META_DATA).toMatchTypeOf<
      readonly [
        {
          path: 'counter';
          deps: {
            Counter: GetServiceDependencies<typeof Counter>;
          };
          provided: {};
          publicProperties: {};
          missingProvider: {
            Counter: GetServiceDependencies<typeof Counter>;
          };
        },
      ]
    >();
  });

  it('should preserve route httpDeps in APP_CONFIG_META_DATA', () => {
    type User = { id: string };

    const { UsersApi } = craftService(
      { name: 'UsersApi', scope: 'global' },
      function* () {
        const getUsers = yield* CraftHttpClient.get(({ response }) => ({
          url: '/api/users',
          success: response<User[]>(),
        }));

        return {
          getUsers,
        };
      },
    );

    type UsersRouteDeps = GetDeps<{
      deps: {};
      propertiesDeps: {
        usersApi: {
          UsersApi: GetServiceDependencies<typeof UsersApi>;
        };
      };
      provided: {};
      publicProperties: {};
    }>;

    const { appRoutes } = craftRoutes('app', [
      {
        path: 'users',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as UsersRouteDeps,
      },
    ]);

    const appConfig = craftAppConfig({
      appStart: requiredAppStart,
      routingDeps: appRoutes.META_DATA,
    });

    expectTypeOf(appConfig.APP_CONFIG_META_DATA).toMatchTypeOf<
      readonly [
        {
          path: 'users';
          deps: {};
          provided: {};
          publicProperties: {};
          httpDeps: {
            'GET /api/users': CraftHttpRequest<
              'GET',
              '/api/users',
              User[],
              undefined,
              undefined
            >;
          };
        },
      ]
    >();
  });

  it('should convert to ApplicationConfig', () => {
    const marker = new InjectionToken<string>('marker');
    const appConfig = craftAppConfig({
      appStart: requiredAppStart,
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
        AppStartCounter: GetServiceDependencies<typeof AppStartCounter>;
      };
      provided: {};
      publicProperties: {};
    }>;

    const { appRoutes } = craftRoutes('app', [
      {
        path: 'counter',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as CounterRouteDeps,
      },
    ]);

    const appConfig = craftAppConfig({
      appStart: requiredAppStart,
      routingDeps: appRoutes.META_DATA,
    });

    expectTypeOf(appConfig.APP_CONFIG_META_DATA).toMatchTypeOf<
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
      providers: [
        ...craftAppConfig({
          appStart: requiredAppStart,
          routingDeps: [] as const,
        }).providers,
      ],
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
        yield* onAppStart(() => {
          generatorAppStartCalls.push('generator-started');
          return waitForAppStart;
        });

        return 1;
      },
    );

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ...craftAppConfig({
          appStart: requiredAppStart,
          routingDeps: [] as const,
        }).providers,
      ],
    });

    const pendingInitialization = TestBed.inject(
      ApplicationInitStatus,
    ).donePromise;

    expect(generatorAppStartCalls).toEqual(['generator-started']);

    resolveAppStart();
    await pendingInitialization;
  });

  it('should reject nested onAppStart declarations inside generator callbacks', () => {
    const { NestedAppStart } = craftService(
      {
        name: 'NestedAppStart',
        scope: 'global',
        appStart: true,
      },
      function* () {
        yield* onAppStart(function* () {
          yield* onAppStart(() => undefined) as Generator<any, void, unknown>;

          return undefined;
        });

        return 1;
      },
    );

    TestBed.runInInjectionContext(() => {
      const service = craftUse(NestedAppStart());

      expect(() => runServiceAppStart(NestedAppStart, service)).toThrow(
        'onAppStart(...) generator callbacks cannot declare onAppStart(...) recursively.',
      );
    });
  });
});

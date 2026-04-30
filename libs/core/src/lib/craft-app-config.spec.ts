import '@angular/compiler';
import { InjectionToken, Type } from '@angular/core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { GetDeps } from './branded-component/branded-component';
import { craftAppConfig, toApplicationConfig } from './craft-app-config';
import { craftRoutes } from './craft-routes';
import { craftService, GetInjectedServiceDependencies } from './craft-service';

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

import { craftService, GetServiceDependencies } from './craft-service';
import { GetDeps } from './branded-component/branded-component';
import type { AppCheckedDI, CanRun } from './app-checked-di';
import { craftAppConfig } from './craft-app-config';
import { requiredAppStart } from './craft-app-config.app-start.fixture';

function _injectDemoUserIdParams(): string {
  throw new Error('Type-only helper');
}

describe('AppCheckedDI', () => {
  it('should return true if all missingProvider and routing inputs are provided', () => {
        class AppComponent {}

    type GenDeps_AppComponent = GetDeps<{
      deps: {};
      provided: {};
      missingProvider: {};
      publicProperties: {};
    }>;

    type APP_ROUTES = readonly [
      {
        path: '';
        deps: {};
        provided: {};
        publicProperties: {};
      },
      {
        path: 'query/:userId';
        deps: {};
        missingProvider: {};
        provided: {};
        publicProperties: {};
      },
    ];

    type APP_CHECKED_DI = AppCheckedDI<GenDeps_AppComponent, APP_ROUTES>;

    expectTypeOf<APP_CHECKED_DI>().toEqualTypeOf<true>();
  });
  it('should return an error if some routes deps are not provided', () => {
    type GenDeps_AppComponent = GetDeps<{
      deps: {};
      provided: {};
      missingProvider: {};
      publicProperties: {};
    }>;

    const { Counter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );

    type APP_ROUTES = readonly [
      {
        path: 'some-path';
        deps: {};
        provided: {};
        missingProvider: {
          Counter: GetServiceDependencies<typeof Counter>;
        };
        publicProperties: {};
      },
      {
        path: 'query/:userId';
        deps: {};
        provided: {};
        missingProvider: {};
        publicProperties: {};
      },
    ];

    type APP_CHECKED_DI = AppCheckedDI<GenDeps_AppComponent, APP_ROUTES>;

    expectTypeOf<APP_CHECKED_DI>().toEqualTypeOf<
      [
        'The Counter service is not provided in path: "some-path"',
      ]
    >();
  });

  it('should return an error if some route inputs are not provided', () => {
    type GenDeps_AppComponent = GetDeps<{
      deps: {};
      provided: {};
      missingProvider: {};
      publicProperties: {};
    }>;

    const { Counter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );

    type APP_ROUTES = readonly [
      {
        path: 'some-path';
        deps: {};
        provided: {};
        missingProvider: {};
        publicProperties: {
          userId: () => string;
        };
      },
      {
        path: 'query/:userId';
        deps: {};
        provided: {};
        missingProvider: {};
        publicProperties: {};
      },
    ];

    type APP_CHECKED_DI = AppCheckedDI<GenDeps_AppComponent, APP_ROUTES>;

    expectTypeOf<APP_CHECKED_DI>().toEqualTypeOf<
      ['Input "userId" is not provided in path: "some-path"']
    >();
  });

  it('should return an error if some inputs are not provided in AppComponent', () => {
    type GenDeps_AppComponent = GetDeps<{
      deps: {};
      provided: {};
      missingProvider: {};
      publicProperties: {
        userId: () => string;
      };
    }>;

    type APP_ROUTES = readonly [
      {
        path: 'some-path';
        deps: {};
        provided: {};
        missingProvider: {};
        publicProperties: {};
      },
      {
        path: 'query/:userId';
        deps: {};
        provided: {};
        missingProvider: {};
        publicProperties: {};
      },
    ];

    type APP_CHECKED_DI = AppCheckedDI<GenDeps_AppComponent, APP_ROUTES>;

    expectTypeOf<APP_CHECKED_DI>().toEqualTypeOf<
      ['Input "userId" is not provided in AppComponent']
    >();
  });

  it('should return combined errors', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );

    type GenDeps_AppComponent = GetDeps<{
      deps: {};
      provided: {};
      missingProvider: {};
      publicProperties: {
        userId: () => string;
      };
    }>;

    type APP_ROUTES = readonly [
      {
        path: 'some-path';
        deps: {};
        provided: {};
        missingProvider: {};
        publicProperties: {
          userId: () => string;
        };
      },
      {
        path: 'query/:userId';
        deps: {};
        missingProvider: {
          Counter: GetServiceDependencies<typeof Counter>;
        };
        provided: {};
        publicProperties: {};
      },
    ];

    type APP_CHECKED_DI = AppCheckedDI<GenDeps_AppComponent, APP_ROUTES>;

    expectTypeOf<APP_CHECKED_DI>().toEqualTypeOf<
      [
        'Input "userId" is not provided in AppComponent',
        'Input "userId" is not provided in path: "some-path"',
        'The Counter service is not provided in path: "query/:userId"',
      ]
    >();
  });

  it('should report composed lazy child paths for missing inputs and providers', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );

    type GenDeps_AppComponent = GetDeps<{
      deps: {};
      provided: {};
      missingProvider: {};
      publicProperties: {};
    }>;

    type APP_ROUTES = readonly [
      {
        path: 'lazy-parent';
      },
      {
        path: 'lazy-parent/child';
        deps: {};
        provided: {};
        missingProvider: {
          Counter: GetServiceDependencies<typeof Counter>;
        };
        publicProperties: {
          userId: () => string;
        };
      },
    ];

    type APP_CHECKED_DI = AppCheckedDI<GenDeps_AppComponent, APP_ROUTES>;

    expectTypeOf<APP_CHECKED_DI>().toEqualTypeOf<
      [
        'Input "userId" is not provided in path: "lazy-parent/child"',
        'The Counter service is not provided in path: "lazy-parent/child"',
      ]
    >();
  });

  it('should treat app root providers from APP_CONFIG_META_DATA as provided in AppComponent', () => {
    const { Counter, provideCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );

    type GenDeps_AppComponent = GetDeps<{
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

    type APP_CHECKED_DI = AppCheckedDI<
      GenDeps_AppComponent,
      typeof appConfig.APP_CONFIG_META_DATA
    >;

    expectTypeOf<APP_CHECKED_DI>().toEqualTypeOf<true>();
  });

  it('should report route missing providers from APP_CONFIG_META_DATA branded tuples', () => {
    type GenDeps_AppComponent = GetDeps<{
      deps: {};
      provided: {};
      missingProvider: {};
      publicProperties: {};
    }>;

    const { Counter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );

    type APP_ROUTES = readonly [
      {
        path: 'lazy-parent';
      },
      {
        path: 'lazy-parent/child';
        deps: {};
        provided: {};
        missingProvider: {
          Counter: GetServiceDependencies<typeof Counter>;
        };
        publicProperties: {};
      },
    ];

    const appConfig = craftAppConfig({
      appStart: requiredAppStart,
      routingDeps: [] as unknown as APP_ROUTES,
    });

    type APP_CHECKED_DI = AppCheckedDI<
      GenDeps_AppComponent,
      typeof appConfig.APP_CONFIG_META_DATA
    >;

    expectTypeOf<APP_CHECKED_DI>().toEqualTypeOf<
      [
        'The Counter service is not provided in path: "lazy-parent/child"',
      ]
    >();
  });

  it('should report demo lazy child route provider errors through AppCheckedDI', () => {
    type GenDeps_AppComponent = GetDeps<{
      deps: {};
      provided: {};
      missingProvider: {};
      publicProperties: {};
    }>;

    type DemoRoutingDeps = readonly [
      {
        path: 'craft/lazy-layout/:teamId';
      },
      {
        path: 'craft/lazy-layout/:teamId/users/:userId';
        deps: {};
        provided: {};
        publicProperties: {};
        missingProvider: {
          DemoUserIdParams: ReturnType<typeof _injectDemoUserIdParams>;
        };
      },
    ];

    const _appConfig = craftAppConfig({
      appStart: requiredAppStart,
      routingDeps: [] as unknown as DemoRoutingDeps,
    });

    type DEMO_APP_CHECKED_DI = AppCheckedDI<
      GenDeps_AppComponent,
      typeof _appConfig.APP_CONFIG_META_DATA
    >;

    expectTypeOf<DEMO_APP_CHECKED_DI>().toEqualTypeOf<
      [
        'The DemoUserIdParams service is not provided in path: "craft/lazy-layout/:teamId/users/:userId"',
      ]
    >();
  });
});

describe('CanRun', () => {
  it('should not trigger a typing error when AppCheckedDI is valid', () => {
    type Run = CanRun<true>;
  });

  it('should trigger a typing error when AppCheckedDI is invalid', () => {
    // @ts-expect-error - This should trigger a typing error because AppCheckedDI is not valid
    type Run = CanRun<['Some error']>;
  });
});

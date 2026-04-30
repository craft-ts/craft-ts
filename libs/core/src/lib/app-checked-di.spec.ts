import { Component } from '@angular/core';
import { craftService, GetInjectedServiceDependencies } from './craft-service';
import { GetDeps } from './branded-component/branded-component';
import type { AppCheckedDI, CanRun } from './app-checked-di';

describe('AppCheckedDI', () => {
  it('should return true if all missingProvider and routing inputs are provided', () => {
    @Component({
      selector: 'lib-app',
      template: ` App `,
    })
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

    const { injectCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );

    type APP_ROUTES = readonly [
      {
        path: 'some-path';
        deps: {};
        provided: {};
        missingProvider: {
          Counter: GetInjectedServiceDependencies<typeof injectCounter>;
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
        'Injected Counter is not provided in path: "some-path" (or you may scope this properties as protected/private)',
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

    const { injectCounter } = craftService(
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
    const { injectCounter } = craftService(
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
          Counter: GetInjectedServiceDependencies<typeof injectCounter>;
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
        'Injected Counter is not provided in path: "query/:userId" (or you may scope this properties as protected/private)',
      ]
    >();
  });

  it('should report composed lazy child paths for missing inputs and providers', () => {
    const { injectCounter } = craftService(
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
          Counter: GetInjectedServiceDependencies<typeof injectCounter>;
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
        'Injected Counter is not provided in path: "lazy-parent/child" (or you may scope this properties as protected/private)',
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

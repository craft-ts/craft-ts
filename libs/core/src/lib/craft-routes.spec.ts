import '@angular/compiler';
import {
  Component,
  computed,
  InjectionToken,
  Injector,
  input,
  runInInjectionContext,
  Type,
  type Signal,
} from '@angular/core';
import {
  ActivatedRoute,
  type Data,
  type Params,
  type Route,
} from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  craftService,
  GetInjectedServiceDependencies,
  SERVICE_RUNTIME_OVERRIDES,
  type CraftServiceApi,
} from './craft-service';
import {
  craftRoutes,
  type ResolveCraftRouteComponentDeps,
} from './craft-routes';
import { GetDeps } from './branded-component/branded-component';

function createActivatedRouteStub(
  initial: {
    params?: Params;
    data?: Data;
  } = {},
) {
  const paramsSubject = new BehaviorSubject<Params>(initial.params ?? {});
  const dataSubject = new BehaviorSubject<Data>(initial.data ?? {});

  const snapshot = {
    params: paramsSubject.value,
    data: dataSubject.value,
  };

  return {
    route: {
      params: paramsSubject.asObservable(),
      data: dataSubject.asObservable(),
      snapshot,
    } as ActivatedRoute,
    setParams(params: Params) {
      snapshot.params = params;
      paramsSubject.next(params);
    },
    setData(data: Data) {
      snapshot.data = data;
      dataSubject.next(data);
    },
  };
}

function flattenProviders(
  providers: NonNullable<Route['providers']> | undefined,
): unknown[] {
  if (!providers) {
    return [];
  }

  return providers.flatMap((provider) =>
    Array.isArray(provider)
      ? flattenProviders(provider as Route['providers'])
      : [provider],
  );
}

function createRouteInjector(
  providers: NonNullable<Route['providers']> | undefined,
  activatedRoute: ActivatedRoute,
): Injector {
  return Injector.create({
    providers: [
      {
        provide: ActivatedRoute,
        useValue: activatedRoute,
      },
      {
        provide: SERVICE_RUNTIME_OVERRIDES,
        useValue: new Map(),
      },
      ...flattenProviders(providers),
    ] as never[],
  });
}

describe('craftRoutes', () => {
  it('should expose typed inject helpers for params and route data', () => {
    const routes = craftRoutes([
      {
        path: 'mutation/:userId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
        data: {
          myCustomData: 'test',
        },
      },
    ]);

    expectTypeOf(routes.injectUserId).toEqualTypeOf<
      CraftServiceApi<
        'UserId',
        'toProvide',
        {
          $provided: {
            resolve: () => Signal<string>;
          };
        },
        Signal<string>
      >['injectUserId']
    >();
  });

  it('should allow paramsProvider to transform the injected param type', () => {
    const { appRoutes, injectUserId } = craftRoutes([
      {
        path: 'query/:userId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {
          deps: {},
          provided: {},
        },
        paramsProvider: (params) => ({
          userId: computed(() => Number(params().userId)),
        }),
      },
    ]);

    const routeConfig = appRoutes.toRoutes()[0];
    const activatedRoute = createActivatedRouteStub({
      params: {
        userId: '12',
      },
    });
    const injector = createRouteInjector(
      routeConfig.providers,
      activatedRoute.route,
    );
    const userId = runInInjectionContext(injector, () => injectUserId());

    expectTypeOf(userId).toEqualTypeOf<Signal<number>>();
    expect(userId()).toBe(12);
  });

  it('should throw when componentDeps is missing', () => {
    const createRoutes = () =>
      craftRoutes([
        // @ts-expect-error componentDeps is required on route definitions
        {
          path: 'query/:userId',
          loadComponent: async () => null as unknown as Type<unknown>,
        },
      ]);

    expect(createRoutes).toThrow(
      'Route "query/:userId" must define "componentDeps" as an object.',
    );
  });

  it('should remove route params and data keys from component publicProperties', () => {
    type ResolvedComponentDeps = ResolveCraftRouteComponentDeps<{
      path: 'mutation/:userId';
      data: {
        myCustomData: 'test';
      };
      componentDeps: {
        deps: {};
        provided: {};
        publicProperties: {
          userId: () => string | undefined;
          myCustomData: () => string;
          teamId: () => string;
        };
      };
    }>;

    expectTypeOf<ResolvedComponentDeps>().toEqualTypeOf<{
      deps: {};
      provided: {};
      publicProperties: {
        teamId: () => string;
      };
    }>();
  });

  it('should drop publicProperties entirely when every route input is provided', () => {
    type ResolvedComponentDeps = ResolveCraftRouteComponentDeps<{
      path: 'query/:userId';
      componentDeps: {
        deps: {};
        provided: {};
        publicProperties: {
          userId: () => string | undefined;
        };
      };
    }>;

    expectTypeOf<ResolvedComponentDeps>().toEqualTypeOf<{
      deps: {};
      provided: {};
    }>();
  });

  it('should auto provide route params and keep them reactive', () => {
    const { appRoutes, injectUserId } = craftRoutes([
      {
        path: 'query/:userId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as {
          publicProperties: {
            userId: string;
          };
        },
      },
      {
        path: 'mutation/:userId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as {
          publicProperties: {
            userId: string;
          };
        },
      },
    ]);

    const routeConfig = appRoutes.toRoutes()[0];
    const activatedRoute = createActivatedRouteStub({
      params: {
        userId: '12',
      },
    });

    const injector = createRouteInjector(
      routeConfig.providers,
      activatedRoute.route,
    );

    const userId = runInInjectionContext(injector, () => injectUserId());
    expect(userId()).toBe('12');

    activatedRoute.setParams({
      userId: '34',
    });

    expect(userId()).toBe('34');
  });

  it('should auto provide route data and preserve explicit providers', () => {
    const marker = new InjectionToken<string>('marker');
    const { appRoutes, injectMutationUserIdData } = craftRoutes([
      {
        path: 'mutation/:userId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
        data: {
          myCustomData: 'test',
        },
        providers: [
          {
            provide: marker,
            useValue: 'kept',
          },
        ],
      },
    ]);

    const routeConfig = appRoutes.toRoutes()[0];
    const activatedRoute = createActivatedRouteStub({
      params: {
        userId: '5',
      },
      data: {
        myCustomData: 'test',
      },
    });

    expect(routeConfig.providers).toHaveLength(3);

    const injector = createRouteInjector(
      routeConfig.providers,
      activatedRoute.route,
    );

    const routeData = runInInjectionContext(injector, () =>
      injectMutationUserIdData(),
    );

    expect(routeData().myCustomData).toBe('test');
    expect(injector.get(marker)).toBe('kept');

    activatedRoute.setData({
      myCustomData: 'updated',
    });

    expect(routeData().myCustomData).toBe('updated');
  });

  it('should treat auto-provided params and data as valid componentDeps coverage', () => {
    craftRoutes([
      {
        path: 'mutation/:userId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as {
          missingProvider: {
            UserId: unknown;
            MutationUserIdData: unknown;
          };
        },
        data: {
          myCustomData: 'test',
        },
      },
    ]);
  });

  it('should accept branded route providers as componentDeps coverage', () => {
    const { provideCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );

    craftRoutes([
      {
        path: 'counter',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as {
          missingProvider: {
            Counter: unknown;
          };
        },
        providers: [provideCounter()],
      },
    ]);
  });
});

describe('AppRoutes.META_DATA', () => {
  it('should remove matching params / inputs from publicProperties deps', () => {
    @Component({
      selector: 'lib-user',
      standalone: true,
      template: ` Test `,
    })
    class UserComponent {
      userId = input.required<string>();
    }

    type GenDeps_UserComponent = GetDeps<{
      deps: {};
      provided: {};
      publicProperties: {
        userId: () => string;
      };
    }>;

    const { appRoutes } = craftRoutes([
      {
        path: '',
        component: UserComponent,
        componentDeps: {} as GenDeps_UserComponent,
      },
      {
        path: 'query/:userId',
        component: UserComponent,
        componentDeps: {} as GenDeps_UserComponent,
      },
    ]);
    const META_DATA = appRoutes.META_DATA;

    expectTypeOf(META_DATA).toEqualTypeOf<
      readonly [
        {
          path: '';
          deps: {};
          provided: {};
          publicProperties: {
            // no userId here since it's not a route param in this route, so let's persist the original public property type from the componentDeps
            userId: () => string;
          };
        },
        {
          path: 'query/:userId';
          deps: {};
          provided: {};
          publicProperties: {}; // userId is auto-provided from the route param, so it should not be required as a public property
        },
      ]
    >();
  });

  it('should not remove matching inputs from publicProperties deps if type does not match', () => {
    @Component({
      selector: 'lib-user',
      standalone: true,
      template: ` Test `,
    })
    class UserComponent {
      userId = input.required<number>();
    }

    type GenDeps_UserComponent = GetDeps<{
      deps: {};
      provided: {};
      publicProperties: {
        userId: () => number;
      };
    }>;

    const { appRoutes } = craftRoutes([
      {
        path: '',
        component: UserComponent,
        componentDeps: {} as GenDeps_UserComponent,
      },
      {
        path: 'query/:userId',
        component: UserComponent,
        componentDeps: {} as GenDeps_UserComponent,
      },
    ]);
    const META_DATA = appRoutes.META_DATA;

    expectTypeOf(META_DATA).toEqualTypeOf<
      readonly [
        {
          path: '';
          deps: {};
          provided: {};
          publicProperties: {
            // no userId here since it's not a route param in this route, so let's persist the original public property type from the componentDeps
            userId: () => number;
          };
        },
        {
          path: 'query/:userId';
          deps: {};
          provided: {};
          publicProperties: {
            // no userId here since the route param is a string but the component input expects a number, so we should not consider the route param as satisfying the componentDeps requirement and thus not remove it from publicProperties
            userId: () => number;
          };
        },
      ]
    >();
  });

  it('should remove matching params / inputs from publicProperties deps', () => {
    const { injectCounter, provideCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );
    @Component({
      selector: 'lib-user',
      standalone: true,
      template: ` Test `,
    })
    class UserComponent {
      userId = input.required<string>();

      counter = injectCounter();
    }

    type GenDeps_UserComponent = GetDeps<{
      deps: {
        Counter: GetInjectedServiceDependencies<typeof injectCounter>;
      };
      provided: {};
      publicProperties: {
        userId: () => string;
      };
    }>;

    const { appRoutes } = craftRoutes([
      {
        path: '',
        component: UserComponent,
        componentDeps: {} as GenDeps_UserComponent,
      },
      {
        path: 'query/:userId',
        component: UserComponent,
        componentDeps: {} as GenDeps_UserComponent,
        providers: [provideCounter()],
      },
    ]);
    const META_DATA = appRoutes.META_DATA;

    expectTypeOf(META_DATA).toEqualTypeOf<
      readonly [
        {
          path: '';
          deps: {
            Counter: GetInjectedServiceDependencies<typeof injectCounter>;
          };
          provided: {};
          publicProperties: {
            userId: () => string;
          };
        },
        {
          path: 'query/:userId';
          deps: {}; // no more Counter dependency since it's provided in this route, so it should be removed from deps
          provided: {};
          publicProperties: {};
        },
      ]
    >();
  });
});

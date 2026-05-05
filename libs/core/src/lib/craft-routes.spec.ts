import '@angular/compiler';
import {
  Component,
  computed,
  InjectionToken,
  Injector,
  input,
  runInInjectionContext,
  signal,
  Type,
  type Signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import {
  ActivatedRoute,
  type ActivatedRouteSnapshot,
  type CanActivateFn,
  type CanMatchFn,
  type Data,
  type GuardResult,
  type Params,
  type PartialMatchRouteSnapshot,
  type Route,
  type RouterStateSnapshot,
  type UrlSegment,
} from '@angular/router';
import { BehaviorSubject, combineLatest, firstValueFrom, map } from 'rxjs';
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
} from 'vitest';
import {
  craftService,
  GetInjectedServiceDependencies,
  SERVICE_RUNTIME_OVERRIDES,
  type CraftServiceApi,
} from './craft-service';
import { CraftHttpClient, type CraftHttpRequest } from './craft-http-client';
import {
  CraftRouteInjectHelper,
  craftRoutes,
  type ResolveCraftRouteComponentDeps,
} from './craft-routes';
import { GetDeps } from './branded-component/branded-component';

function _injectDemoUserIdParams(): Signal<string> {
  throw new Error('Type-only helper');
}

function _injectDemoTeamIdParams(): Signal<string> {
  throw new Error('Type-only helper');
}

function _injectDemoCraftLazyLayoutTeamIdData(): Signal<{
  readonly someParentRouteData: 'foo';
}> {
  throw new Error('Type-only helper');
}

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

function createNestedActivatedRouteStub(config: {
  parentPath: string;
  childPath: string;
  parentParams?: Params;
  parentData?: Data;
  childParams?: Params;
  childData?: Data;
}) {
  const parentParamsSubject = new BehaviorSubject<Params>(
    config.parentParams ?? {},
  );
  const parentDataSubject = new BehaviorSubject<Data>(config.parentData ?? {});
  const childParamsSubject = new BehaviorSubject<Params>(
    config.childParams ?? {},
  );
  const childDataSubject = new BehaviorSubject<Data>(config.childData ?? {});

  const childRoute = {
    routeConfig: {
      path: config.childPath,
    },
    params: childParamsSubject.asObservable(),
    data: childDataSubject.asObservable(),
    snapshot: {
      params: childParamsSubject.value,
      data: childDataSubject.value,
    },
    children: [],
  } as unknown as ActivatedRoute;

  const parentRoute = {
    routeConfig: {
      path: config.parentPath,
    },
    params: parentParamsSubject.asObservable(),
    data: parentDataSubject.asObservable(),
    snapshot: {
      params: parentParamsSubject.value,
      data: parentDataSubject.value,
    },
    children: [childRoute],
  } as unknown as ActivatedRoute;

  return {
    route: parentRoute,
    childRoute,
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

function configureRouteTestingModule(
  providers: NonNullable<Route['providers']> | undefined,
  activatedRoute: ActivatedRoute,
) {
  TestBed.configureTestingModule({
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

const activatedRouteSnapshotStub = {} as ActivatedRouteSnapshot;
const routerStateSnapshotStub = {} as RouterStateSnapshot;
const partialMatchRouteSnapshotStub = {} as PartialMatchRouteSnapshot;
const urlSegmentsStub = [] as UrlSegment[];

function getCanActivateGuard(route: Route): CanActivateFn {
  const guard = route.canActivate?.[0];

  if (typeof guard !== 'function') {
    throw new Error('Expected route.canActivate[0] to be a function.');
  }

  return guard as CanActivateFn;
}

function getCanMatchGuard(route: Route): CanMatchFn {
  const guard = route.canMatch?.[0];

  if (typeof guard !== 'function') {
    throw new Error('Expected route.canMatch[0] to be a function.');
  }

  return guard as CanMatchFn;
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

beforeEach(() => {
  TestBed.resetTestingModule();
});

describe('craftRoutes', () => {
  it('should expose typed inject helpers for params and route data', () => {
    const routes = craftRoutes('player', [
      {
        path: 'mutation/:userId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
        data: {
          myCustomData: 'test',
        },
      },
    ]);

    expect(routes.playerRoutes.name).toBe('player');
    expectTypeOf(routes.playerRoutes.name).toEqualTypeOf<'player'>();

    expectTypeOf(routes.injectPlayerUserIdParams).toEqualTypeOf<
      CraftRouteInjectHelper<'PlayerUserIdParams', Signal<string>>
    >();
  });

  it('should allow paramsProvider to transform the injected param type', () => {
    const { testRoutes: appRoutes, injectTestUserIdParams: injectUserId } =
      craftRoutes('test', [
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

  it('should accept craft-aware loadChildren without componentDeps and defer lazy route conversion', async () => {
    let loaded = false;
    const childRoutes = craftRoutes('child', [
      {
        path: 'details/:teamId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
      },
    ]);
    const { parentRoutes: appRoutes } = craftRoutes('parent', [
      {
        path: 'users/:userId',
        loadChildren: () => {
          loaded = true;
          return childRoutes.childRoutes;
        },
      },
    ]);

    const routeConfig = appRoutes.toRoutes()[0];

    expect(loaded).toBe(false);
    expect(routeConfig.loadChildren).toBeTypeOf('function');

    const lazyRoutes = (await routeConfig.loadChildren?.()) as
      | Route[]
      | undefined;

    expect(loaded).toBe(true);
    expect(lazyRoutes).toHaveLength(1);
    expect(lazyRoutes?.[0]?.path).toBe('details/:teamId');
  });

  it('should accept component routes that also lazy-load children', async () => {
    let loaded = false;
    const childRoutes = craftRoutes('child', [
      {
        path: 'details/:teamId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
      },
    ]);
    const { parentRoutes: appRoutes, injectParentUserIdParams: injectUserId } =
      craftRoutes('parent', [
        {
          path: 'users/:userId',
          loadComponent: async () => null as unknown as Type<unknown>,
          componentDeps: {},
          loadChildren: () => {
            loaded = true;
            return childRoutes.childRoutes;
          },
        },
      ]);

    const routeConfig = appRoutes.toRoutes()[0];

    expectTypeOf(injectUserId).toBeFunction();
    expect(routeConfig.loadComponent).toBeTypeOf('function');
    expect(routeConfig.loadChildren).toBeTypeOf('function');
    expect(loaded).toBe(false);

    const lazyRoutes = (await routeConfig.loadChildren?.()) as
      | Route[]
      | undefined;

    expect(loaded).toBe(true);
    expect(lazyRoutes).toHaveLength(1);
    expect(lazyRoutes?.[0]?.path).toBe('details/:teamId');
  });

  it('should resolve params from the matching child ActivatedRoute in lazy contexts', () => {
    const {
      testRoutes: appRoutes,
      injectTestUserIdParams: injectUserId,
      injectTestUsersUserIdData: injectUsersUserIdData,
    } = craftRoutes('test', [
      {
        path: 'users/:userId',
        data: {
          title: 'Lazy route',
        },
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
      },
    ]);
    const routeConfig = appRoutes.toRoutes()[0];
    const activatedRoute = createNestedActivatedRouteStub({
      parentPath: 'craft/lazy-layout',
      childPath: 'users/:userId',
      childParams: {
        userId: '42',
      },
      childData: {
        title: 'Lazy route',
      },
    });
    const injector = createRouteInjector(
      routeConfig.providers,
      activatedRoute.route,
    );

    const userId = runInInjectionContext(injector, () => injectUserId());
    const routeData = runInInjectionContext(injector, () =>
      injectUsersUserIdData(),
    );

    expect(userId()).toBe('42');
    expect(routeData().title).toBe('Lazy route');
  });

  it('should accept craft canActivate/canMatch guard contracts', () => {
    const pending = signal<GuardResult | undefined>(undefined);

    craftRoutes('test', [
      {
        path: 'signal-guard',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
        canActivate: () => pending,
      },
      {
        path: 'observable-guard',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
        canActivate: () => {
          return new BehaviorSubject<GuardResult | undefined>(
            undefined,
          ).asObservable();
        },
      },
      {
        path: 'match-guard',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
        canMatch: () => {
          return true;
        },
      },
      {
        path: 'invalid-match-guard',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
        // @ts-expect-error canMatch does not accept Observable results
        canMatch: () => new BehaviorSubject(true).asObservable(),
      },
    ]);
  });

  it('should throw when componentDeps is missing', () => {
    const createRoutes = () =>
      craftRoutes('test', [
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

  it('should keep lazy child inject helpers scoped to the lazy module result', () => {
    const childRoutes = craftRoutes('child', [
      {
        path: 'details/:teamId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
      },
    ]);
    const parentRoutes = craftRoutes('parent', [
      {
        path: 'users',
        loadChildren: () => childRoutes.childRoutes,
      },
    ]);

    expect(childRoutes.injectChildTeamIdParams).toBeTypeOf('function');
    type LazyHelperShouldStayLocal =
      // @ts-expect-error lazy child helpers should stay scoped to the lazy routes module
      typeof parentRoutes.injectParentTeamIdParams;
  });

  it('should keep parent route helper scoping inside lazy child metadata', () => {
    const parentRoutes = craftRoutes('parent', [
      {
        path: 'layout/:teamId',
        data: {
          title: 'Layout',
        },
        loadChildren: () => childRoutes.childRoutes,
      },
      {
        path: 'other/:userId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
      },
    ]);

    type ChildRouteDeps = GetDeps<{
      deps: {};
      propertiesDeps: {
        parentTeamId: {
          ParentTeamIdParams: ReturnType<
            typeof parentRoutes.injectParentTeamIdParams
          >;
        };
        parentData: {
          ParentLayoutTeamIdData: ReturnType<
            typeof parentRoutes.injectParentLayoutTeamIdData
          >;
        };
        invalidUserId: {
          ParentUserIdParams: ReturnType<
            typeof parentRoutes.injectParentUserIdParams
          >;
        };
      };
      provided: {};
      publicProperties: {};
    }>;

    const childRoutes = craftRoutes('child', [
      {
        path: 'users/:userId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as ChildRouteDeps,
      },
    ]);

    expectTypeOf(parentRoutes.parentRoutes.META_DATA).toEqualTypeOf<
      readonly [
        {
          path: 'layout/:teamId';
        },
        {
          path: 'layout/:teamId/users/:userId';
          provided: {};
          deps: {};
          publicProperties: {};
        },
        {
          path: 'other/:userId';
        },
      ]
    >();
  });

  it('should keep parent route helper scoping inside async lazy child metadata', () => {
    const parentRoutes = craftRoutes('parent', [
      {
        path: 'layout/:teamId',
        data: {
          title: 'Layout',
        },
        loadChildren: async () => childRoutes.childRoutes,
      },
      {
        path: 'other/:userId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
      },
    ]);

    type ChildRouteDeps = GetDeps<{
      deps: {};
      propertiesDeps: {
        parentTeamId: {
          ParentTeamIdParams: ReturnType<
            typeof parentRoutes.injectParentTeamIdParams
          >;
        };
        parentData: {
          ParentLayoutTeamIdData: ReturnType<
            typeof parentRoutes.injectParentLayoutTeamIdData
          >;
        };
        invalidUserId: {
          ParentUserIdParams: ReturnType<
            typeof parentRoutes.injectParentUserIdParams
          >;
        };
      };
      provided: {};
      publicProperties: {};
    }>;

    const childRoutes = craftRoutes('child', [
      {
        path: 'users/:userId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as ChildRouteDeps,
      },
    ]);

    expectTypeOf(parentRoutes.parentRoutes.META_DATA).toEqualTypeOf<
      readonly [
        {
          path: 'layout/:teamId';
        },
        {
          path: 'layout/:teamId/users/:userId';
          provided: {};
          deps: {};
          publicProperties: {};
        },
        {
          path: 'other/:userId';
        },
      ]
    >();
  });

  it('should keep parent route helper scoping with destructured lazy route apps', () => {
    const parentRoutes = craftRoutes('parent', [
      {
        path: 'layout/:teamId',
        data: {
          title: 'Layout',
        },
        loadChildren: async () => lazyRoutes,
      },
      {
        path: 'other/:userId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
      },
    ]);

    type ChildRouteDeps = GetDeps<{
      deps: {};
      propertiesDeps: {
        parentTeamId: {
          ParentTeamIdParams: ReturnType<
            typeof parentRoutes.injectParentTeamIdParams
          >;
        };
        parentData: {
          ParentLayoutTeamIdData: ReturnType<
            typeof parentRoutes.injectParentLayoutTeamIdData
          >;
        };
        invalidUserId: {
          ParentUserIdParams: ReturnType<
            typeof parentRoutes.injectParentUserIdParams
          >;
        };
      };
      provided: {};
      publicProperties: {};
    }>;

    const { childRoutes: lazyRoutes } = craftRoutes('child', [
      {
        path: 'users/:userId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as ChildRouteDeps,
      },
    ]);

    expectTypeOf(parentRoutes.parentRoutes.META_DATA).toEqualTypeOf<
      readonly [
        {
          path: 'layout/:teamId';
        },
        {
          path: 'layout/:teamId/users/:userId';
          provided: {};
          deps: {};
          publicProperties: {};
        },
        {
          path: 'other/:userId';
        },
      ]
    >();
  });

  it('should preserve demo lazy child missing providers in flattened metadata', () => {
    type DemoLazyLayoutChildDeps = GetDeps<{
      deps: {};
      provided: {};
      publicProperties: {};
      missingProvider: {
        DemoUserIdParams: ReturnType<typeof _injectDemoUserIdParams>;
      };
    }>;

    const { lazyLayoutRoutes } = craftRoutes('lazyLayout', [
      {
        path: 'users/:userId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as DemoLazyLayoutChildDeps,
      },
    ]);

    const { demoRoutes: _demoRoutes } = craftRoutes('demo', [
      {
        path: 'craft/lazy-layout/:teamId',
        loadChildren: async () => lazyLayoutRoutes,
      },
    ]);

    type DemoLazyLayoutChildMeta = Extract<
      (typeof _demoRoutes.META_DATA)[number],
      {
        path: 'craft/lazy-layout/:teamId/users/:userId';
      }
    >;

    expectTypeOf<DemoLazyLayoutChildMeta>().toEqualTypeOf<{
      path: 'craft/lazy-layout/:teamId/users/:userId';
      deps: {};
      provided: {};
      publicProperties: {};
      missingProvider: {
        DemoUserIdParams: ReturnType<typeof _injectDemoUserIdParams>;
      };
    }>();
  });

  it('should remove lazy child missing providers satisfied by the direct parent route providers', () => {
    const { provideCounter, injectCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );

    type ChildRouteDeps = GetDeps<{
      deps: {};
      provided: {};
      publicProperties: {};
      missingProvider: {
        Counter: ReturnType<typeof injectCounter>;
      };
    }>;

    const { childRoutes } = craftRoutes('child', [
      {
        path: 'users/:userId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as ChildRouteDeps,
      },
    ]);

    const { parentRoutes } = craftRoutes('parent', [
      {
        path: 'layout/:teamId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
        providers: [provideCounter()],
        loadChildren: async () => childRoutes,
      },
    ]);

    type LazyChildMeta = Extract<
      (typeof parentRoutes.META_DATA)[number],
      {
        path: 'layout/:teamId/users/:userId';
      }
    >;

    expectTypeOf<LazyChildMeta>().toEqualTypeOf<{
      path: 'layout/:teamId/users/:userId';
      deps: {};
      provided: {};
      publicProperties: {};
    }>();
  });

  it('should not treat sibling route providers as covering lazy child missing providers', () => {
    const { provideCounter, injectCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );

    type ChildRouteDeps = GetDeps<{
      deps: {};
      provided: {};
      publicProperties: {};
      missingProvider: {
        Counter: ReturnType<typeof injectCounter>;
      };
    }>;

    const { childRoutes } = craftRoutes('child', [
      {
        path: 'users/:userId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as ChildRouteDeps,
      },
    ]);

    const { parentRoutes } = craftRoutes('parent', [
      {
        path: 'other',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
        providers: [provideCounter()],
      },
      {
        path: 'layout/:teamId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
        loadChildren: async () => childRoutes,
      },
    ]);

    type LazyChildMeta = Extract<
      (typeof parentRoutes.META_DATA)[number],
      {
        path: 'layout/:teamId/users/:userId';
      }
    >;

    expectTypeOf<LazyChildMeta>().toEqualTypeOf<{
      path: 'layout/:teamId/users/:userId';
      deps: {};
      provided: {};
      publicProperties: {};
      missingProvider: {
        Counter: ReturnType<typeof injectCounter>;
      };
    }>();
  });

  it('should merge parent loadComponent missing providers with lazy child missing providers', () => {
    const { injectCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );
    const { injectPermissions } = craftService(
      { name: 'Permissions', scope: 'toProvide' },
      () => ({
        allow: true,
      }),
    );

    type ParentRouteDeps = GetDeps<{
      deps: {};
      provided: {};
      publicProperties: {};
      missingProvider: {
        Counter: GetInjectedServiceDependencies<typeof injectCounter>;
      };
    }>;

    type ChildRouteDeps = GetDeps<{
      deps: {};
      provided: {};
      publicProperties: {};
      missingProvider: {
        Permissions: GetInjectedServiceDependencies<typeof injectPermissions>;
      };
    }>;

    const { childRoutes } = craftRoutes('child', [
      {
        path: 'users/:userId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as ChildRouteDeps,
      },
    ]);

    const { parentRoutes } = craftRoutes('parent', [
      {
        path: 'layout/:teamId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as ParentRouteDeps,
        loadChildren: async () => childRoutes,
      },
    ]);

    expectTypeOf(parentRoutes.META_DATA).toEqualTypeOf<
      readonly [
        {
          path: 'layout/:teamId';
          deps: {};
          provided: {};
          publicProperties: {};
          missingProvider: {
            Counter: GetInjectedServiceDependencies<typeof injectCounter>;
          };
        },
        {
          path: 'layout/:teamId/users/:userId';
          deps: {};
          provided: {};
          publicProperties: {};
          missingProvider: {
            Counter: GetInjectedServiceDependencies<typeof injectCounter>;
            Permissions: GetInjectedServiceDependencies<
              typeof injectPermissions
            >;
          };
        },
      ]
    >();
  });

  it('should place flattened lazy child metadata after the parent entry in mixed route tuples', () => {
    const { injectCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );
    const { injectPermissions } = craftService(
      { name: 'Permissions', scope: 'toProvide' },
      () => ({
        allow: true,
      }),
    );

    type ChildRouteDeps = GetDeps<{
      deps: {};
      provided: {};
      publicProperties: {};
      missingProvider: {
        Counter: GetInjectedServiceDependencies<typeof injectCounter>;
        Permissions: GetInjectedServiceDependencies<typeof injectPermissions>;
      };
    }>;

    const { childRoutes } = craftRoutes('child', [
      {
        path: 'users/:userId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as ChildRouteDeps,
      },
    ]);

    const { demoRoutes } = craftRoutes('demo', [
      {
        path: 'query/:userId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
      },
      {
        path: 'craft/lazy-layout/:teamId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
        loadChildren: async () => childRoutes,
      },
    ]);

    type LazyLayoutMetaAtIndexOne = (typeof demoRoutes.META_DATA)[1];
    type LazyLayoutChildMetaAtIndexTwo = (typeof demoRoutes.META_DATA)[2];

    expectTypeOf<LazyLayoutMetaAtIndexOne>().toEqualTypeOf<{
      path: 'craft/lazy-layout/:teamId';
    }>();

    expectTypeOf<LazyLayoutChildMetaAtIndexTwo>().toEqualTypeOf<{
      path: 'craft/lazy-layout/:teamId/users/:userId';
      deps: {};
      provided: {};
      publicProperties: {};
      missingProvider: {
        Counter: GetInjectedServiceDependencies<typeof injectCounter>;
        Permissions: GetInjectedServiceDependencies<typeof injectPermissions>;
      };
    }>();
  });

  it('should reproduce demo lazy child missing providers on the flattened child entry, not on index one', () => {
    type DemoLazyLayoutChildDeps = GetDeps<{
      deps: {};
      provided: {};
      publicProperties: {};
      missingProvider: {
        DemoCraftLazyLayoutTeamIdData: ReturnType<
          typeof _injectDemoCraftLazyLayoutTeamIdData
        >;
        DemoTeamIdParams: ReturnType<typeof _injectDemoTeamIdParams>;
        DemoUserIdParams: ReturnType<typeof _injectDemoUserIdParams>;
      };
    }>;

    const { lazyLayoutRoutes } = craftRoutes('lazyLayout', [
      {
        path: 'users/:userId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as DemoLazyLayoutChildDeps,
      },
    ]);

    const { demoRoutes } = craftRoutes('demo', [
      {
        path: 'query/:userId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
      },
      {
        path: 'craft/lazy-layout/:teamId',
        data: {
          someParentRouteData: 'foo' as const,
        },
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
        loadChildren: async () => lazyLayoutRoutes,
      },
    ]);

    type LazyLayoutParentMetaAtIndexOne = (typeof demoRoutes.META_DATA)[1];
    type FlattenedLazyLayoutChildMeta = Extract<
      (typeof demoRoutes.META_DATA)[number],
      {
        path: 'craft/lazy-layout/:teamId/users/:userId';
      }
    >;

    // @ts-expect-error index 1 is the parent lazy-layout route entry, so it does not expose child missingProvider entries
    expectTypeOf<LazyLayoutParentMetaAtIndexOne>().toEqualTypeOf<{
      path: 'craft/lazy-layout/:teamId';
      missingProvider: {
        DemoCraftLazyLayoutTeamIdData: ReturnType<
          typeof _injectDemoCraftLazyLayoutTeamIdData
        >;
        DemoTeamIdParams: ReturnType<typeof _injectDemoTeamIdParams>;
        DemoUserIdParams: ReturnType<typeof _injectDemoUserIdParams>;
      };
    }>();

    expectTypeOf<FlattenedLazyLayoutChildMeta>().toEqualTypeOf<{
      path: 'craft/lazy-layout/:teamId/users/:userId';
      deps: {};
      provided: {};
      publicProperties: {};
      missingProvider: {
        DemoUserIdParams: ReturnType<typeof _injectDemoUserIdParams>;
      };
    }>();
  });

  it('should expose httpDeps from component propertiesDeps', () => {
    type User = { id: string };

    const { injectUsersApi } = craftService(
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

    type HttpRouteDeps = GetDeps<{
      deps: {};
      propertiesDeps: {
        usersApi: {
          UsersApi: GetInjectedServiceDependencies<typeof injectUsersApi>;
        };
      };
      provided: {};
      publicProperties: {};
    }>;

    const { appRoutes } = craftRoutes('app', [
      {
        path: 'users',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as HttpRouteDeps,
      },
    ]);

    expectTypeOf(appRoutes.META_DATA).toEqualTypeOf<
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

  it('should merge parent and lazy child httpDeps in flattened metadata', () => {
    type ParentResponse = { teamId: string };
    type ChildResponse = { id: string };
    type ChildPayload = { id: string };

    const { injectLayoutApi } = craftService(
      { name: 'LayoutApi', scope: 'global' },
      function* () {
        const getLayout = yield* CraftHttpClient.get(({ response }) => ({
          url: '/api/layout',
          success: response<ParentResponse>(),
        }));

        return {
          getLayout,
        };
      },
    );

    const { injectChildApi } = craftService(
      { name: 'ChildApi', scope: 'global' },
      function* () {
        const createUser = yield* CraftHttpClient.post(({ response }) => ({
          url: '/api/layout/users',
          payload: { id: '' } as ChildPayload,
          success: response<ChildResponse>(),
        }));

        return {
          createUser,
        };
      },
    );

    type ParentRouteDeps = GetDeps<{
      deps: {};
      propertiesDeps: {
        layoutApi: {
          LayoutApi: GetInjectedServiceDependencies<typeof injectLayoutApi>;
        };
      };
      provided: {};
      publicProperties: {};
    }>;

    type ChildRouteDeps = GetDeps<{
      deps: {};
      propertiesDeps: {
        childApi: {
          ChildApi: GetInjectedServiceDependencies<typeof injectChildApi>;
        };
      };
      provided: {};
      publicProperties: {};
    }>;

    const { childRoutes } = craftRoutes('child', [
      {
        path: 'details',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as ChildRouteDeps,
      },
    ]);

    const { parentRoutes } = craftRoutes('parent', [
      {
        path: 'layout',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as ParentRouteDeps,
        loadChildren: async () => childRoutes,
      },
    ]);

    expectTypeOf(parentRoutes.META_DATA).toEqualTypeOf<
      readonly [
        {
          path: 'layout';
          deps: {};
          provided: {};
          publicProperties: {};
          httpDeps: {
            'GET /api/layout': CraftHttpRequest<
              'GET',
              '/api/layout',
              ParentResponse,
              undefined,
              undefined
            >;
          };
        },
        {
          path: 'layout/details';
          deps: {};
          provided: {};
          publicProperties: {};
          httpDeps: {
            'GET /api/layout': CraftHttpRequest<
              'GET',
              '/api/layout',
              ParentResponse,
              undefined,
              undefined
            >;
            'POST /api/layout/users': CraftHttpRequest<
              'POST',
              '/api/layout/users',
              ChildResponse,
              undefined,
              ChildPayload
            >;
          };
        },
      ]
    >();
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

  it('should map unmatched publicProperties to route input errors', () => {
    const routes = craftRoutes('test', [
      {
        path: 'query/:userId',
        loadComponent: async () => null as unknown as Type<unknown>,
        data: {
          myCustomData: 'test',
        },
        componentDeps: {} as {
          publicProperties: {
            userId: () => string;
            myCustomData: () => string;
            teamId: () => string;
          };
        },
      },
    ]);

    expectTypeOf(routes).toEqualTypeOf<{
      'query/:userId': {
        teamId: 'The input teamId is not matching any route param or data property';
      };
    }>();
  });

  it('should auto provide route params and keep them reactive', () => {
    const { testRoutes: appRoutes, injectTestUserIdParams: injectUserId } =
      craftRoutes('test', [
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
    const {
      testRoutes: appRoutes,
      injectTestMutationUserIdData: injectMutationUserIdData,
    } = craftRoutes('test', [
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
    craftRoutes('test', [
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

    craftRoutes('test', [
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

  it('should wrap craft guards into Angular guard arrays', () => {
    const { testRoutes: appRoutes } = craftRoutes('test', [
      {
        path: 'guard',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
        canActivate: () => true,
        canMatch: () => true,
      },
    ]);

    const routeConfig = appRoutes.toRoutes()[0];

    expect(routeConfig.canActivate).toHaveLength(1);
    expect(routeConfig.canMatch).toHaveLength(1);
  });

  it('should wait for a defined signal result in canActivate and then accept', async () => {
    const guardResult = signal<GuardResult | undefined>(undefined);
    const { testRoutes: appRoutes } = craftRoutes('test', [
      {
        path: 'guard',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
        canActivate: () => guardResult,
      },
    ]);

    const routeConfig = appRoutes.toRoutes()[0];
    const activatedRoute = createActivatedRouteStub();
    const canActivate = getCanActivateGuard(routeConfig);
    configureRouteTestingModule(routeConfig.providers, activatedRoute.route);
    const result = TestBed.runInInjectionContext(() =>
      canActivate(activatedRouteSnapshotStub, routerStateSnapshotStub),
    );
    const guardPromise = firstValueFrom(result as any);
    let resolved = false;

    guardPromise.then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);

    guardResult.set(true);

    expect(await guardPromise).toBe(true);
  });

  it('should wait for a defined signal result in canActivate and then reject', async () => {
    const guardResult = signal<GuardResult | undefined>(undefined);
    const { testRoutes: appRoutes } = craftRoutes('test', [
      {
        path: 'guard',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
        canActivate: () => guardResult,
      },
    ]);

    const routeConfig = appRoutes.toRoutes()[0];
    const activatedRoute = createActivatedRouteStub();
    const canActivate = getCanActivateGuard(routeConfig);
    configureRouteTestingModule(routeConfig.providers, activatedRoute.route);
    const result = TestBed.runInInjectionContext(() =>
      canActivate(activatedRouteSnapshotStub, routerStateSnapshotStub),
    );
    const guardPromise = firstValueFrom(result as any);
    let resolved = false;

    guardPromise.then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);

    guardResult.set(false);

    expect(await guardPromise).toBe(false);
  });

  it('should allow canActivate generators to yield multiple services and return an observable', async () => {
    const authAccess$ = new BehaviorSubject(true);
    const entityOperational$ = new BehaviorSubject(true);
    const { AuthToYield, provideAuth } = craftService(
      { name: 'Auth', scope: 'toProvide' },
      () => ({
        canAccess$: authAccess$.asObservable(),
      }),
    );
    const { EntityToYield, provideEntity } = craftService(
      { name: 'Entity', scope: 'toProvide' },
      () => ({
        isOperational$: entityOperational$.asObservable(),
      }),
    );
    const { testRoutes: appRoutes } = craftRoutes('test', [
      {
        path: 'guard',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
        providers: [provideAuth(), provideEntity()],
        canActivate: function* () {
          const auth = yield* AuthToYield();
          const entity = yield* EntityToYield();

          return combineLatest([auth.canAccess$, entity.isOperational$]).pipe(
            map(([canAccess, isOperational]) => canAccess && isOperational),
          );
        },
      },
    ]);

    const routeConfig = appRoutes.toRoutes()[0];
    const activatedRoute = createActivatedRouteStub();
    const injector = createRouteInjector(
      routeConfig.providers,
      activatedRoute.route,
    );
    const canActivate = getCanActivateGuard(routeConfig);
    const result = runInInjectionContext(injector, () =>
      canActivate(activatedRouteSnapshotStub, routerStateSnapshotStub),
    );

    expect(await firstValueFrom(result as any)).toBe(true);
  });

  it('should allow canMatch generators to yield services and return a synchronous result', () => {
    const { PermissionsToYield, providePermissions } = craftService(
      { name: 'Permissions', scope: 'toProvide' },
      () => ({
        allow: true,
      }),
    );
    const { testRoutes: appRoutes } = craftRoutes('test', [
      {
        path: 'guard',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
        providers: [providePermissions()],
        canMatch: function* () {
          const permissions = yield* PermissionsToYield();

          return permissions.allow;
        },
      },
    ]);

    const routeConfig = appRoutes.toRoutes()[0];
    const activatedRoute = createActivatedRouteStub();
    const injector = createRouteInjector(
      routeConfig.providers,
      activatedRoute.route,
    );
    const canMatch = getCanMatchGuard(routeConfig);

    const result = runInInjectionContext(injector, () =>
      canMatch(routeConfig, urlSegmentsStub, partialMatchRouteSnapshotStub),
    );

    expect(result).toBe(true);
  });

  it('should throw when canMatch returns an observable', () => {
    const { testRoutes: appRoutes } = craftRoutes('test', [
      {
        path: 'guard',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
        canMatch: (() =>
          new BehaviorSubject<GuardResult | undefined>(
            true,
          ).asObservable()) as unknown as never,
      },
    ]);

    const routeConfig = appRoutes.toRoutes()[0];
    const activatedRoute = createActivatedRouteStub();
    const injector = createRouteInjector(
      routeConfig.providers,
      activatedRoute.route,
    );
    const canMatch = getCanMatchGuard(routeConfig);

    expect(() =>
      runInInjectionContext(injector, () =>
        canMatch(routeConfig, urlSegmentsStub, partialMatchRouteSnapshotStub),
      ),
    ).toThrow(
      'Route "guard" canMatch guard must return a synchronous GuardResult.',
    );
  });

  it('should throw when canActivate synchronously returns undefined', () => {
    const { testRoutes: appRoutes } = craftRoutes('test', [
      {
        path: 'guard',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
        canActivate: (() => undefined) as unknown as never,
      },
    ]);

    const routeConfig = appRoutes.toRoutes()[0];
    const activatedRoute = createActivatedRouteStub();
    const injector = createRouteInjector(
      routeConfig.providers,
      activatedRoute.route,
    );
    const canActivate = getCanActivateGuard(routeConfig);

    expect(() =>
      runInInjectionContext(injector, () =>
        canActivate(activatedRouteSnapshotStub, routerStateSnapshotStub),
      ),
    ).toThrow(
      'Route "guard" canActivate guard must not synchronously return undefined.',
    );
  });
});

describe('AppRoutes.META_DATA', () => {
  it('should throw is an input is not directly provided', () => {
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

    const routes = craftRoutes('test', [
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

    expectTypeOf(routes).toEqualTypeOf<{
      '': {
        userId: 'The input userId is not matching any route param or data property';
      };
    }>();
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

    const routes = craftRoutes('test', [
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

    expectTypeOf(routes).toEqualTypeOf<{
      '': {
        userId: 'The input userId is not matching any route param or data property';
      };
      'query/:userId': {
        userId: 'The input userId is not matching any route param or data property';
      };
    }>();
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

    const { testRoutes: appRoutes } = craftRoutes('test', [
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
          path: 'query/:userId';
          provided: {};
          deps: {};
          publicProperties: {};
        },
      ]
    >();
  });

  it('should not throw an error if a provider is missing,', () => {
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

    const { testRoutes: appRoutes } = craftRoutes('test', [
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
          path: 'query/:userId';
          provided: {};
          deps: {
            Counter: {
              scope: 'toProvide';
              browserBoundary: false;
              dependencies: {};
            };
          };
          missingProvider: {
            Counter: {
              scope: 'toProvide';
              browserBoundary: false;
              dependencies: {};
            };
          };
          publicProperties: {};
        },
      ]
    >();
  });

  it('should include generator guard deps in META_DATA', () => {
    const { injectCounter, CounterToYield } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );

    type GuardRouteDeps = GetDeps<{
      provided: {};
      publicProperties: {};
    }>;

    const { testRoutes: appRoutes } = craftRoutes('test', [
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

    expectTypeOf(appRoutes.META_DATA).toEqualTypeOf<
      readonly [
        {
          path: 'counter';
          deps: {
            Counter: GetInjectedServiceDependencies<typeof injectCounter>;
          };
          provided: {};
          publicProperties: {};
        },
      ]
    >();
  });

  it('should remove generator guard deps when satisfied by route providers', () => {
    const { CounterToYield, provideCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );

    type GuardRouteDeps = GetDeps<{
      provided: {};
      publicProperties: {};
    }>;

    const { testRoutes: appRoutes } = craftRoutes('test', [
      {
        path: 'counter',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as GuardRouteDeps,
        providers: [provideCounter()],
        canActivate: function* () {
          yield* CounterToYield();
          return true;
        },
      },
    ]);

    expectTypeOf(appRoutes.META_DATA).toEqualTypeOf<
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

  it('should not add deps to META_DATA for non-generator canActivate guards', () => {
    type GuardRouteDeps = GetDeps<{
      provided: {};
      publicProperties: {};
    }>;

    const { testRoutes: appRoutes } = craftRoutes('test', [
      {
        path: 'counter',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as GuardRouteDeps,
        canActivate: () => true,
      },
    ]);

    expectTypeOf(appRoutes.META_DATA).toEqualTypeOf<
      readonly [
        {
          path: 'counter';
          provided: {};
          publicProperties: {};
        },
      ]
    >();
  });

  it('should flatten lazy route metadata and inherit providers, params and data', () => {
    const { injectCounter, provideCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );

    type ChildRouteDeps = GetDeps<{
      deps: {
        Counter: GetInjectedServiceDependencies<typeof injectCounter>;
      };
      provided: {};
      publicProperties: {
        sectionTitle: () => string;
        userId: () => string;
      };
    }>;

    const childRoutes = craftRoutes('child', [
      {
        path: 'details',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as ChildRouteDeps,
      },
    ]);
    const { parentRoutes: appRoutes } = craftRoutes('parent', [
      {
        path: 'users/:userId',
        data: {
          sectionTitle: 'Users',
        },
        loadChildren: () => childRoutes.details,
        providers: [provideCounter()],
      },
    ]);

    expectTypeOf(appRoutes.META_DATA).toEqualTypeOf<
      readonly [
        {
          path: 'users/:userId';
        },
      ]
    >();
  });
});

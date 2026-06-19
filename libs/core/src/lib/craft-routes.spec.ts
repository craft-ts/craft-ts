import '@angular/compiler';
import {
  Component,
  computed,
  EnvironmentInjector,
  inject,
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
  provideRouter,
  type ActivatedRouteSnapshot,
  type CanActivateFn,
  type CanMatchFn,
  type Data,
  type GuardResult,
  type Params,
  type PartialMatchRouteSnapshot,
  type Route,
  Router,
  type RouterStateSnapshot,
  type UrlSegment,
  UrlTree,
} from '@angular/router';
import {
  BehaviorSubject,
  combineLatest,
  firstValueFrom,
  map,
  type Observable,
} from 'rxjs';
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import { Console, injectConsoleService } from './browser-boundaries';
import { FN_WRAPPER } from './fn-wrapper';
import { craftMethod } from './craft-method';
import {
  abstract,
  craftService,
  GetInjectedServiceDependencies,
  SERVICE_RUNTIME_OVERRIDES,
  ɵcreateHostTaggedInjector,
  type CraftServiceApi,
} from './craft-service';
import { CraftHttpClient, type CraftHttpRequest } from './craft-http-client';
import { queryParam } from './query-param';
import {
  CraftRouteInjectHelper,
  craftCanActivate,
  craftCanMatch,
  craftRoutes,
  craftRoute,
  type ResolveCraftRouteComponentDeps,
} from './craft-routes';
import { craftGen } from './craft-gen';
import { craftException } from './craft-exception';
import { GetDeps } from './branded-component/branded-component';
import { HOST_TAG_LIST, injectHostName, provideHostName } from './host-tag';

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
    queryParams?: Params;
  } = {},
) {
  const paramsSubject = new BehaviorSubject<Params>(initial.params ?? {});
  const dataSubject = new BehaviorSubject<Data>(initial.data ?? {});
  const queryParamsSubject = new BehaviorSubject<Params>(
    initial.queryParams ?? {},
  );

  const snapshot = {
    params: paramsSubject.value,
    data: dataSubject.value,
    queryParams: queryParamsSubject.value,
  };

  return {
    route: {
      params: paramsSubject.asObservable(),
      data: dataSubject.asObservable(),
      queryParams: queryParamsSubject.asObservable(),
      snapshot,
      parent: null,
    } as ActivatedRoute,
    setParams(params: Params) {
      snapshot.params = params;
      paramsSubject.next(params);
    },
    setData(data: Data) {
      snapshot.data = data;
      dataSubject.next(data);
    },
    setQueryParams(queryParams: Params) {
      snapshot.queryParams = queryParams;
      queryParamsSubject.next(queryParams);
    },
  };
}

function createNestedActivatedRouteStub(config: {
  parentPath: string;
  childPath: string;
  parentParams?: Params;
  parentData?: Data;
  parentQueryParams?: Params;
  childParams?: Params;
  childData?: Data;
  childQueryParams?: Params;
}) {
  const parentParamsSubject = new BehaviorSubject<Params>(
    config.parentParams ?? {},
  );
  const parentDataSubject = new BehaviorSubject<Data>(config.parentData ?? {});
  const parentQueryParamsSubject = new BehaviorSubject<Params>(
    config.parentQueryParams ?? {},
  );
  const childParamsSubject = new BehaviorSubject<Params>(
    config.childParams ?? {},
  );
  const childDataSubject = new BehaviorSubject<Data>(config.childData ?? {});
  const childQueryParamsSubject = new BehaviorSubject<Params>(
    config.childQueryParams ?? {},
  );

  const childRoute = {
    routeConfig: {
      path: config.childPath,
    },
    params: childParamsSubject.asObservable(),
    data: childDataSubject.asObservable(),
    queryParams: childQueryParamsSubject.asObservable(),
    snapshot: {
      params: childParamsSubject.value,
      data: childDataSubject.value,
      queryParams: childQueryParamsSubject.value,
    },
    children: [],
  } as unknown as ActivatedRoute;

  const parentRoute = {
    routeConfig: {
      path: config.parentPath,
    },
    params: parentParamsSubject.asObservable(),
    data: parentDataSubject.asObservable(),
    queryParams: parentQueryParamsSubject.asObservable(),
    snapshot: {
      params: parentParamsSubject.value,
      data: parentDataSubject.value,
      queryParams: parentQueryParamsSubject.value,
    },
    children: [childRoute],
    parent: null,
  } as unknown as ActivatedRoute;

  (childRoute as ActivatedRoute & { parent?: ActivatedRoute }).parent =
    parentRoute;

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
  parent?: Injector,
): Injector {
  return Injector.create({
    parent,
    providers: [
      {
        provide: ActivatedRoute,
        useValue: activatedRoute,
      },
      {
        provide: SERVICE_RUNTIME_OVERRIDES,
        useValue: new Map(),
      },
      {
        provide: FN_WRAPPER,
        useValue: [],
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

  it('should expose typed inject helpers for route queryParams', () => {
    const listQueryParams = () =>
      queryParam(
        {
          state: {
            page: {
              fallbackValue: 1,
              parse: (value: string) => parseInt(value, 10),
              serialize: (value: number) => String(value),
            },
            pageSize: {
              fallbackValue: 10,
              parse: (value: string) => parseInt(value, 10),
              serialize: (value: number) => String(value),
            },
          },
        },
        ({ set, update, patch, reset }) => ({
          set,
          update,
          patch,
          reset,
        }),
      );

    const routes = craftRoutes('player', [
      {
        path: 'list',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
        queryParams: listQueryParams,
      },
    ]);

    expectTypeOf(routes.injectPlayerListQueryParams).toEqualTypeOf<
      CraftRouteInjectHelper<
        'PlayerListQueryParams',
        ReturnType<typeof listQueryParams>
      >
    >();
  });

  it('should inject route queryParams and keep them reactive with router updates', async () => {
    vi.useFakeTimers();

    try {
      const { playerRoutes: appRoutes, injectPlayerListQueryParams } =
        craftRoutes('player', [
          {
            path: 'list',
            loadComponent: async () => null as unknown as Type<unknown>,
            componentDeps: {},
            queryParams: () =>
              queryParam(
                {
                  state: {
                    page: {
                      fallbackValue: 1,
                      parse: (value: string) => parseInt(value, 10),
                      serialize: (value: number) => String(value),
                    },
                    pageSize: {
                      fallbackValue: 10,
                      parse: (value: string) => parseInt(value, 10),
                      serialize: (value: number) => String(value),
                    },
                  },
                },
                ({ set, update, patch, reset }) => ({
                  set,
                  update,
                  patch,
                  reset,
                }),
              ),
          },
        ]);
      const angularRoutes = appRoutes.toRoutes();

      await TestBed.configureTestingModule({
        providers: [provideRouter(angularRoutes)],
      }).compileComponents();

      const router = TestBed.inject(Router);
      const routeConfig = angularRoutes[0];

      await router.navigateByUrl('/list?page=2');
      await vi.runAllTimersAsync();

      const activatedRoute = router.routerState.root.firstChild;

      if (!activatedRoute) {
        throw new Error('Expected an activated route for /list');
      }

      const injector = createRouteInjector(
        routeConfig.providers,
        activatedRoute,
        TestBed.inject(Injector),
      );
      const routeQueryParams = runInInjectionContext(injector, () =>
        injectPlayerListQueryParams(),
      );

      expect(routeQueryParams.page()).toBe(2);
      expect(routeQueryParams.pageSize()).toBe(10);

      routeQueryParams.set({
        page: 5,
        pageSize: 50,
      });
      await vi.runAllTimersAsync();
      expect(routeQueryParams.page()).toBe(5);
      expect(routeQueryParams.pageSize()).toBe(50);
      expect(router.url).toContain('page=5');
      expect(router.url).toContain('pageSize=50');

      routeQueryParams.update((current) => ({
        ...current,
        page: current.page + 1,
      }));
      await vi.runAllTimersAsync();
      expect(routeQueryParams.page()).toBe(6);
      expect(router.url).toContain('page=6');

      routeQueryParams.patch({
        pageSize: 25,
      });
      await vi.runAllTimersAsync();
      expect(routeQueryParams.pageSize()).toBe(25);
      expect(router.url).toContain('pageSize=25');

      await router.navigateByUrl('/list?page=3&pageSize=20');
      await vi.runAllTimersAsync();
      expect(routeQueryParams.page()).toBe(3);
      expect(routeQueryParams.pageSize()).toBe(20);

      routeQueryParams.reset();
      await vi.runAllTimersAsync();
      expect(routeQueryParams.page()).toBe(1);
      expect(routeQueryParams.pageSize()).toBe(10);
      expect(router.url).toBe('/list');
    } finally {
      vi.useRealTimers();
    }
  });

  it('should resolve parent route queryParams from a deeper lazy child context', async () => {
    vi.useFakeTimers();

    try {
      const childRoutes = craftRoutes('child', [
        {
          path: 'details',
          loadComponent: async () => null as unknown as Type<unknown>,
          componentDeps: {},
        },
      ]);
      const { parentRoutes, injectParentLayoutQueryParams } = craftRoutes(
        'parent',
        [
          {
            path: 'layout',
            queryParams: () =>
              queryParam(
                {
                  state: {
                    page: {
                      fallbackValue: 1,
                      parse: (value: string) => parseInt(value, 10),
                      serialize: (value: number) => String(value),
                    },
                  },
                },
                ({ patch }) => ({
                  patch,
                }),
              ),
            loadChildren: () => childRoutes.childRoutes,
          },
        ],
      );
      const parentAngularRoutes = parentRoutes.toRoutes();

      await TestBed.configureTestingModule({
        providers: [provideRouter(parentAngularRoutes)],
      }).compileComponents();

      const router = TestBed.inject(Router);

      await router.navigateByUrl('/layout/details?page=4');
      await vi.runAllTimersAsync();

      const parentRoute = router.routerState.root.firstChild;
      const childRoute = parentRoute?.firstChild;

      if (!parentRoute || !childRoute) {
        throw new Error('Expected parent and child activated routes');
      }

      const parentInjector = createRouteInjector(
        parentAngularRoutes[0]?.providers,
        parentRoute,
        TestBed.inject(Injector),
      );
      const childRouteConfig = childRoutes.childRoutes.toRoutes()[0];
      const childInjector = createRouteInjector(
        childRouteConfig.providers,
        childRoute,
        parentInjector,
      );
      const routeQueryParams = runInInjectionContext(childInjector, () =>
        injectParentLayoutQueryParams(),
      );

      expect(routeQueryParams.page()).toBe(4);

      routeQueryParams.patch({
        page: 5,
      });
      await vi.runAllTimersAsync();

      expect(routeQueryParams.page()).toBe(5);
      expect(router.url).toContain('page=5');
    } finally {
      vi.useRealTimers();
    }
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

  it('should accept plain Angular Route[] from loadChildren and defer execution', async () => {
    let loaded = false;
    const plainRoutes: Route[] = [{ path: 'child', children: [] }];
    const { parentRoutes: appRoutes } = craftRoutes('parent', [
      {
        path: 'profile',
        loadChildren: () => {
          loaded = true;
          return plainRoutes;
        },
      },
    ]);

    const routeConfig = appRoutes.toRoutes()[0];

    expect(loaded).toBe(false);
    expect(routeConfig.loadChildren).toBeTypeOf('function');

    const result = await routeConfig.loadChildren?.();

    expect(loaded).toBe(true);
    expect(result).toEqual(plainRoutes);
  });

  it('should accept plain Angular Route[] wrapped in a Promise from loadChildren', async () => {
    const plainRoutes: Route[] = [{ path: 'async-child', children: [] }];
    const { parentRoutes: appRoutes } = craftRoutes('parent', [
      {
        path: 'profile',
        loadChildren: () => Promise.resolve(plainRoutes),
      },
    ]);

    const routeConfig = appRoutes.toRoutes()[0];
    const result = await routeConfig.loadChildren?.();

    expect(result).toEqual(plainRoutes);
  });

  it('should support canActivate generator alongside plain Angular loadChildren', () => {
    const { AuthToYield, provideAuth } = craftService(
      { name: 'Auth', scope: 'toProvide' },
      () => ({ currentUser: { id: 1 } }),
    );
    const plainRoutes: Route[] = [{ path: 'child', children: [] }];
    const { testRoutes: appRoutes } = craftRoutes('test', [
      {
        path: 'profile',
        providers: [provideAuth()],
        loadChildren: () => plainRoutes,
        canActivate: function* () {
          const auth = yield* AuthToYield();
          return !!auth.currentUser;
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

    expect(result).toBe(true);
  });

  it('should support a redirectTo generator that yields tracked dependencies', () => {
    const { AuthToYield, provideAuth } = craftService(
      { name: 'Auth', scope: 'toProvide' },
      () => ({ isAdmin: () => true }),
    );
    const { testRoutes: appRoutes } = craftRoutes('test', [
      {
        path: '',
        pathMatch: 'full',
        providers: [provideAuth()],
        redirectTo: function* () {
          const auth = yield* AuthToYield();
          return auth.isAdmin() ? '/pizzerias/admin' : '/pizzerias';
        },
      },
    ]);

    const routeConfig = appRoutes.toRoutes()[0];
    const activatedRoute = createActivatedRouteStub();
    const injector = createRouteInjector(
      routeConfig.providers,
      activatedRoute.route,
    );

    expect(typeof routeConfig.redirectTo).toBe('function');

    const result = runInInjectionContext(injector, () =>
      (
        routeConfig.redirectTo as (
          snapshot: PartialMatchRouteSnapshot,
        ) => string
      )(partialMatchRouteSnapshotStub),
    );

    expect(result).toBe('/pizzerias/admin');
  });

  it('should pass a plain string redirectTo straight through', () => {
    const { testRoutes: appRoutes } = craftRoutes('test', [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: '/pizzerias',
      },
    ]);

    expect(appRoutes.toRoutes()[0].redirectTo).toBe('/pizzerias');
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

    expect(routeConfig.providers).toHaveLength(4);

    const injector = createRouteInjector(
      routeConfig.providers,
      activatedRoute.route,
    );

    expect(runInInjectionContext(injector, () => injectHostName())).toBe(
      'route:mutation/:userId',
    );
    expect(injector.get(HOST_TAG_LIST)).toEqual([
      expect.stringMatching(/^route:mutation\/:userId#\d+$/),
    ]);

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

  it('should include route host name in craftMethod from chain', () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { testRouteHostNameRoutes } = craftRoutes('testRouteHostName', [
      {
        path: 'user-list',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
      },
    ]);

    const routeConfig = testRouteHostNameRoutes.toRoutes()[0];
    const activatedRoute = createActivatedRouteStub();

    TestBed.runInInjectionContext(() => {
      const injector = createRouteInjector(
        routeConfig.providers,
        activatedRoute.route,
        inject(Injector),
      );

      class PageComponent {
        readonly load = runInInjectionContext(injector, () =>
          craftMethod('load', this, function* () {
            yield* Console.log('loading');
          }),
        );
      }

      new PageComponent().load();
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      'loading',
      expect.objectContaining({
        from: [expect.stringMatching(/^route:user-list#\d+$/), 'method:load'],
      }),
    );
  });

  it('should include route host name in craftMethod from chain even when a parent component provides a HostName', () => {
    const { testRouteHostNameWithParentRoutes } = craftRoutes(
      'testRouteHostNameWithParent',
      [
        {
          path: 'page',
          loadComponent: async () => null as unknown as Type<unknown>,
          componentDeps: {},
        },
      ],
    );

    const routeConfig = testRouteHostNameWithParentRoutes.toRoutes()[0];

    // Route environment injector: HOST_TAG_LIST = ['route:page']
    const routeTagInjector = Injector.create({
      providers: flattenProviders(routeConfig.providers) as never[],
    });

    // App component node injector: HOST_TAG_LIST = ['component:App']
    // Its node injector chain shadows the route injector for HOST_TAG_LIST lookups
    const appComponentInjector = Injector.create({
      providers: [
        ...flattenProviders(provideHostName('component:App')),
      ] as never[],
    });

    // Routed component injector:
    //   - node injector parent = appComponentInjector (HOST_TAG_LIST chain sees App first)
    //   - EnvironmentInjector explicitly set to routeTagInjector so
    //     ɵcreateHostTaggedInjector can recover the route tags shadowed by App
    const routedComponentInjector = Injector.create({
      parent: appComponentInjector,
      providers: [
        ...flattenProviders(provideHostName('component:Page')),
        { provide: EnvironmentInjector, useValue: routeTagInjector },
      ] as never[],
    });

    // ɵcreateHostTaggedInjector is what craftMethod uses internally; calling it directly
    // lets us assert the merged HOST_TAG_LIST without needing TestBed or browser services.
    const methodInjector = ɵcreateHostTaggedInjector(
      routedComponentInjector,
      'method:load',
    );

    expect(methodInjector.get(HOST_TAG_LIST)).toEqual([
      'component:App',
      'route:page',
      'component:Page',
      'method:load',
    ]);
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

  it('should treat auto-provided queryParams as valid componentDeps coverage', () => {
    craftRoutes('test', [
      {
        path: 'list',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as {
          missingProvider: {
            TestListQueryParams: unknown;
          };
        },
        queryParams: () =>
          queryParam({
            state: {
              page: {
                fallbackValue: 1,
                parse: (value: string) => parseInt(value, 10),
                serialize: (value: number) => String(value),
              },
            },
          }),
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

  describe('craftCanActivate', () => {
    function configureRouterTestingModule(
      providers: NonNullable<Route['providers']> | undefined,
      activatedRoute: ActivatedRoute,
    ) {
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
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

    function runCanActivate(routeConfig: Route) {
      const guard = getCanActivateGuard(routeConfig);

      return TestBed.runInInjectionContext(() =>
        guard(activatedRouteSnapshotStub, routerStateSnapshotStub),
      );
    }

    it('allows the route when no composed guard short-circuits', () => {
      const okGuard = craftGen(function* () {
        return true;
      });
      const { testRoutes: appRoutes } = craftRoutes('test', [
        {
          path: 'admin',
          loadComponent: async () => null as unknown as Type<unknown>,
          componentDeps: {},
          canActivate: craftCanActivate(function* () {
            yield* okGuard();
            return true;
          }, {} as never),
        },
      ]);
      const routeConfig = appRoutes.toRoutes()[0];
      const activatedRoute = createActivatedRouteStub();
      configureRouterTestingModule(routeConfig.providers, activatedRoute.route);

      expect(runCanActivate(routeConfig)).toBe(true);
    });

    it('resolves a short-circuited exception to the resolver redirect', () => {
      const { AuthToYield, provideAuth } = craftService(
        { name: 'Auth', scope: 'toProvide' },
        () => ({ role: 'user' }),
      );
      const roleGuard = craftGen(function* (...roles: string[]) {
        const auth = yield* AuthToYield();
        return roles.includes(auth.role)
          ? true
          : craftException({ code: 'FORBIDDEN_ROLE' });
      });
      const { testRoutes: appRoutes } = craftRoutes('test', [
        {
          path: 'admin',
          loadComponent: async () => null as unknown as Type<unknown>,
          componentDeps: {},
          providers: [provideAuth()],
          canActivate: craftCanActivate(
            function* () {
              yield* roleGuard('admin');
              return true;
            },
            {
              FORBIDDEN_ROLE: ({ createUrlTree }) =>
                createUrlTree(['/unauthorized']),
            },
          ),
        },
      ]);
      const routeConfig = appRoutes.toRoutes()[0];
      const activatedRoute = createActivatedRouteStub();
      configureRouterTestingModule(routeConfig.providers, activatedRoute.route);

      const result = runCanActivate(routeConfig);

      expect(result).toBeInstanceOf(UrlTree);
      expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe(
        '/unauthorized',
      );
    });

    it('throws for an exception code without a resolver', () => {
      const failGuard = craftGen(function* () {
        return craftException({ code: 'FORBIDDEN_ROLE' });
      });
      const { testRoutes: appRoutes } = craftRoutes('test', [
        {
          path: 'admin',
          loadComponent: async () => null as unknown as Type<unknown>,
          componentDeps: {},
          canActivate: craftCanActivate(function* () {
            yield* failGuard();
            return true;
          }, {} as never),
        },
      ]);
      const routeConfig = appRoutes.toRoutes()[0];
      const activatedRoute = createActivatedRouteStub();
      configureRouterTestingModule(routeConfig.providers, activatedRoute.route);

      expect(() => runCanActivate(routeConfig)).toThrow(
        'Unhandled guard exception: FORBIDDEN_ROLE',
      );
    });

    it('exposes guard success data through injectXxxGuardedData', () => {
      const dataGuard = craftGen(function* () {
        return { tenantId: 'acme' } as const;
      });
      const {
        testRoutes: appRoutes,
        injectTestAdminGuardedData: injectGuardedData,
      } = craftRoutes('test', [
        {
          path: 'admin',
          loadComponent: async () => null as unknown as Type<unknown>,
          componentDeps: {},
          canActivate: craftCanActivate(function* () {
            return yield* dataGuard();
          }, {} as never),
        },
      ]);
      const routeConfig = appRoutes.toRoutes()[0];
      const activatedRoute = createActivatedRouteStub();
      configureRouterTestingModule(routeConfig.providers, activatedRoute.route);

      expect(runCanActivate(routeConfig)).toBe(true);

      const guardedData = TestBed.runInInjectionContext(() =>
        injectGuardedData(),
      );

      expect(guardedData()).toEqual({ tenantId: 'acme' });

      expectTypeOf(guardedData()).toEqualTypeOf<{
        readonly tenantId: 'acme';
      }>();
    });

    it('lets a generator resolver yield a service to build the redirect', () => {
      const { RedirectConfigToYield, provideRedirectConfig } = craftService(
        { name: 'RedirectConfig', scope: 'toProvide' },
        () => ({ loginUrl: '/auth/login' }),
      );
      const authGuard = craftGen(function* () {
        return craftException({ code: 'NOT_AUTHENTICATED' });
      });
      const { testRoutes: appRoutes } = craftRoutes('test', [
        {
          path: 'admin',
          loadComponent: async () => null as unknown as Type<unknown>,
          componentDeps: {},
          providers: [provideRedirectConfig()],
          canActivate: craftCanActivate(
            function* () {
              yield* authGuard();
              return true;
            },
            {
              NOT_AUTHENTICATED: function* ({ createUrlTree }) {
                const config = yield* RedirectConfigToYield();
                return createUrlTree([config.loginUrl]);
              },
            },
          ),
        },
      ]);
      const routeConfig = appRoutes.toRoutes()[0];
      configureRouterTestingModule(
        routeConfig.providers,
        createActivatedRouteStub().route,
      );

      const result = runCanActivate(routeConfig);

      expect(result).toBeInstanceOf(UrlTree);
      expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe(
        '/auth/login',
      );
    });

    it('requires resolvers covering exactly the reachable exception codes', () => {
      const roleGuard = craftGen(function* (...roles: string[]) {
        return roles.includes('admin')
          ? true
          : craftException({ code: 'FORBIDDEN_ROLE' });
      });
      const noPizzeriaGuard = craftGen(function* () {
        return Math.random() > 0.5
          ? craftException({ code: 'HAS_PIZZERIA' })
          : true;
      });
      const guard = function* () {
        yield* roleGuard('admin');
        yield* noPizzeriaGuard();
        return true;
      };

      // Exact coverage type-checks.
      craftCanActivate(guard, {
        FORBIDDEN_ROLE: ({ createUrlTree }) => createUrlTree(['/unauthorized']),
        HAS_PIZZERIA: ({ createUrlTree }) => createUrlTree(['/dashboard']),
      });

      craftCanActivate(
        guard,
        // @ts-expect-error - `HAS_PIZZERIA` resolver is missing.
        {
          FORBIDDEN_ROLE: ({ createUrlTree }) =>
            createUrlTree(['/unauthorized']),
        },
      );

      expect(true).toBe(true);
    });
  });

  describe('craftCanMatch', () => {
    function configureRouterTestingModule(
      providers: NonNullable<Route['providers']> | undefined,
    ) {
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          { provide: SERVICE_RUNTIME_OVERRIDES, useValue: new Map() },
          ...flattenProviders(providers),
        ] as never[],
      });
    }

    function runCanMatch(routeConfig: Route) {
      const guard = getCanMatchGuard(routeConfig);

      return TestBed.runInInjectionContext(() =>
        guard(routeConfig, urlSegmentsStub, partialMatchRouteSnapshotStub),
      );
    }

    const flagGuard = craftGen(function* (flag: string) {
      return flag === 'beta'
        ? true
        : craftException({ code: 'FLAG_DISABLED' });
    });

    it('matches the route when no composed guard short-circuits', () => {
      const { testRoutes: appRoutes } = craftRoutes('test', [
        {
          path: 'beta',
          loadComponent: async () => null as unknown as Type<unknown>,
          componentDeps: {},
          canMatch: craftCanMatch(
            function* () {
              yield* flagGuard('beta');
              return true;
            },
            { FLAG_DISABLED: () => false },
          ),
        },
      ]);
      const routeConfig = appRoutes.toRoutes()[0];
      configureRouterTestingModule(routeConfig.providers);

      expect(runCanMatch(routeConfig)).toBe(true);
    });

    it('resolves a short-circuit to the resolver GuardResult (skip the route)', () => {
      const { testRoutes: appRoutes } = craftRoutes('test', [
        {
          path: 'beta',
          loadComponent: async () => null as unknown as Type<unknown>,
          componentDeps: {},
          canMatch: craftCanMatch(
            function* () {
              yield* flagGuard('disabled');
              return true;
            },
            { FLAG_DISABLED: () => false },
          ),
        },
      ]);
      const routeConfig = appRoutes.toRoutes()[0];
      configureRouterTestingModule(routeConfig.providers);

      expect(runCanMatch(routeConfig)).toBe(false);
    });

    it('can resolve a short-circuit to a redirect UrlTree', () => {
      const { testRoutes: appRoutes } = craftRoutes('test', [
        {
          path: 'beta',
          loadComponent: async () => null as unknown as Type<unknown>,
          componentDeps: {},
          canMatch: craftCanMatch(
            function* () {
              yield* flagGuard('disabled');
              return true;
            },
            { FLAG_DISABLED: ({ createUrlTree }) => createUrlTree(['/home']) },
          ),
        },
      ]);
      const routeConfig = appRoutes.toRoutes()[0];
      configureRouterTestingModule(routeConfig.providers);

      const result = runCanMatch(routeConfig);

      expect(result).toBeInstanceOf(UrlTree);
      expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe(
        '/home',
      );
    });

    it('throws for an exception code without a resolver', () => {
      const { testRoutes: appRoutes } = craftRoutes('test', [
        {
          path: 'beta',
          loadComponent: async () => null as unknown as Type<unknown>,
          componentDeps: {},
          canMatch: craftCanMatch(function* () {
            yield* flagGuard('disabled');
            return true;
          }, {} as never),
        },
      ]);
      const routeConfig = appRoutes.toRoutes()[0];
      configureRouterTestingModule(routeConfig.providers);

      expect(() => runCanMatch(routeConfig)).toThrow(
        'Unhandled guard exception: FLAG_DISABLED',
      );
    });

    it('requires resolvers covering exactly the reachable exception codes', () => {
      const guard = function* () {
        yield* flagGuard('beta');
        return true;
      };

      // Exact coverage type-checks.
      craftCanMatch(guard, { FLAG_DISABLED: () => false });

      craftCanMatch(
        guard,
        // @ts-expect-error - `FLAG_DISABLED` resolver is missing.
        {},
      );

      expect(true).toBe(true);
    });
  });

  it('should resolve an observable canMatch result once it emits a defined value', async () => {
    const guardResult = new BehaviorSubject<GuardResult | undefined>(undefined);
    const { testRoutes: appRoutes } = craftRoutes('test', [
      {
        path: 'guard',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
        canMatch: (() => guardResult.asObservable()) as unknown as never,
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
    const guardPromise = firstValueFrom(result as any);
    let resolved = false;

    guardPromise.then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);

    guardResult.next(true);

    expect(await guardPromise).toBe(true);
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

  describe('craftRoute().withProviders()', () => {
    type User = { id: number; name: string };

    it('should build a route-level provider from typed route-scoped ToYield helpers', () => {
      const { injectUser, provideUser } = craftService(
        { name: 'User', scope: 'abstract' },
        abstract<User>(),
      );

      const { wpRoutes } = craftRoutes('wp', [
        craftRoute('dashboard/:userId', {
          loadComponent: async () => null as unknown as Type<unknown>,
          componentDeps: {},
          canActivate: (): User | false => ({ id: 9, name: 'Carol' }),
        }).withProviders(({ GuardedDataToYield }) => [
          provideUser(function* () {
            const guarded = yield* GuardedDataToYield();
            return guarded();
          }),
        ]),
      ]);

      const routeConfig = wpRoutes.toRoutes()[0];
      const activatedRoute = createActivatedRouteStub({
        params: { userId: '9' },
      });
      const injector = createRouteInjector(
        routeConfig.providers,
        activatedRoute.route,
      );
      const canActivate = getCanActivateGuard(routeConfig);

      // Guard must run first so the guarded-data signal is populated.
      const guardResult = runInInjectionContext(injector, () =>
        canActivate(activatedRouteSnapshotStub, routerStateSnapshotStub),
      );
      expect(guardResult).toBe(true);

      const user = runInInjectionContext(injector, () => injectUser());
      expect(user).toEqual({ id: 9, name: 'Carol' });
    });

    it('should type the route-scoped helpers (guarded data + path param)', () => {
      const builder = craftRoute('dashboard/:userId', {
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
        canActivate: (): User | false => ({ id: 1, name: 'Alice' }),
      });

      builder.withProviders((helpers) => {
        type GuardedReturn =
          ReturnType<typeof helpers.GuardedDataToYield> extends Generator<
            any,
            infer R,
            any
          >
            ? R
            : never;
        expectTypeOf<GuardedReturn>().toEqualTypeOf<Signal<User>>();

        type ParamReturn =
          ReturnType<typeof helpers.UserIdParamsToYield> extends Generator<
            any,
            infer R,
            any
          >
            ? R
            : never;
        expectTypeOf<ParamReturn>().toEqualTypeOf<Signal<string>>();
        return [];
      });
    });
  });

  describe('guardedData', () => {
    type User = { id: number; name: string };

    it('should expose typed inject helper when guard returns User | false', () => {
      const { appRoutes: _appRoutes, injectAppDashboardGuardedData } =
        craftRoutes('app', [
          {
            path: 'dashboard',
            loadComponent: async () => null as unknown as Type<unknown>,
            componentDeps: {},
            canActivate: (): User | false => ({ id: 1, name: 'Alice' }),
          },
        ]);

      expectTypeOf(injectAppDashboardGuardedData).toEqualTypeOf<
        CraftRouteInjectHelper<'AppDashboardGuardedData', Signal<User>>
      >();
    });

    it('should not expose inject helper when guard returns only boolean', () => {
      const routes = craftRoutes('app', [
        {
          path: 'dashboard',
          loadComponent: async () => null as unknown as Type<unknown>,
          componentDeps: {},
          canActivate: (): boolean => true,
        },
      ]);

      // @ts-expect-error no guarded data inject helper when guard returns only boolean
      routes.injectAppDashboardGuardedData;
    });

    it('should set guard data signal when sync guard returns an object', () => {
      const { appRoutes, injectAppDashboardGuardedData } = craftRoutes('app', [
        {
          path: 'dashboard',
          loadComponent: async () => null as unknown as Type<unknown>,
          componentDeps: {},
          canActivate: (): User | false => ({ id: 42, name: 'Alice' }),
        },
      ]);

      const routeConfig = appRoutes.toRoutes()[0];
      const activatedRoute = createActivatedRouteStub();
      const injector = createRouteInjector(
        routeConfig.providers,
        activatedRoute.route,
      );
      const canActivate = getCanActivateGuard(routeConfig);

      const guardResult = runInInjectionContext(injector, () =>
        canActivate(activatedRouteSnapshotStub, routerStateSnapshotStub),
      );

      expect(guardResult).toBe(true);

      const guardData = runInInjectionContext(injector, () =>
        injectAppDashboardGuardedData(),
      );

      expectTypeOf(guardData).toEqualTypeOf<Signal<User>>();
      expect(guardData()).toEqual({ id: 42, name: 'Alice' });
    });

    it('should set guard data signal when generator guard yields services and returns an object', () => {
      const { AuthToYield, provideAuth } = craftService(
        { name: 'Auth', scope: 'toProvide' },
        () => ({ currentUser: { id: 7, name: 'Bob' } as User }),
      );

      const { appRoutes, injectAppDashboardGuardedData } = craftRoutes('app', [
        {
          path: 'dashboard',
          loadComponent: async () => null as unknown as Type<unknown>,
          componentDeps: {},
          providers: [provideAuth()],
          canActivate: function* () {
            const auth = yield* AuthToYield();
            return auth.currentUser;
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

      const guardResult = runInInjectionContext(injector, () =>
        canActivate(activatedRouteSnapshotStub, routerStateSnapshotStub),
      );

      expect(guardResult).toBe(true);

      const guardData = runInInjectionContext(injector, () =>
        injectAppDashboardGuardedData(),
      );

      expect(guardData()).toEqual({ id: 7, name: 'Bob' });
    });

    it('should set guard data signal when Observable guard emits an object', async () => {
      const subject = new BehaviorSubject<User | false | undefined>(undefined);

      const { appRoutes, injectAppDashboardGuardedData } = craftRoutes('app', [
        {
          path: 'dashboard',
          loadComponent: async () => null as unknown as Type<unknown>,
          componentDeps: {},
          canActivate: () => subject.asObservable(),
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

      const guardPromise = firstValueFrom(result as any);

      subject.next({ id: 99, name: 'Carol' });

      expect(await guardPromise).toBe(true);

      const guardData = runInInjectionContext(injector, () =>
        injectAppDashboardGuardedData(),
      );

      expect(guardData()).toEqual({ id: 99, name: 'Carol' });
    });

    it('should block navigation when guard returns false and not crash', () => {
      const { appRoutes, injectAppDashboardGuardedData: _inject } = craftRoutes(
        'app',
        [
          {
            path: 'dashboard',
            loadComponent: async () => null as unknown as Type<unknown>,
            componentDeps: {},
            canActivate: (): User | false => false,
          },
        ],
      );

      const routeConfig = appRoutes.toRoutes()[0];
      const activatedRoute = createActivatedRouteStub();
      const injector = createRouteInjector(
        routeConfig.providers,
        activatedRoute.route,
      );
      const canActivate = getCanActivateGuard(routeConfig);

      const guardResult = runInInjectionContext(injector, () =>
        canActivate(activatedRouteSnapshotStub, routerStateSnapshotStub),
      );

      expect(guardResult).toBe(false);
    });
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
              appStart: false;
              dependencies: {};
            };
          };
          missingProvider: {
            Counter: {
              scope: 'toProvide';
              browserBoundary: false;
              appStart: false;
              dependencies: {};
            };
          };
          publicProperties: {};
        },
      ]
    >();
  });

  it('should include queryParams deps in META_DATA, including outer generator yields', () => {
    const { ParsePageToYield } = craftService(
      { name: 'ParsePage', scope: 'global' },
      () => ({
        parsePage: (value: string) => parseInt(value, 10),
      }),
    );
    const { SerializePageToYield } = craftService(
      { name: 'SerializePage', scope: 'global' },
      () => ({
        serializePage: (value: number) => String(value),
      }),
    );
    const { PaginationRulesToYield } = craftService(
      { name: 'PaginationRules', scope: 'global' },
      () => ({
        maxPage: () => 3,
      }),
    );

    type QueryParamsRouteDeps = GetDeps<{
      provided: {};
      publicProperties: {};
    }>;

    const { testRoutes: appRoutes } = craftRoutes('test', [
      {
        path: 'list',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as QueryParamsRouteDeps,
        queryParams: function* () {
          yield* Console.log('init list queryParam');

          return queryParam(
            {
              state: {
                page: {
                  fallbackValue: 1,
                  parse: function* (value: string) {
                    const parser = yield* ParsePageToYield(
                      undefined,
                      ({ parsePage }) => ({
                        parsePage,
                      }),
                    );

                    return parser.parsePage(value);
                  },
                  serialize: function* (value: number) {
                    const serializer = yield* SerializePageToYield(
                      undefined,
                      ({ serializePage }) => ({
                        serializePage,
                      }),
                    );

                    return serializer.serializePage(value);
                  },
                },
              },
            },
            function* ({ patch, state }) {
              const rules = yield* PaginationRulesToYield(
                undefined,
                ({ maxPage }) => ({
                  maxPage,
                }),
              );

              return {
                nextPage: () => {
                  if (state().page >= rules.maxPage()) {
                    return;
                  }

                  patch(({ page }) => ({
                    page: page + 1,
                  }));
                },
              };
            },
          );
        },
      },
    ]);

    expectTypeOf(appRoutes.META_DATA).toEqualTypeOf<
      readonly [
        {
          path: 'list';
          queryParams: { page: string };
          deps: {
            Router: {
              scope: 'global';
              dependencies: {};
              browserBoundary: false;
              appStart: false;
            };
            ConsoleService: GetInjectedServiceDependencies<
              typeof injectConsoleService
            >;
            ParsePage: {
              scope: 'global';
              dependencies: {};
              browserBoundary: false;
              appStart: false;
              derivedPropertiesUsed: {
                parsePage: (value: string) => number;
              };
              derivedPropertiesExposed: {
                parsePage: (value: string) => number;
              };
            };
            SerializePage: {
              scope: 'global';
              dependencies: {};
              browserBoundary: false;
              appStart: false;
              derivedPropertiesUsed: {
                serializePage: (value: number) => string;
              };
              derivedPropertiesExposed: {
                serializePage: (value: number) => string;
              };
            };
            PaginationRules: {
              scope: 'global';
              dependencies: {};
              browserBoundary: false;
              appStart: false;
              derivedPropertiesUsed: {
                maxPage: () => 3;
              };
              derivedPropertiesExposed: {
                maxPage: () => 3;
              };
            };
          };
          provided: {};
          publicProperties: {};
        },
      ]
    >();
  });

  it('should remove queryParams deps when satisfied by route providers', () => {
    const { CounterToYield, provideCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );

    type QueryParamsRouteDeps = GetDeps<{
      provided: {};
      publicProperties: {};
    }>;

    const { testRoutes: appRoutes } = craftRoutes('test', [
      {
        path: 'counter',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as QueryParamsRouteDeps,
        providers: [provideCounter()],
        queryParams: function* () {
          yield* CounterToYield();

          return queryParam({
            state: {
              page: {
                fallbackValue: 1,
                parse: (value: string) => parseInt(value, 10),
                serialize: (value: number) => String(value),
              },
            },
          });
        },
      },
    ]);

    expectTypeOf(appRoutes.META_DATA).toEqualTypeOf<
      readonly [
        {
          path: 'counter';
          queryParams: { page: string };
          deps: {
            Router: {
              scope: 'global';
              dependencies: {};
              browserBoundary: false;
              appStart: false;
            };
          };
          provided: {};
          publicProperties: {};
        },
      ]
    >();
  });

  it('should keep parent route queryParams coverage inherited in lazy child metadata', () => {
    type ChildRouteDeps = GetDeps<{
      provided: {};
      publicProperties: {};
      missingProvider: {
        ParentLayoutQueryParams: unknown;
      };
    }>;

    const childRoutes = craftRoutes('child', [
      {
        path: 'details',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as ChildRouteDeps,
      },
    ]);
    const { parentRoutes } = craftRoutes('parent', [
      {
        path: 'layout',
        queryParams: () =>
          queryParam({
            state: {
              page: {
                fallbackValue: 1,
                parse: (value: string) => parseInt(value, 10),
                serialize: (value: number) => String(value),
              },
            },
          }),
        loadChildren: () => childRoutes.childRoutes,
      },
    ]);

    expectTypeOf(parentRoutes.META_DATA).toEqualTypeOf<
      readonly [
        {
          path: 'layout';
          queryParams: { page: string };
          deps: {
            Router: {
              scope: 'global';
              dependencies: {};
              browserBoundary: false;
              appStart: false;
            };
          };
        },
        {
          path: 'layout/details';
          provided: {};
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

  it('should include craftCanActivate generator resolver deps in META_DATA', () => {
    const { injectRedirectConfig, RedirectConfigToYield } = craftService(
      { name: 'RedirectConfig', scope: 'toProvide' },
      () => ({ loginUrl: '/login' }),
    );
    const authGuard = craftGen(function* () {
      return craftException({ code: 'NOT_AUTHENTICATED' });
    });

    type GuardRouteDeps = GetDeps<{
      provided: {};
      publicProperties: {};
    }>;

    const { testRoutes: appRoutes } = craftRoutes('test', [
      {
        path: 'admin',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as GuardRouteDeps,
        canActivate: craftCanActivate(
          function* () {
            yield* authGuard();
            return true;
          },
          {
            // Generator resolver — its yielded service is tracked as a route dep.
            NOT_AUTHENTICATED: function* ({ createUrlTree }) {
              const config = yield* RedirectConfigToYield();
              return createUrlTree([config.loginUrl]);
            },
          },
        ),
      },
    ]);

    expectTypeOf(appRoutes.META_DATA).toEqualTypeOf<
      readonly [
        {
          path: 'admin';
          deps: {
            RedirectConfig: GetInjectedServiceDependencies<
              typeof injectRedirectConfig
            >;
          };
          provided: {};
          publicProperties: {};
        },
      ]
    >();
  });

  it('should strip craftCanActivate resolver deps satisfied by route providers', () => {
    const { RedirectConfigToYield, provideRedirectConfig } = craftService(
      { name: 'RedirectConfig', scope: 'toProvide' },
      () => ({ loginUrl: '/login' }),
    );
    const authGuard = craftGen(function* () {
      return craftException({ code: 'NOT_AUTHENTICATED' });
    });

    type GuardRouteDeps = GetDeps<{
      provided: {};
      publicProperties: {};
    }>;

    const { testRoutes: appRoutes } = craftRoutes('test', [
      {
        path: 'admin',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as GuardRouteDeps,
        providers: [provideRedirectConfig()],
        canActivate: craftCanActivate(
          function* () {
            yield* authGuard();
            return true;
          },
          {
            NOT_AUTHENTICATED: function* ({ createUrlTree }) {
              const config = yield* RedirectConfigToYield();
              return createUrlTree([config.loginUrl]);
            },
          },
        ),
      },
    ]);

    expectTypeOf(appRoutes.META_DATA).toEqualTypeOf<
      readonly [
        {
          path: 'admin';
          deps: {};
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

    const { childRoutes: loadableChildRoutes } = craftRoutes('child', [
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
        loadChildren: () => loadableChildRoutes,
        providers: [provideCounter()],
      },
    ]);

    expectTypeOf(appRoutes.META_DATA).toEqualTypeOf<
      readonly [
        {
          path: 'users/:userId';
        },
        {
          path: 'users/:userId/details';
          deps: {};
          provided: {};
          publicProperties: {};
        },
      ]
    >();
  });
});

import '@angular/compiler';
import {
  Component,
  computed,
  EnvironmentInjector,
  inject,
  InjectionToken,
  Injector,
  input,
  type Provider,
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
  Router,
  NavigationEnd,
  type RouterStateSnapshot,
  type UrlSegment,
  UrlTree,
} from '@angular/router';
import {
  BehaviorSubject,
  combineLatest,
  EMPTY,
  firstValueFrom,
  isObservable,
  map,
  Subject,
  type Observable,
} from 'rxjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import { Console, ConsoleService } from './browser-boundaries';
import { FN_WRAP_OBSERVER, FN_WRAPPER } from './fn-wrapper';
import { craftMethod } from './craft-method';
import {
  abstract,
  craftService,
  GetServiceDependencies,
  SERVICE_RUNTIME_OVERRIDES,
  ɵcreateHostTaggedInjector,
  type CraftServiceApi,
} from './craft-service';
import { CraftHttpClient, type CraftHttpRequest } from './craft-http-client';
import { queryParams } from './query-params';
import {
  CraftRouteInjectHelper,
  CraftRouteYieldHelper,
  craftRoutes,
  craftRoute,
  type CraftRoutesPublicPropertiesErrors,
  type ResolveCraftRouteComponentDeps,
} from './craft-routes';
import { craftGen } from './craft-gen';
import {
  runCraftGenerator,
  SERVICE_YIELD_WRAPPER,
} from './craft-generator-runtime';
import { craftException } from './craft-exception';
import { craftExceptionHandler } from './craft-route-exceptions';
import { GetDeps } from './branded-component/branded-component';
import { HOST_TAG_LIST, HostName, provideHostName } from './host-tag';
import { craftUse } from './craft-use';
import { craftUntilSettled } from './craft-until-settled';
import {
  CRAFT_MATCH,
  CRAFT_ROUTER,
  matchCraftRoutes,
  provideCraftRouter,
  type CraftCompiledRoute,
  type CraftMatch,
} from './craft-router';
import { createCraftRouterOutletController } from './craft-router-outlet';
import { CRAFT_ROUTE_META, getCraftRouteMeta } from './craft-route-meta';
import { craftSignal, type CraftWritableSignal } from './host/craft-signal';
import { withTransitionTimings } from './craft-pending';

const flushChain = async () => {
  for (let i = 0; i < 20; i += 1) {
    await Promise.resolve();
  }
};

function activateCraftRoutes(
  routes: readonly CraftCompiledRoute[],
  url: string,
) {
  window.history.replaceState(null, '', url);
  TestBed.configureTestingModule({
    providers: [
      provideCraftRouter(
        routes,
        withTransitionTimings({ stayMs: 0, blankMs: 0, pendingMinMs: 0 }),
      ),
    ],
  });
  return TestBed.runInInjectionContext(() =>
    createCraftRouterOutletController(),
  );
}

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

function resolveRouteYield<T>(
  iterator: Generator<unknown, T, unknown>,
  injector: Injector,
): T {
  return runCraftGenerator({
    iterator,
    injector,
    hostScope: 'function',
    invalidYieldErrorMessage: 'invalid route yield',
    multipleAppStartErrorMessage: 'multiple route app start yields',
  }).value as T;
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
  const navigationEvents = new Subject<unknown>();

  const snapshot = {
    params: paramsSubject.value,
    data: dataSubject.value,
    queryParams: queryParamsSubject.value,
  };

  const route = {
    params: paramsSubject.asObservable(),
    data: dataSubject.asObservable(),
    queryParams: queryParamsSubject.asObservable(),
    events: navigationEvents.asObservable(),
    snapshot,
    parent: null,
  } as unknown as ActivatedRouteWithCraftMatch;
  const match = craftSignal(buildStubMatch(route, ''));
  route.__craftMatch = match;

  return {
    route,
    setParams(params: Params) {
      snapshot.params = params;
      paramsSubject.next(params);
      navigationEvents.next(new NavigationEnd(1, '/', '/'));
      match.update((current) => ({
        ...current,
        params: params as Record<string, string>,
      }));
    },
    setData(data: Data) {
      snapshot.data = data;
      dataSubject.next(data);
      navigationEvents.next(new NavigationEnd(1, '/', '/'));
      match.update((current) => {
        const nextData = data as Record<string | symbol, unknown>;
        const nextRoute = { ...current.route, data: nextData };
        return {
          ...current,
          data: nextData,
          route: nextRoute,
          routes: current.routes.map((candidate) =>
            candidate.path === current.route.path ? nextRoute : candidate,
          ),
        };
      });
    },
    setQueryParams(queryParams: Params) {
      snapshot.queryParams = queryParams;
      queryParamsSubject.next(queryParams);
      navigationEvents.next(new NavigationEnd(1, '/', '/'));
      match.update((current) => ({
        ...current,
        queryParams: queryParams as Record<string, string>,
      }));
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
  providers: readonly unknown[] | undefined,
): unknown[] {
  if (!providers) {
    return [];
  }

  return providers.flatMap((provider) =>
    Array.isArray(provider) ? flattenProviders(provider) : [provider],
  );
}

type ActivatedRouteWithCraftMatch = ActivatedRoute & {
  __craftMatch?: CraftWritableSignal<CraftMatch>;
};

function buildStubMatch(
  activatedRoute: ActivatedRoute,
  routePath: string,
): CraftMatch {
  const data = (activatedRoute.snapshot.data ?? {}) as Record<
    string | symbol,
    unknown
  >;
  const route = { path: routePath, data };
  return {
    pathname: '/',
    search: '',
    hash: '',
    params: (activatedRoute.snapshot.params ?? {}) as Record<string, string>,
    queryParams: (activatedRoute.snapshot.queryParams ?? {}) as Record<
      string,
      string
    >,
    route,
    routes: [route],
    data,
  };
}

function createRouteInjector(
  providers: readonly unknown[] | undefined,
  activatedRoute: ActivatedRoute,
  parent?: Injector,
  routePath = '',
): Injector {
  return Injector.create({
    parent,
    providers: [
      {
        provide: ActivatedRoute,
        useValue: activatedRoute,
      },
      ...(parent
        ? []
        : [
            {
              provide: Router,
              useValue: {
                routerState: {
                  snapshot: {
                    root: {
                      get params() {
                        return activatedRoute.snapshot.params;
                      },
                      get data() {
                        return activatedRoute.snapshot.data;
                      },
                      get queryParams() {
                        return activatedRoute.snapshot.queryParams;
                      },
                      routeConfig: { path: routePath },
                      children: [],
                    },
                  },
                },
                events:
                  (
                    activatedRoute as ActivatedRoute & {
                      events?: Observable<unknown>;
                    }
                  ).events ?? EMPTY,
              },
            },
          ]),
      {
        provide: SERVICE_RUNTIME_OVERRIDES,
        useValue: new Map(),
      },
      {
        provide: FN_WRAPPER,
        useValue: [],
      },
      {
        provide: FN_WRAP_OBSERVER,
        useValue: [],
      },
      {
        provide: SERVICE_YIELD_WRAPPER,
        useValue: [],
      },
      {
        provide: CRAFT_MATCH,
        useValue: (() => {
          const hostRoute = activatedRoute as ActivatedRouteWithCraftMatch;
          const matchSignal =
            hostRoute.__craftMatch ??
            craftSignal(buildStubMatch(activatedRoute, routePath));
          matchSignal.set(buildStubMatch(activatedRoute, routePath));
          hostRoute.__craftMatch = matchSignal;
          return matchSignal;
        })(),
      },
      ...flattenProviders(providers),
    ] as never[],
  });
}

function configureRouteTestingModule(
  providers: readonly unknown[] | undefined,
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
      {
        provide: SERVICE_YIELD_WRAPPER,
        useValue: [],
      },
      ...flattenProviders(providers),
    ] as never[],
  });
}

const activatedRouteSnapshotStub = {} as ActivatedRouteSnapshot;
const routerStateSnapshotStub = {} as RouterStateSnapshot;
const partialMatchRouteSnapshotStub = {} as PartialMatchRouteSnapshot;
const urlSegmentsStub = [] as UrlSegment[];

function getCanActivateGuard(route: Route | CraftCompiledRoute): CanActivateFn {
  const guard = route.canActivate?.[0];

  if (typeof guard !== 'function') {
    throw new Error('Expected route.canActivate[0] to be a function.');
  }

  return guard as CanActivateFn;
}

function getCanMatchGuard(route: Route | CraftCompiledRoute): CanMatchFn {
  const guard = route.canMatch?.[0];

  if (typeof guard !== 'function') {
    throw new Error('Expected route.canMatch[0] to be a function.');
  }

  return guard as CanMatchFn;
}

function fakeHttpCall<T>(
  resolved: PromiseLike<T>,
): Generator<unknown, PromiseLike<T>, unknown> {

  return (function* () {
    return resolved;
  })();
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
  window.history.replaceState(null, '', '/');
});

describe('craftRoutes', () => {
  it('does not import @angular/router at runtime', () => {
    const source = readFileSync(
      join(process.cwd(), 'libs/core/src/lib/craft-routes.ts'),
      'utf8',
    );
    expect(source).not.toMatch(
      /^import\s+(?!type\b)[^;]*from ['"]@angular\/router['"]/m,
    );
  });

  it('should expose typed inject helpers for params but not route data', () => {
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

    // Route data is consumed through route inputs or the route-local `Data`
    // generator in `withProviders`, never through a collection-level helper.
    // @ts-expect-error route data inject helpers are intentionally not public
    routes.injectPlayerMutationData;
  });

  it('should expose typed inject helpers for route queryParams', () => {
    const listQueryParams = () =>
      craftUse(
        queryParams(
          'listQueryParams',
          {
            state: {
              page: {
                fallbackValue: 1,
                codec: {
                  decode: (value: string) => parseInt(value, 10),
                  encode: (value: number) => String(value),
                },
              },
              pageSize: {
                fallbackValue: 10,
                codec: {
                  decode: (value: string) => parseInt(value, 10),
                  encode: (value: number) => String(value),
                },
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
            queryParams: function* () {
              const pagination = yield* queryParams(
                'pagination',
                {
                  state: {
                    page: {
                      fallbackValue: 1,
                      codec: {
                        decode: (value: string) => parseInt(value, 10),
                        encode: (value: number) => String(value),
                      },
                    },
                    pageSize: {
                      fallbackValue: 10,
                      codec: {
                        decode: (value: string) => parseInt(value, 10),
                        encode: (value: number) => String(value),
                      },
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
              return pagination;
            },
          },
        ]);
      const compiledRoutes = appRoutes.toRoutes();

      await TestBed.configureTestingModule({
        providers: [provideCraftRouter(compiledRoutes)],
      }).compileComponents();

      const router = TestBed.inject(CRAFT_ROUTER);
      const routeConfig = compiledRoutes[0];

      await router.navigateByUrl('/list?page=2');
      await vi.runAllTimersAsync();

      const injector = createRouteInjector(
        routeConfig.providers,
        createActivatedRouteStub().route,
        TestBed.inject(Injector),
        routeConfig.path,
      );
      const routeQueryParams = runInInjectionContext(injector, () =>
        injectPlayerListQueryParams(),
      );

      expect(craftUse(routeQueryParams.page())).toBe(2);
      expect(craftUse(routeQueryParams.pageSize())).toBe(10);

      routeQueryParams.set({
        page: 5,
        pageSize: 50,
      });
      await vi.runAllTimersAsync();
      expect(craftUse(routeQueryParams.page())).toBe(5);
      expect(craftUse(routeQueryParams.pageSize())).toBe(50);
      expect(router.url).toContain('page=5');
      expect(router.url).toContain('pageSize=50');

      routeQueryParams.update((current) => ({
        ...current,
        page: current.page + 1,
      }));
      await vi.runAllTimersAsync();
      expect(craftUse(routeQueryParams.page())).toBe(6);
      expect(router.url).toContain('page=6');

      routeQueryParams.patch({
        pageSize: 25,
      });
      await vi.runAllTimersAsync();
      expect(craftUse(routeQueryParams.pageSize())).toBe(25);
      expect(router.url).toContain('pageSize=25');

      await router.navigateByUrl('/list?page=3&pageSize=20');
      await vi.runAllTimersAsync();
      expect(craftUse(routeQueryParams.page())).toBe(3);
      expect(craftUse(routeQueryParams.pageSize())).toBe(20);

      routeQueryParams.reset();
      await vi.runAllTimersAsync();
      expect(craftUse(routeQueryParams.page())).toBe(1);
      expect(craftUse(routeQueryParams.pageSize())).toBe(10);
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
            queryParams: function* () {
              const pagination = yield* queryParams(
                'pagination',
                {
                  state: {
                    page: {
                      fallbackValue: 1,
                      codec: {
                        decode: (value: string) => parseInt(value, 10),
                        encode: (value: number) => String(value),
                      },
                    },
                  },
                },
                ({ patch }) => ({
                  patch,
                }),
              );
              return pagination;
            },
            loadChildren: () => childRoutes.childRoutes,
          },
        ],
      );
      const parentCompiledRoutes = parentRoutes.toRoutes();

      await TestBed.configureTestingModule({
        providers: [provideCraftRouter(parentCompiledRoutes)],
      }).compileComponents();

      const router = TestBed.inject(CRAFT_ROUTER);

      await router.navigateByUrl('/layout/details?page=4');
      await vi.runAllTimersAsync();

      const parentInjector = createRouteInjector(
        parentCompiledRoutes[0]?.providers,
        createActivatedRouteStub().route,
        TestBed.inject(Injector),
        parentCompiledRoutes[0]?.path,
      );
      const childRouteConfig = childRoutes.childRoutes.toRoutes()[0];
      const childInjector = createRouteInjector(
        childRouteConfig.providers,
        createActivatedRouteStub().route,
        parentInjector,
        childRouteConfig.path,
      );
      const routeQueryParams = runInInjectionContext(childInjector, () =>
        injectParentLayoutQueryParams(),
      );

      expect(craftUse(routeQueryParams.page())).toBe(4);

      routeQueryParams.patch({
        page: 5,
      });
      await vi.runAllTimersAsync();

      expect(craftUse(routeQueryParams.page())).toBe(5);
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
      undefined,
      routeConfig.path,
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

  it('should support canActivate generator alongside plain Angular loadChildren — outlet-driven guards', async () => {
    const { Auth, provideAuth } = craftService(
      { name: 'Auth', scope: 'toProvide' },
      () => ({ currentUser: { id: 1 } }),
    );
    const plainRoutes: Route[] = [{ path: 'child', children: [] }];
    const { testRoutes: appRoutes } = craftRoutes('test', [
      {
        path: 'profile',
        providers: [provideAuth()],
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
        loadChildren: () => plainRoutes,
        canActivate: function* () {
          const auth = yield* Auth();
          return !!auth.currentUser;
        },
      },
    ]);

    const outlet = activateCraftRoutes(appRoutes.toRoutes(), '/profile');
    await flushChain();

    expect(outlet.state()).toBe('loaded');
  });

  it('should support a redirectTo generator that yields tracked dependencies', () => {
    const { Auth, provideAuth } = craftService(
      { name: 'Auth', scope: 'toProvide' },
      () => ({ isAdmin: () => true }),
    );
    const { testRoutes: appRoutes } = craftRoutes('test', [
      {
        path: '',
        pathMatch: 'full',
        providers: [provideAuth()],
        redirectTo: function* () {
          const auth = yield* Auth();
          return auth.isAdmin() ? '/pizzerias/admin' : '/pizzerias';
        },
      },
    ]);

    const routeConfig = appRoutes.toRoutes()[0];
    const activatedRoute = createActivatedRouteStub();
    const injector = createRouteInjector(
      routeConfig.providers,
      activatedRoute.route,
      undefined,
      routeConfig.path,
    );

    expect(typeof routeConfig.redirectTo).toBe('function');

    const produced = (
      routeConfig.redirectTo as (
        snapshot: PartialMatchRouteSnapshot,
      ) => Generator<unknown, string, unknown>
    )(partialMatchRouteSnapshotStub);

    const result = runInInjectionContext(injector, () =>
      runCraftGenerator({
        iterator: produced,
        injector,
        hostScope: 'function',
        invalidYieldErrorMessage: 'invalid redirect yield',
        multipleAppStartErrorMessage: 'multiple redirect app start',
      }).value,
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

  it('follows a craftRoutes-compiled function redirectTo through the matcher', () => {
    const { testRoutes: appRoutes } = craftRoutes('test', [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: () => '/home',
      },
      {
        path: 'home',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
      },
    ]);

    const match = matchCraftRoutes(appRoutes.toRoutes(), {
      pathname: '/',
      search: '',
      hash: '',
    });

    expect(match?.pathname).toBe('/home');
    expect(match?.route.path).toBe('home');
  });

  it('follows a craftRoutes-compiled generator redirectTo through the matcher', () => {
    const { testRoutes: appRoutes } = craftRoutes('test', [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: function* () {
          return '/home';
        },
      },
      {
        path: 'home',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
      },
    ]);

    const match = matchCraftRoutes(appRoutes.toRoutes(), {
      pathname: '/',
      search: '',
      hash: '',
    });

    expect(match?.pathname).toBe('/home');
    expect(match?.route.path).toBe('home');
  });

  it('should resolve params from the matching child ActivatedRoute in lazy contexts', () => {
    const routes = craftRoutes('test', [
      {
        path: 'users/:userId',
        data: {
          title: 'Lazy route',
        },
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
      },
    ]);
    const { testRoutes: appRoutes, injectTestUserIdParams: injectUserId } =
      routes;
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
      activatedRoute.childRoute,
      undefined,
      routeConfig.path,
    );

    const userId = runInInjectionContext(injector, () => injectUserId());

    expect(userId()).toBe('42');
    expect('injectTestUsersUserIdData' in routes).toBe(false);
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

  it('should accept a component route without legacy componentDeps', () => {
    const { testRoutes } = craftRoutes('test', [
      {
        path: 'query/:userId',
        loadComponent: async () => null as unknown as Type<unknown>,
      },
    ]);

    expect(testRoutes.META_DATA).toEqual([{ path: 'query/:userId' }]);
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
    const { provideCounter, Counter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );

    type ChildRouteDeps = GetDeps<{
      deps: {};
      provided: {};
      publicProperties: {};
      missingProvider: {
        Counter: ReturnType<typeof Counter>;
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

    expectTypeOf(parentRoutes.META_PATHS).toEqualTypeOf<
      readonly [
        { path: 'layout/:teamId' },
        { path: 'layout/:teamId/users/:userId' },
      ]
    >();
  });

  it('should not treat sibling route providers as covering lazy child missing providers', () => {
    const { provideCounter, Counter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );

    type ChildRouteDeps = GetDeps<{
      deps: {};
      provided: {};
      publicProperties: {};
      missingProvider: {
        Counter: ReturnType<typeof Counter>;
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

    expectTypeOf(parentRoutes.META_PATHS).toEqualTypeOf<
      readonly [
        { path: 'other' },
        { path: 'layout/:teamId' },
        { path: 'layout/:teamId/users/:userId' },
      ]
    >();
  });

  it('should merge parent loadComponent missing providers with lazy child missing providers', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );
    const { Permissions } = craftService(
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
        Counter: GetServiceDependencies<typeof Counter>;
      };
    }>;

    type ChildRouteDeps = GetDeps<{
      deps: {};
      provided: {};
      publicProperties: {};
      missingProvider: {
        Permissions: GetServiceDependencies<typeof Permissions>;
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
            Counter: GetServiceDependencies<typeof Counter>;
          };
        },
        {
          path: 'layout/:teamId/users/:userId';
          deps: {};
          provided: {};
          publicProperties: {};
          missingProvider: {
            Counter: GetServiceDependencies<typeof Counter>;
            Permissions: GetServiceDependencies<typeof Permissions>;
          };
        },
      ]
    >();
  });

  it('should place flattened lazy child metadata after the parent entry in mixed route tuples', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );
    const { Permissions } = craftService(
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
        Counter: GetServiceDependencies<typeof Counter>;
        Permissions: GetServiceDependencies<typeof Permissions>;
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
        Counter: GetServiceDependencies<typeof Counter>;
        Permissions: GetServiceDependencies<typeof Permissions>;
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

    type HttpRouteDeps = GetDeps<{
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

    const { LayoutApi } = craftService(
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

    const { ChildApi } = craftService(
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
          LayoutApi: GetServiceDependencies<typeof LayoutApi>;
        };
      };
      provided: {};
      publicProperties: {};
    }>;

    type ChildRouteDeps = GetDeps<{
      deps: {};
      propertiesDeps: {
        childApi: {
          ChildApi: GetServiceDependencies<typeof ChildApi>;
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

    // Unmatched inputs no longer collapse the whole result: they are surfaced
    // through the exported error map (and META_DATA.publicProperties), checked
    // at app-config level where the parent-mount context is known.
    type RouteErrors = CraftRoutesPublicPropertiesErrors<
      (typeof routes.testRoutes)['_routes']
    >;
    expectTypeOf<RouteErrors>().toEqualTypeOf<{
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
      undefined,
      routeConfig.path,
    );

    const userId = runInInjectionContext(injector, () => injectUserId());
    expect(userId()).toBe('12');

    activatedRoute.setParams({
      userId: '34',
    });

    expect(userId()).toBe('34');
  });

  it('should yield route data in providers and preserve explicit providers', () => {
    const marker = new InjectionToken<string>('marker');
    const { RouteData, provideRouteData } = craftService(
      { name: 'RouteData', scope: 'abstract' },
      abstract<Signal<{ readonly myCustomData: 'test' }>>(),
    );
    const { testRoutes: appRoutes } = craftRoutes('test', [
      craftRoute('mutation/:userId', {
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
        data: {
          myCustomData: 'test' as const,
        },
        providers: [
          {
            provide: marker,
            useValue: 'kept',
          },
        ] as Provider[],
      }).withProviders(({ Data }) => [
        provideRouteData(function* () {
          return yield* Data();
        }),
      ]),
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

    expect(routeConfig.providers).toHaveLength(5);

    const injector = createRouteInjector(
      routeConfig.providers,
      activatedRoute.route,
      undefined,
      routeConfig.path,
    );

    expect(runInInjectionContext(injector, () => craftUse(HostName()))).toBe(
      'route:mutation/:userId',
    );
    expect(injector.get(HOST_TAG_LIST)).toEqual([
      expect.stringMatching(/^route:mutation\/:userId#\d+$/),
    ]);

    const routeData = runInInjectionContext(injector, () =>
      craftUse(RouteData()),
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
      expect.stringMatching(/^component:App#\d+$/),
      expect.stringMatching(/^route:page#\d+$/),
      expect.stringMatching(/^component:Page#\d+$/),
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
        queryParams: function* () {
          const pagination = yield* queryParams('pagination', {
            state: {
              page: {
                fallbackValue: 1,
                codec: {
                  decode: (value: string) => parseInt(value, 10),
                  encode: (value: number) => String(value),
                },
              },
            },
          });
          return pagination;
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

  it('should stash craft guards on CRAFT_ROUTE_META', () => {
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
    const meta = routeConfig.data?.[CRAFT_ROUTE_META] as
      | { guard?: unknown; match?: unknown }
      | undefined;

    expect(typeof meta?.guard).toBe('function');
    expect(typeof meta?.match).toBe('function');
    expect(routeConfig.canActivate).toBeUndefined();
    expect(routeConfig.canMatch).toBeUndefined();
  });

  it('should wait for a defined signal result in canActivate and then accept — outlet-driven guards', async () => {
    const guardResult = signal<GuardResult | undefined>(undefined);
    const { testRoutes: appRoutes } = craftRoutes('test', [
      {
        path: 'guard',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
        canActivate: () => guardResult,
      },
    ]);

    const outlet = activateCraftRoutes(appRoutes.toRoutes(), '/guard');
    await flushChain();
    expect(outlet.state()).not.toBe('loaded');

    guardResult.set(true);
    TestBed.flushEffects();
    await flushChain();

    expect(outlet.state()).toBe('loaded');
  });

  it('should wait for a defined signal result in canActivate and then reject — outlet-driven guards', async () => {
    const guardResult = signal<GuardResult | undefined>(undefined);
    const { testRoutes: appRoutes } = craftRoutes('test', [
      {
        path: 'guard',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
        canActivate: () => guardResult,
      },
    ]);

    const outlet = activateCraftRoutes(appRoutes.toRoutes(), '/guard');
    await flushChain();
    expect(outlet.state()).not.toBe('loaded');

    guardResult.set(false);
    TestBed.flushEffects();
    await flushChain();

    expect(outlet.state()).not.toBe('loaded');
  });

  it('should allow canActivate generators to yield multiple services and return an observable — outlet-driven guards', async () => {
    const authAccess$ = new BehaviorSubject(true);
    const entityOperational$ = new BehaviorSubject(true);
    const { Auth, provideAuth } = craftService(
      { name: 'Auth', scope: 'toProvide' },
      () => ({
        canAccess$: authAccess$.asObservable(),
      }),
    );
    const { Entity, provideEntity } = craftService(
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
          const auth = yield* Auth();
          const entity = yield* Entity();

          return combineLatest([auth.canAccess$, entity.isOperational$]).pipe(
            map(([canAccess, isOperational]) => canAccess && isOperational),
          );
        },
      },
    ]);

    const outlet = activateCraftRoutes(appRoutes.toRoutes(), '/guard');
    await flushChain();

    expect(outlet.state()).toBe('loaded');
  });

  it('should allow canMatch generators to yield services and return a synchronous result — outlet-driven guards', async () => {
    const { Permissions, providePermissions } = craftService(
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
          const permissions = yield* Permissions();

          return permissions.allow;
        },
      },
    ]);

    const outlet = activateCraftRoutes(appRoutes.toRoutes(), '/guard');
    await flushChain();

    expect(outlet.state()).toBe('loaded');
  });

  it('should wait for craftUntilSettled in canMatch before activating a lazy dashboard route — outlet-driven guards', async () => {
    class AdminDashboardComponent {}

    const { testRoutes: appRoutes } = craftRoutes('test', [
      craftRoute('dashboard', {
        componentDeps: {},
        loadComponent: ({ withRetry }) =>
          withRetry(Promise.resolve({ AdminDashboardComponent })).then(
            (m) => m.AdminDashboardComponent,
          ),
        canMatch: function* () {
          const settledAccess = yield* craftUntilSettled(
            fakeHttpCall(Promise.resolve({ kind: 'admin' as const })),
          );

          return settledAccess.kind === 'admin';
        },
      }),
    ]);

    const outlet = activateCraftRoutes(appRoutes.toRoutes(), '/dashboard');
    await flushChain();

    expect(outlet.state()).toBe('loaded');
    expect(outlet.targetComponent()).toBe(AdminDashboardComponent);
  });

  // The legacy blocking-guard describes ('craftCanActivate' / 'craftCanMatch')
  // were removed: guards are no longer registered as Angular route guards —
  // CraftRouterOutlet drives them after the URL commits and resolves their
  // exceptions through the route-level `handleExceptions` (3rd argument of
  // `craftRoute`). Runtime coverage lives in craft-guard-runtime.spec.ts,
  // type-level exhaustiveness coverage in craft-routes-ux.spec.ts.

  it('should resolve an observable canMatch result once it emits a defined value — outlet-driven guards', async () => {
    const guardResult = new BehaviorSubject<GuardResult | undefined>(undefined);
    const { testRoutes: appRoutes } = craftRoutes('test', [
      {
        path: 'guard',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
        canMatch: (() => guardResult.asObservable()) as unknown as never,
      },
    ]);

    const outlet = activateCraftRoutes(appRoutes.toRoutes(), '/guard');
    await flushChain();
    expect(outlet.state()).not.toBe('loaded');

    guardResult.next(true);
    await flushChain();

    expect(outlet.state()).toBe('loaded');
  });

  it('should throw when canActivate synchronously returns undefined — outlet-driven guards', () => {
    const { testRoutes: appRoutes } = craftRoutes('test', [
      {
        path: 'guard',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
        canActivate: (() => undefined) as unknown as never,
      },
    ]);

    const routeConfig = appRoutes.toRoutes()[0];
    const meta = getCraftRouteMeta(routeConfig.data);
    const injector = Injector.create({ providers: [] });

    expect(() =>
      runInInjectionContext(injector, () =>
        runCraftGenerator({
          iterator: meta!.guard!({} as never, {} as never),
          injector,
          hostScope: 'function',
          invalidYieldErrorMessage: 'invalid guard yield',
          multipleAppStartErrorMessage: 'multiple guard app start',
        }),
      ),
    ).toThrow(
      'Route "guard" canActivate guard must not synchronously return undefined.',
    );
  });

  describe('craftRoute().withProviders()', () => {
    type User = { id: number; name: string };

    it('should build a route-level provider from typed route-scoped  helpers — outlet-driven guards', async () => {
      const { User, provideUser } = craftService(
        { name: 'User', scope: 'abstract' },
        abstract<User>(),
      );

      const { wpRoutes } = craftRoutes('wp', [
        craftRoute('dashboard/:userId', {
          loadComponent: async () => null as unknown as Type<unknown>,
          componentDeps: {},
          canActivate: (): User | false => ({ id: 9, name: 'Carol' }),
        }).withProviders(({ GuardedData }) => [
          provideUser(function* () {
            const guarded = yield* GuardedData();
            return guarded();
          }),
        ]),
      ]);

      const outlet = activateCraftRoutes(
        wpRoutes.toRoutes(),
        '/dashboard/9',
      );
      await flushChain();

      expect(outlet.state()).toBe('loaded');
      const user = runInInjectionContext(
        outlet.displayedInjector() ?? TestBed.inject(Injector),
        () => craftUse(User()),
      );
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
          ReturnType<typeof helpers.GuardedData> extends Generator<
            any,
            infer R,
            any
          >
            ? R
            : never;
        expectTypeOf<GuardedReturn>().toEqualTypeOf<Signal<User>>();

        type ParamReturn =
          ReturnType<typeof helpers.UserIdParams> extends Generator<
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

    it('should expose a typed yield helper when guard returns User | false', () => {
      const routes = craftRoutes('app', [
        {
          path: 'dashboard',
          loadComponent: async () => null as unknown as Type<unknown>,
          componentDeps: {},
          canActivate: (): User | false => ({ id: 1, name: 'Alice' }),
        },
      ]);
      const { appRoutes: _appRoutes, AppDashboardGuardedData } = routes;

      expectTypeOf(AppDashboardGuardedData).toEqualTypeOf<
        CraftRouteYieldHelper<'AppDashboardGuardedData', Signal<User>>
      >();
      expect('injectAppDashboardGuardedData' in routes).toBe(false);
    });

    it('should not expose yield helper when guard returns only boolean', () => {
      const routes = craftRoutes('app', [
        {
          path: 'dashboard',
          loadComponent: async () => null as unknown as Type<unknown>,
          componentDeps: {},
          canActivate: (): boolean => true,
        },
      ]);

      // @ts-expect-error no guarded data yield helper when guard returns only boolean
      routes.AppDashboardGuardedData;
    });

    it('should set guard data signal when sync guard returns an object — outlet-driven guards', async () => {
      const { appRoutes, AppDashboardGuardedData } = craftRoutes('app', [
        {
          path: 'dashboard',
          loadComponent: async () => null as unknown as Type<unknown>,
          componentDeps: {},
          canActivate: (): User | false => ({ id: 42, name: 'Alice' }),
        },
      ]);

      const outlet = activateCraftRoutes(appRoutes.toRoutes(), '/dashboard');
      await flushChain();

      expect(outlet.state()).toBe('loaded');
      const guardData = resolveRouteYield<Signal<User>>(
        AppDashboardGuardedData(),
        outlet.displayedInjector() ?? TestBed.inject(Injector),
      );

      expectTypeOf(guardData).toEqualTypeOf<Signal<User>>();
      expect(guardData()).toEqual({ id: 42, name: 'Alice' });
    });

    it('should set guard data signal when generator guard yields services and returns an object — outlet-driven guards', async () => {
      const { Auth, provideAuth } = craftService(
        { name: 'Auth', scope: 'toProvide' },
        () => ({ currentUser: { id: 7, name: 'Bob' } as User }),
      );

      const { appRoutes, AppDashboardGuardedData } = craftRoutes('app', [
        {
          path: 'dashboard',
          loadComponent: async () => null as unknown as Type<unknown>,
          componentDeps: {},
          providers: [provideAuth()],
          canActivate: function* () {
            const auth = yield* Auth();
            return auth.currentUser;
          },
        },
      ]);

      const outlet = activateCraftRoutes(appRoutes.toRoutes(), '/dashboard');
      await flushChain();

      const guardData = resolveRouteYield<Signal<User>>(
        AppDashboardGuardedData(),
        outlet.displayedInjector() ?? TestBed.inject(Injector),
      );

      expect(guardData()).toEqual({ id: 7, name: 'Bob' });
    });

    it('should set guard data signal when Observable guard emits an object — outlet-driven guards', async () => {
      const subject = new BehaviorSubject<User | false | undefined>(undefined);

      const { appRoutes, AppDashboardGuardedData } = craftRoutes('app', [
        {
          path: 'dashboard',
          loadComponent: async () => null as unknown as Type<unknown>,
          componentDeps: {},
          canActivate: () => subject.asObservable(),
        },
      ]);

      const outlet = activateCraftRoutes(appRoutes.toRoutes(), '/dashboard');
      await flushChain();
      expect(outlet.state()).not.toBe('loaded');

      subject.next({ id: 99, name: 'Carol' });
      await flushChain();

      expect(outlet.state()).toBe('loaded');
      const guardData = resolveRouteYield<Signal<User>>(
        AppDashboardGuardedData(),
        outlet.displayedInjector() ?? TestBed.inject(Injector),
      );

      expect(guardData()).toEqual({ id: 99, name: 'Carol' });
    });

    it('should block navigation when guard returns false and not crash — outlet-driven guards', async () => {
      const { appRoutes, AppDashboardGuardedData: _guardedData } = craftRoutes(
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

      const outlet = activateCraftRoutes(appRoutes.toRoutes(), '/dashboard');
      await flushChain();

      expect(outlet.state()).not.toBe('loaded');
      expect(outlet.targetComponent()).toBeNull();
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

    type RouteErrors = CraftRoutesPublicPropertiesErrors<
      (typeof routes.testRoutes)['_routes']
    >;
    expectTypeOf<RouteErrors>().toEqualTypeOf<{
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

    type RouteErrors = CraftRoutesPublicPropertiesErrors<
      (typeof routes.testRoutes)['_routes']
    >;
    expectTypeOf<RouteErrors>().toEqualTypeOf<{
      '': {
        userId: 'The input userId is not matching any route param or data property';
      };
      'query/:userId': {
        userId: 'The input userId is not matching any route param or data property';
      };
    }>();
  });

  it('should remove matching params / inputs from publicProperties deps', () => {
    const { Counter, provideCounter } = craftService(
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

      counter = craftUse(Counter());
    }

    type GenDeps_UserComponent = GetDeps<{
      deps: {
        Counter: GetServiceDependencies<typeof Counter>;
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
    const META_DATA = (
      appRoutes as unknown as {
        META_DATA: readonly { path: string }[];
      }
    ).META_DATA;
    expect(META_DATA[0].path).toBe('query/:userId');
  });

  it('should not throw an error if a provider is missing,', () => {
    const { Counter, provideCounter } = craftService(
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

      counter = craftUse(Counter());
    }

    type GenDeps_UserComponent = GetDeps<{
      deps: {
        Counter: GetServiceDependencies<typeof Counter>;
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
    const { PaginationRules } = craftService(
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
          yield* Console.log('init list queryParams');

          return yield* queryParams(
            'queryParams',
            {
              state: {
                page: {
                  fallbackValue: 1,
                  codec: {
                    decode: (value: string) => parseInt(value, 10),
                    encode: (value: number) => String(value),
                  },
                },
              },
            },
            function* ({ patch, state }) {
              const rules = yield* PaginationRules(
                undefined,
                ({ maxPage }) => ({
                  maxPage,
                }),
              );

              return {
                nextPage: () => {
                  if (craftUse(state()).page >= rules.maxPage()) {
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
            ConsoleService: GetServiceDependencies<typeof ConsoleService>;
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
    const { Counter, provideCounter } = craftService(
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
          yield* Counter();

          return yield* queryParams('queryParams', {
            state: {
              page: {
                fallbackValue: 1,
                codec: {
                  decode: (value: string) => parseInt(value, 10),
                  encode: (value: number) => String(value),
                },
              },
            },
          });
        },
      },
    ]);

    expectTypeOf(appRoutes.META_PATHS).toEqualTypeOf<
      readonly [{ path: 'counter'; queryParams: { page: string } }]
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
        queryParams: function* () {
          const pagination = yield* queryParams('pagination', {
            state: {
              page: {
                fallbackValue: 1,
                codec: {
                  decode: (value: string) => parseInt(value, 10),
                  encode: (value: number) => String(value),
                },
              },
            },
          });
          return pagination;
        },
        loadChildren: () => childRoutes.childRoutes,
      },
    ]);

    expectTypeOf(parentRoutes.META_DATA).toEqualTypeOf<
      readonly [
        {
          path: 'layout';
          queryParams: { page: string };
          deps: {};
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
    const { Counter } = craftService(
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
          yield* Counter();
          return true;
        },
      },
    ]);

    expectTypeOf(appRoutes.META_DATA).toEqualTypeOf<
      readonly [
        {
          path: 'counter';
          deps: {
            Counter: GetServiceDependencies<typeof Counter>;
          };
          provided: {};
          publicProperties: {};
        },
      ]
    >();
  });

  it('should remove generator guard deps when satisfied by route providers', () => {
    const { Counter, provideCounter } = craftService(
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
          yield* Counter();
          return true;
        },
      },
    ]);

    expectTypeOf(appRoutes.META_PATHS).toEqualTypeOf<
      readonly [{ path: 'counter' }]
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

    expectTypeOf(appRoutes.META_PATHS).toEqualTypeOf<
      readonly [{ path: 'counter' }]
    >();
  });

  it('should include canActivate generator handler deps in META_DATA', () => {
    const { RedirectConfig } = craftService(
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
      craftRoute(
        'admin',
        {
          loadComponent: async () => null as unknown as Type<unknown>,
          componentDeps: {} as GuardRouteDeps,
          canActivate: function* () {
            yield* authGuard();
            return true;
          },
        },
        {
          // Generator handler — its yielded service is tracked as a route dep.
          NOT_AUTHENTICATED: craftExceptionHandler(function* ({ redirectUrl }) {
            const config = yield* RedirectConfig();
            return redirectUrl(config.loginUrl);
          }),
        },
      ),
    ]);

    expectTypeOf(appRoutes.META_DATA).toEqualTypeOf<
      readonly [
        {
          path: 'admin';
          deps: {
            RedirectConfig: GetServiceDependencies<typeof RedirectConfig>;
          };
          provided: {};
          publicProperties: {};
        },
      ]
    >();
  });

  it('should strip canActivate handler deps satisfied by route providers', () => {
    const { RedirectConfig, provideRedirectConfig } = craftService(
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
      craftRoute(
        'admin',
        {
          loadComponent: async () => null as unknown as Type<unknown>,
          componentDeps: {} as GuardRouteDeps,
          providers: [provideRedirectConfig()],
          canActivate: function* () {
            yield* authGuard();
            return true;
          },
        },
        {
          NOT_AUTHENTICATED: craftExceptionHandler(function* ({ redirectUrl }) {
            const config = yield* RedirectConfig();
            return redirectUrl(config.loginUrl);
          }),
        },
      ),
    ]);

    expectTypeOf(appRoutes.META_PATHS).toEqualTypeOf<
      readonly [{ path: 'admin' }]
    >();
  });

  it('should flatten lazy route metadata and inherit providers, params and data', () => {
    const { Counter, provideCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );

    type ChildRouteDeps = GetDeps<{
      deps: {
        Counter: GetServiceDependencies<typeof Counter>;
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

    expectTypeOf(appRoutes.META_PATHS).toEqualTypeOf<
      readonly [{ path: 'users/:userId' }, { path: 'users/:userId/details' }]
    >();
  });
});

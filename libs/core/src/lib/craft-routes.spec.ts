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

  it('should accept craft-aware loadChildren without componentDeps and defer lazy route conversion', async () => {
    let loaded = false;
    const childRoutes = craftRoutes([
      {
        path: 'details/:teamId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
      },
    ]);
    const { appRoutes } = craftRoutes([
      {
        path: 'users/:userId',
        loadChildren: () => {
          loaded = true;
          return childRoutes.appRoutes;
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
    const childRoutes = craftRoutes([
      {
        path: 'details/:teamId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
      },
    ]);
    const { appRoutes, injectUserId } = craftRoutes([
      {
        path: 'users/:userId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
        loadChildren: () => {
          loaded = true;
          return childRoutes.appRoutes;
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
    const { appRoutes, injectUserId, injectUsersUserIdData } = craftRoutes([
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

    craftRoutes([
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

  it('should keep lazy child inject helpers scoped to the lazy module result', () => {
    const childRoutes = craftRoutes([
      {
        path: 'details/:teamId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {},
      },
    ]);
    const parentRoutes = craftRoutes([
      {
        path: 'users',
        loadChildren: () => childRoutes.appRoutes,
      },
    ]);

    expect(childRoutes.injectTeamId).toBeTypeOf('function');
    // @ts-expect-error lazy child helpers should stay scoped to the lazy routes module
    type LazyHelperShouldStayLocal = typeof parentRoutes.injectTeamId;
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

  it('should wrap craft guards into Angular guard arrays', () => {
    const { appRoutes } = craftRoutes([
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
    const { appRoutes } = craftRoutes([
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
    const { appRoutes } = craftRoutes([
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
    const { appRoutes } = craftRoutes([
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
    const { appRoutes } = craftRoutes([
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
    const { appRoutes } = craftRoutes([
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
    const { appRoutes } = craftRoutes([
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

  it('should include generator guard deps in META_DATA', () => {
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

    const { appRoutes } = craftRoutes([
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

    const { appRoutes } = craftRoutes([
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

    const childRoutes = craftRoutes([
      {
        path: 'details',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as ChildRouteDeps,
      },
    ]);
    const { appRoutes } = craftRoutes([
      {
        path: 'users/:userId',
        data: {
          sectionTitle: 'Users',
        },
        loadChildren: () => childRoutes.appRoutes,
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

  it('should flatten metadata for layout routes with loadChildren', () => {
    type LayoutRouteDeps = GetDeps<{
      provided: {};
      publicProperties: {
        userId: () => string;
        sectionTitle: () => string;
      };
    }>;

    type ChildRouteDeps = GetDeps<{
      deps: {};
      provided: {};
      publicProperties: {
        sectionTitle: () => string;
        teamId: () => string;
        userId: () => string;
      };
    }>;

    const childRoutes = craftRoutes([
      {
        path: 'details/:teamId',
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as ChildRouteDeps,
      },
    ]);
    const { appRoutes } = craftRoutes([
      {
        path: 'users/:userId',
        data: {
          sectionTitle: 'Users',
        },
        loadComponent: async () => null as unknown as Type<unknown>,
        componentDeps: {} as LayoutRouteDeps,
        loadChildren: () => childRoutes.appRoutes,
      },
    ]);

    expectTypeOf(appRoutes.META_DATA).toEqualTypeOf<
      readonly [
        {
          path: 'users/:userId';
          provided: {};
          publicProperties: {};
        },
        {
          path: 'users/:userId/details/:teamId';
          deps: {};
          provided: {};
          publicProperties: {};
        },
      ]
    >();
  });
});

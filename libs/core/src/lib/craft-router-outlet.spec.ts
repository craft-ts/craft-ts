// @vitest-environment jsdom
import '@angular/compiler';
import {
  Component,
  createEnvironmentInjector,
  EnvironmentInjector,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { craftException } from './craft-exception';
import type { RouteChainOutcome } from './craft-guard-runtime';
import { CRAFT_GLOBAL_ERROR } from './craft-route-exceptions';
import { CRAFT_ROUTE_META, type CraftRouteMeta } from './craft-route-meta';
import { CRAFT_ROUTE_TARGET, craftRouteTarget } from './craft-route-target';
import { craftService } from './craft-service';
import {
  CRAFT_ROUTE_CHAIN_RUNNER,
  CRAFT_SYNC_TEMPLATE_FLUSH,
  collectMatchProps,
  createCraftRouterOutletController,
  type CraftRouterOutletController,
  resolveComponentInput,
} from './craft-router-outlet';
import type {
  CraftCompiledRoute,
  CraftMatch,
} from './host/craft-router-runtime';
import {
  CRAFT_HISTORY,
  CRAFT_MATCH,
  CRAFT_ROUTER,
  provideCraftRouter,
  type CraftRouterNavigationApi,
} from './craft-router';
import {
  CRAFT_START_VIEW_TRANSITION,
  CRAFT_VIEW_TRANSITION_SKIP_BLANK,
  CRAFT_VIEW_TRANSITIONS_ENABLED,
} from './craft-view-transition';

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

@Component({ selector: 'spec-target', standalone: true, template: `target` })
class TargetCmp {}

@Component({ selector: 'spec-err', standalone: true, template: `error` })
class ErrCmp {}

@Component({ selector: 'spec-parent', standalone: true, template: `parent` })
class ParentCmp {}

@Component({ selector: 'spec-child', standalone: true, template: `child` })
class ChildCmp {}

function dummyGen(): Generator<unknown, unknown, unknown> {
  return (function* () {
    return undefined;
  })();
}

function makeMeta(overrides: Partial<CraftRouteMeta> = {}): CraftRouteMeta {
  return {
    match: undefined,
    guard: () => dummyGen(),
    resolve: () => dummyGen(),
    handleExceptions: {},
    guardDataSink: signal<unknown>(undefined),
    resolveDataSink: signal<unknown>(undefined),
    exceptionSinks: {},
    pendingComponent: undefined,
    errorComponent: undefined,
    stayMs: undefined,
    blankMs: undefined,
    pendingMinMs: undefined,
    reactiveGuards: false,
    ...overrides,
  };
}

function makeMatch(
  meta: CraftRouteMeta | undefined,
  component: unknown = TargetCmp,
  extras: Partial<CraftCompiledRoute> = {},
  location: { pathname?: string; search?: string } = {},
): CraftMatch {
  const data = meta ? { [CRAFT_ROUTE_META]: meta } : {};
  const route: CraftCompiledRoute = {
    path: 'a',
    component,
    data,
    ...extras,
  };
  const pathname = location.pathname ?? '/a';
  const search = location.search ?? '';
  return {
    pathname,
    search,
    hash: '',
    params: {},
    queryParams: {},
    route,
    routes: [route],
    data,
  };
}

function stubRouter(): CraftRouterNavigationApi {
  return {
    url: '/',
    createUrlTree: (input) => ({
      toString: () => `/${input.to}`,
      __craftUrlTree: true as const,
    }),
    navigate: vi.fn(async () => true),
    navigateByUrl: vi.fn(async () => true),
    serializeUrl: (tree) => tree.toString(),
    getCurrentNavigation: () => null,
  };
}

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const flushChain = async () => {
  for (let i = 0; i < 12; i += 1) {
    await Promise.resolve();
  }
};

describe('CraftRouterOutlet', () => {
  let deferred: {
    promise: Promise<RouteChainOutcome>;
    resolve: (outcome: RouteChainOutcome) => void;
  };
  let runner: ReturnType<typeof vi.fn>;

  function setup(): {
    outlet: CraftRouterOutletController;
    router: CraftRouterNavigationApi;
  } {
    let resolve!: (outcome: RouteChainOutcome) => void;
    const promise = new Promise<RouteChainOutcome>((r) => (resolve = r));
    deferred = { promise, resolve };
    runner = vi.fn(() => deferred.promise);
    const router = stubRouter();

    TestBed.configureTestingModule({
      providers: [
        { provide: CRAFT_ROUTER, useValue: router },
        { provide: CRAFT_ROUTE_CHAIN_RUNNER, useValue: runner },
      ],
    });

    return {
      outlet: TestBed.runInInjectionContext(() =>
        createCraftRouterOutletController(),
      ),
      router,
    };
  }

  function activate(
    outlet: CraftRouterOutletController,
    meta: CraftRouteMeta | undefined,
  ) {
    outlet.activateMatch(makeMatch(meta), TestBed.inject(EnvironmentInjector));
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a plain route (no craft meta) immediately, like <router-outlet>', () => {
    const { outlet } = setup();
    activate(outlet, undefined);
    expect(outlet.state()).toBe('loaded');
    expect(outlet.targetComponent()).toBe(TargetCmp);
  });

  it('activates the matched route after a Craft history push', () => {
    TestBed.configureTestingModule({
      providers: [provideCraftRouter([{ path: 'a', component: TargetCmp }])],
    });
    const outlet = TestBed.runInInjectionContext(() =>
      createCraftRouterOutletController(),
    );
    TestBed.inject(CRAFT_HISTORY).push('/a');
    expect(outlet.state()).toBe('loaded');
    expect(outlet.targetComponent()).toBe(TargetCmp);
  });

  it('replaces the URL for a compiled redirectTo and mounts the target', () => {
    window.history.replaceState(null, '', '/');
    TestBed.configureTestingModule({
      providers: [
        provideCraftRouter([
          { path: '', redirectTo: '/home' },
          { path: 'home', component: TargetCmp },
        ]),
      ],
    });
    const outlet = TestBed.runInInjectionContext(() =>
      createCraftRouterOutletController(),
    );

    expect(TestBed.inject(CRAFT_HISTORY).get().pathname).toBe('/home');
    expect(outlet.targetComponent()).toBe(TargetCmp);
    expect(outlet.state()).toBe('loaded');
    window.history.replaceState(null, '', '/');
  });

  it('activates the lazy child after resolving loadChildren for /slow-page', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideCraftRouter([
          {
            path: 'slow-page',
            loadChildren: async () => [{ path: '', component: TargetCmp }],
          },
        ]),
      ],
    });
    const outlet = TestBed.runInInjectionContext(() =>
      createCraftRouterOutletController(),
    );

    TestBed.inject(CRAFT_HISTORY).push('/slow-page');
    await flush();

    expect(outlet.state()).toBe('loaded');
    expect(outlet.targetComponent()).toBe(TargetCmp);
  });

  it('activates a lazy child with remaining segments after loadChildren', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideCraftRouter([
          {
            path: 'view-transitions',
            loadChildren: async () => [
              { path: '', component: ErrCmp },
              { path: ':photoId', component: TargetCmp },
            ],
          },
        ]),
      ],
    });
    const outlet = TestBed.runInInjectionContext(() =>
      createCraftRouterOutletController(),
    );

    TestBed.inject(CRAFT_HISTORY).push('/view-transitions/42');
    await flush();

    expect(outlet.state()).toBe('loaded');
    expect(outlet.targetComponent()).toBe(TargetCmp);
  });

  it('does not remount the outlet on a query-only history update', () => {
    TestBed.configureTestingModule({
      providers: [provideCraftRouter([{ path: 'a', component: TargetCmp }])],
    });
    const outlet = TestBed.runInInjectionContext(() =>
      createCraftRouterOutletController(),
    );
    TestBed.inject(CRAFT_HISTORY).push('/a');
    expect(outlet.state()).toBe('loaded');
    const injector = outlet.displayedInjector();
    const matchSignal = injector?.get(CRAFT_MATCH);

    TestBed.inject(CRAFT_HISTORY).push('/a?tab=info');

    expect(outlet.displayedInjector()).toBe(injector);
    expect(outlet.displayedProps()).toEqual({ tab: 'info' });
    expect(outlet.state()).toBe('loaded');
    expect(outlet.targetComponent()).toBe(TargetCmp);
    const liveMatch = matchSignal?.();
    expect(liveMatch?.queryParams).toEqual({ tab: 'info' });
  });

  it('keeps the previous page until loadChildren rematch', async () => {
    let resolveChildren!: (routes: CraftCompiledRoute[]) => void;
    const pending = new Promise<CraftCompiledRoute[]>((resolve) => {
      resolveChildren = resolve;
    });
    TestBed.configureTestingModule({
      providers: [
        provideCraftRouter([
          { path: 'a', component: TargetCmp },
          {
            path: 'slow-page',
            loadChildren: () => pending,
          },
        ]),
      ],
    });
    const outlet = TestBed.runInInjectionContext(() =>
      createCraftRouterOutletController(),
    );

    TestBed.inject(CRAFT_HISTORY).push('/a');
    expect(outlet.targetComponent()).toBe(TargetCmp);
    const injector = outlet.displayedInjector();

    TestBed.inject(CRAFT_HISTORY).push('/slow-page');
    expect(outlet.targetComponent()).toBe(TargetCmp);
    expect(outlet.displayedInjector()).toBe(injector);
    expect(outlet.state()).toBe('loaded');

    resolveChildren([{ path: '', component: ErrCmp }]);
    await flush();

    expect(outlet.state()).toBe('loaded');
    expect(outlet.targetComponent()).toBe(ErrCmp);
  });

  it('keeps the previous page when loadChildren rematch has remaining segments', async () => {
    let resolveChildren!: (routes: CraftCompiledRoute[]) => void;
    const pending = new Promise<CraftCompiledRoute[]>((resolve) => {
      resolveChildren = resolve;
    });
    TestBed.configureTestingModule({
      providers: [
        provideCraftRouter([
          { path: 'a', component: TargetCmp },
          {
            path: 'view-transitions',
            loadChildren: () => pending,
          },
        ]),
      ],
    });
    const outlet = TestBed.runInInjectionContext(() =>
      createCraftRouterOutletController(),
    );

    TestBed.inject(CRAFT_HISTORY).push('/a');
    expect(outlet.targetComponent()).toBe(TargetCmp);

    TestBed.inject(CRAFT_HISTORY).push('/view-transitions/42');
    expect(outlet.targetComponent()).toBe(TargetCmp);
    expect(outlet.state()).toBe('loaded');

    resolveChildren([{ path: ':photoId', component: ErrCmp }]);
    await flush();

    expect(outlet.state()).toBe('loaded');
    expect(outlet.targetComponent()).toBe(ErrCmp);
  });

  it('keeps the previous page when loadChildren fails without an unhandled rejection', async () => {
    const rejections: unknown[] = [];
    const onUnhandled = (event: PromiseRejectionEvent) => {
      rejections.push(event.reason);
      event.preventDefault();
    };
    window.addEventListener('unhandledrejection', onUnhandled);

    TestBed.configureTestingModule({
      providers: [
        provideCraftRouter([
          { path: 'a', component: TargetCmp },
          {
            path: 'slow-page',
            loadChildren: async () => {
              throw new Error('chunk failed');
            },
          },
        ]),
      ],
    });
    const outlet = TestBed.runInInjectionContext(() =>
      createCraftRouterOutletController(),
    );

    TestBed.inject(CRAFT_HISTORY).push('/a');
    expect(outlet.targetComponent()).toBe(TargetCmp);
    const injector = outlet.displayedInjector();

    TestBed.inject(CRAFT_HISTORY).push('/slow-page');
    await flush();

    expect(outlet.targetComponent()).toBe(TargetCmp);
    expect(outlet.displayedInjector()).toBe(injector);
    expect(outlet.state()).toBe('loaded');
    expect(rejections).toEqual([]);
    window.removeEventListener('unhandledrejection', onUnhandled);
  });

  it('mounts the parent at the root outlet and the child at the nested outlet', () => {
    TestBed.configureTestingModule({
      providers: [
        provideCraftRouter([
          {
            path: 'parent',
            component: ParentCmp,
            children: [{ path: 'child', component: ChildCmp }],
          },
        ]),
      ],
    });
    const outlet = TestBed.runInInjectionContext(() =>
      createCraftRouterOutletController(),
    );
    TestBed.inject(CRAFT_HISTORY).push('/parent/child');

    expect(outlet.targetComponent()).toBe(ParentCmp);

    const nested = runInInjectionContext(outlet.displayedInjector()!, () =>
      createCraftRouterOutletController(),
    );

    expect(nested.targetComponent()).toBe(ChildCmp);
    expect(nested.targetComponent()).not.toBe(ParentCmp);
  });

  it('does not remount the parent in a nested outlet when only the layout matched', () => {
    TestBed.configureTestingModule({
      providers: [
        provideCraftRouter([
          {
            path: 'layout',
            component: ParentCmp,
            children: [{ path: 'child', component: ChildCmp }],
          },
        ]),
      ],
    });
    const outlet = TestBed.runInInjectionContext(() =>
      createCraftRouterOutletController(),
    );
    TestBed.inject(CRAFT_HISTORY).push('/layout');

    expect(outlet.targetComponent()).toBe(ParentCmp);

    const nested = runInInjectionContext(outlet.displayedInjector()!, () =>
      createCraftRouterOutletController(),
    );

    expect(nested.targetComponent()).toBeNull();
  });

  it('loads a lazy empty-path child when the parent has a component', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideCraftRouter([
          {
            path: 'layout',
            component: ParentCmp,
            loadChildren: async () => [{ path: '', component: ChildCmp }],
          },
        ]),
      ],
    });
    const outlet = TestBed.runInInjectionContext(() =>
      createCraftRouterOutletController(),
    );

    TestBed.inject(CRAFT_HISTORY).push('/layout');
    await flush();

    expect(outlet.targetComponent()).toBe(ParentCmp);

    const nested = runInInjectionContext(outlet.displayedInjector()!, () =>
      createCraftRouterOutletController(),
    );

    expect(nested.targetComponent()).toBe(ChildCmp);
  });

  it('reuses the layout injector when only the child URL params change', () => {
    TestBed.configureTestingModule({
      providers: [
        provideCraftRouter([
          {
            path: 'layout/:teamId',
            component: ParentCmp,
            children: [{ path: 'users/:userId', component: ChildCmp }],
          },
        ]),
      ],
    });
    const outlet = TestBed.runInInjectionContext(() =>
      createCraftRouterOutletController(),
    );
    TestBed.inject(CRAFT_HISTORY).push('/layout/t1/users/1');

    expect(outlet.targetComponent()).toBe(ParentCmp);
    const injector = outlet.displayedInjector();
    const nested = runInInjectionContext(injector!, () =>
      createCraftRouterOutletController(),
    );
    expect(nested.targetComponent()).toBe(ChildCmp);

    TestBed.inject(CRAFT_HISTORY).push('/layout/t1/users/2');

    expect(outlet.displayedInjector()).toBe(injector);
    expect(outlet.targetComponent()).toBe(ParentCmp);
    expect(nested.targetComponent()).toBe(ChildCmp);
    expect(nested.displayedProps()).toEqual(
      expect.objectContaining({ teamId: 't1', userId: '2' }),
    );
  });

  it('publishes a route-scoped Craft target without replacing the Angular route contract', () => {
    const { outlet } = setup();
    const component = { name: 'FunctionalRoute' };
    const routeInjector = createEnvironmentInjector(
      [{ provide: CRAFT_ROUTE_TARGET, useValue: craftRouteTarget(component) }],
      TestBed.inject(EnvironmentInjector),
    );

    outlet.activateMatch(makeMatch(undefined), routeInjector);

    expect(outlet.targetComponent()).toBe(TargetCmp);
    expect(outlet.displayedComponent()).toBe(TargetCmp);
    expect(outlet.displayedTarget()).toEqual({ kind: 'craft', component });
    routeInjector.destroy();
  });

  it('accepts Craft targets for pending and error surfaces', async () => {
    const { outlet } = setup();
    const pending = { name: 'FunctionalPending' };
    const error = { name: 'FunctionalError' };
    activate(
      outlet,
      makeMeta({
        stayMs: 0,
        blankMs: 0,
        pendingComponent: craftRouteTarget(pending),
      }),
    );
    await flush();
    vi.advanceTimersByTime(0);
    expect(outlet.pendingTarget()).toEqual({
      kind: 'craft',
      component: pending,
    });

    deferred.resolve({
      kind: 'render',
      component: { component: craftRouteTarget(error) },
      exception: craftException({ code: 'SPEC_ERROR' }),
    });
    await flush();
    expect(outlet.errorTarget()).toEqual({ kind: 'craft', component: error });
    expect(outlet.displayedTarget()).toEqual({
      kind: 'craft',
      component: error,
    });
  });

  it('starts in the stay phase, then renders the target on data', async () => {
    const { outlet } = setup();
    const meta = makeMeta();
    activate(outlet, meta);
    // Phase 1: previous page kept (no target yet).
    expect(outlet.state()).toBe('stay');
    expect(outlet.targetComponent()).toBeNull();

    deferred.resolve({
      kind: 'data',
      guardData: { u: 1 },
      resolveData: { p: 2 },
    });
    await flush();

    expect(outlet.state()).toBe('loaded');
    expect(outlet.targetComponent()).toBe(TargetCmp);
    expect(meta.guardDataSink?.()).toEqual({ u: 1 });
    expect(meta.resolveDataSink?.()).toEqual({ p: 2 });
  });

  it('a fast chain (within stay) never blanks nor shows the loader', async () => {
    const { outlet } = setup();
    activate(outlet, makeMeta({ stayMs: 300, blankMs: 300 }));
    deferred.resolve({
      kind: 'data',
      guardData: undefined,
      resolveData: undefined,
    });
    await flush();
    expect(outlet.state()).toBe('loaded');
    // Timers are cleared on resolution — advancing does not flip state.
    vi.advanceTimersByTime(2000);
    expect(outlet.state()).toBe('loaded');
  });

  it('walks stay → blank → pending while the chain is in flight', async () => {
    const { outlet } = setup();
    activate(outlet, makeMeta({ stayMs: 300, blankMs: 300 }));
    expect(outlet.state()).toBe('stay');

    // Phase 1 → 2 at stayMs.
    vi.advanceTimersByTime(299);
    expect(outlet.state()).toBe('stay');
    vi.advanceTimersByTime(1);
    expect(outlet.state()).toBe('blank');

    // Phase 2 → 3 at stayMs + blankMs.
    vi.advanceTimersByTime(299);
    expect(outlet.state()).toBe('blank');
    vi.advanceTimersByTime(1);
    expect(outlet.state()).toBe('pending');

    deferred.resolve({
      kind: 'data',
      guardData: undefined,
      resolveData: undefined,
    });
    await flush();
    expect(outlet.state()).toBe('loaded');
  });

  it('keeps the previously displayed page during the stay phase, then blanks it', () => {
    const { outlet } = setup();
    // Simulate a previously-loaded page rendered in the single outlet slot.
    outlet.displayedComponent.set(ErrCmp);

    activate(outlet, makeMeta({ stayMs: 300, blankMs: 300 }));
    // Phase 1: the PREVIOUS page is still what's on screen (no flash of blank).
    expect(outlet.state()).toBe('stay');
    expect(outlet.displayedComponent()).toBe(ErrCmp);

    // Phase 2: the previous page is dropped for a blank surface.
    vi.advanceTimersByTime(300);
    expect(outlet.state()).toBe('blank');
    expect(outlet.displayedComponent()).toBeNull();
  });

  it('anti-flicker: keeps the loader visible at least pendingMinMs', async () => {
    const { outlet } = setup();
    activate(
      outlet,
      makeMeta({ stayMs: 300, blankMs: 300, pendingMinMs: 400 }),
    );
    // Reach the pending (loader) phase at stayMs + blankMs.
    vi.advanceTimersByTime(600);
    expect(outlet.state()).toBe('pending');

    // Chain resolves only 50ms into the loader window.
    vi.advanceTimersByTime(50);
    deferred.resolve({
      kind: 'data',
      guardData: undefined,
      resolveData: undefined,
    });
    await flush();
    // Still pending (must stay for 400ms total).
    expect(outlet.state()).toBe('pending');

    vi.advanceTimersByTime(350);
    expect(outlet.state()).toBe('loaded');
  });

  it('does not apply pendingMinMs when the chain resolves before pending appears', async () => {
    const { outlet } = setup();
    activate(
      outlet,
      makeMeta({ stayMs: 300, blankMs: 300, pendingMinMs: 400 }),
    );

    vi.advanceTimersByTime(599);
    deferred.resolve({
      kind: 'data',
      guardData: undefined,
      resolveData: undefined,
    });
    await flush();

    expect(outlet.state()).toBe('loaded');
    vi.advanceTimersByTime(1000);
    expect(outlet.state()).toBe('loaded');
  });

  it.fails(
    'keeps pending visible for pendingMinMs before a final error',
    async () => {
      const { outlet } = setup();
      const exception = craftException({ code: 'LOAD_FAILED' });
      activate(
        outlet,
        makeMeta({
          stayMs: 300,
          blankMs: 300,
          pendingMinMs: 400,
          errorComponent: { component: ErrCmp, componentDeps: {} },
        }),
      );

      vi.advanceTimersByTime(650);
      deferred.resolve({ kind: 'global', exception });
      await flush();

      expect(outlet.state()).toBe('pending');
      vi.advanceTimersByTime(350);
      await flush();
      expect(outlet.state()).toBe('error');
    },
  );

  it.fails(
    'ignores a late chain resolution after navigation cancellation',
    async () => {
      const { outlet } = setup();
      activate(outlet, makeMeta({ stayMs: 300, blankMs: 300 }));
      outlet.deactivate();
      await flush();

      deferred.resolve({
        kind: 'data',
        guardData: undefined,
        resolveData: undefined,
      });
      await flush();

      expect(outlet.state()).toBe('idle');
      expect(outlet.targetComponent()).toBeNull();
      expect(outlet.displayedComponent()).toBeNull();
    },
  );

  it('redirect outcome navigates and never renders the target', async () => {
    const { outlet, router } = setup();
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    activate(outlet, makeMeta());
    deferred.resolve({ kind: 'redirect', target: '/login' });
    await flush();
    expect(navigate).toHaveBeenCalledWith('/login');
    expect(outlet.targetComponent()).toBeNull();
    expect(outlet.state()).not.toBe('loaded');
  });

  it('stay outcome restores the previous URL', async () => {
    const { outlet, router } = setup();
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const previous = makeMatch(undefined);
    previous.pathname = '/home';
    (router as { url: string }).url = '/home';
    outlet.activateMatch(previous, TestBed.inject(EnvironmentInjector));
    expect(outlet.state()).toBe('loaded');

    (router as { url: string }).url = '/secret';
    outlet.activateMatch(
      makeMatch(makeMeta(), TargetCmp, {}, { pathname: '/secret' }),
      TestBed.inject(EnvironmentInjector),
    );
    deferred.resolve({ kind: 'stay' });
    await flush();
    expect(navigate).toHaveBeenCalledWith('/home');
    expect(navigate).not.toHaveBeenCalledWith('/secret');
    expect(outlet.targetComponent()).toBe(TargetCmp);
    expect(outlet.state()).toBe('stay');
  });

  it('global outcome feeds CRAFT_GLOBAL_ERROR and renders the error component', async () => {
    const { outlet } = setup();
    const exception = craftException({ code: 'USER_DISABLED' });
    activate(
      outlet,
      makeMeta({ errorComponent: { component: ErrCmp, componentDeps: {} } }),
    );
    deferred.resolve({ kind: 'global', exception });
    await flush();
    expect(TestBed.inject(CRAFT_GLOBAL_ERROR)()).toBe(exception);
    expect(outlet.errorComponent()).toBe(ErrCmp);
    expect(outlet.state()).toBe('error');
    expect(outlet.targetComponent()).toBeNull();
  });

  it('publishes a local rendered exception and clears it on navigation', async () => {
    const { outlet } = setup();
    const sink = signal<unknown | null>(null);
    const exception = craftException(
      { code: 'USER_DISABLED' },
      { reason: 'policy' },
    );
    activate(outlet, makeMeta({ exceptionSinks: { USER_DISABLED: sink } }));
    deferred.resolve({
      kind: 'render',
      component: { component: ErrCmp, componentDeps: {} },
      exception,
    });
    await flush();
    expect(sink()).toBe(exception);

    outlet.deactivate();
    expect(sink()).toBeNull();
  });

  it('noop outcome renders the target (resolve data left undefined)', async () => {
    const { outlet } = setup();
    const meta = makeMeta();
    activate(outlet, meta);
    deferred.resolve({ kind: 'noop' });
    await flush();
    expect(outlet.state()).toBe('loaded');
    expect(outlet.targetComponent()).toBe(TargetCmp);
    expect(meta.resolveDataSink?.()).toBeUndefined();
  });
});

describe('CraftRouterOutlet (meta chain via activateMatch)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(): {
    outlet: CraftRouterOutletController;
    router: CraftRouterNavigationApi;
  } {
    const router = stubRouter();
    TestBed.configureTestingModule({
      providers: [{ provide: CRAFT_ROUTER, useValue: router }],
    });
    return {
      outlet: TestBed.runInInjectionContext(() =>
        createCraftRouterOutletController(),
      ),
      router,
    };
  }

  it('writes guard data into the route sink via activateMatch', async () => {
    const { outlet } = setup();
    const meta = makeMeta({
      stayMs: 0,
      blankMs: 0,
      resolve: undefined,
      guard: function* () {
        return { id: 42, name: 'Alice' };
      },
    });

    outlet.activateMatch(makeMatch(meta), TestBed.inject(EnvironmentInjector));
    await flushChain();

    expect(meta.guardDataSink?.()).toEqual({ id: 42, name: 'Alice' });
    expect(outlet.state()).toBe('loaded');
    expect(outlet.targetComponent()).toBe(TargetCmp);
  });

  it('blocks activation when the guard returns false', async () => {
    const { outlet, router } = setup();
    const meta = makeMeta({
      stayMs: 0,
      blankMs: 0,
      resolve: undefined,
      guard: function* () {
        return false;
      },
    });

    outlet.activateMatch(makeMatch(meta), TestBed.inject(EnvironmentInjector));
    await flushChain();

    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(outlet.targetComponent()).toBeNull();
    expect(outlet.state()).not.toBe('loaded');
  });

  it('does not loop when a guard returns false on the initial URL', async () => {
    window.history.replaceState(null, '', '/secret');
    let guardRuns = 0;
    const meta = makeMeta({
      stayMs: 0,
      blankMs: 0,
      resolve: undefined,
      guard: function* () {
        guardRuns += 1;
        if (guardRuns > 8) {
          throw new Error('stay loop: guard re-entered on the committed URL');
        }
        return false;
      },
    });
    TestBed.configureTestingModule({
      providers: [
        provideCraftRouter([
          {
            path: 'secret',
            component: TargetCmp,
            data: { [CRAFT_ROUTE_META]: meta },
          },
        ]),
      ],
    });
    const router = TestBed.inject(CRAFT_ROUTER);
    const navigate = vi.spyOn(router, 'navigateByUrl');
    const outlet = TestBed.runInInjectionContext(() =>
      createCraftRouterOutletController(),
    );
    await flushChain();
    await flushChain();

    expect(guardRuns).toBe(1);
    expect(navigate).not.toHaveBeenCalled();
    expect(outlet.targetComponent()).toBeNull();
    expect(outlet.state()).not.toBe('loaded');
    window.history.replaceState(null, '', '/');
  });

  it('stays when a parent without a component has canActivate false', async () => {
    window.history.replaceState(null, '', '/admin');
    let parentGuardRuns = 0;
    let childGuardRuns = 0;
    const parentMeta = makeMeta({
      stayMs: 0,
      blankMs: 0,
      resolve: undefined,
      guard: function* () {
        parentGuardRuns += 1;
        return false;
      },
    });
    const childMeta = makeMeta({
      stayMs: 0,
      blankMs: 0,
      resolve: undefined,
      guard: function* () {
        childGuardRuns += 1;
        return true;
      },
    });
    TestBed.configureTestingModule({
      providers: [
        provideCraftRouter([
          {
            path: 'admin',
            data: { [CRAFT_ROUTE_META]: parentMeta },
            children: [
              {
                path: '',
                component: TargetCmp,
                data: { [CRAFT_ROUTE_META]: childMeta },
              },
            ],
          },
        ]),
      ],
    });
    const outlet = TestBed.runInInjectionContext(() =>
      createCraftRouterOutletController(),
    );
    await flushChain();

    expect(parentGuardRuns).toBe(1);
    expect(childGuardRuns).toBe(0);
    expect(outlet.targetComponent()).toBeNull();
    expect(outlet.state()).not.toBe('loaded');
    window.history.replaceState(null, '', '/');
  });

  it('writes generator guard data after yielding a craft service', async () => {
    type User = { id: number; name: string };
    const { OutletAuth, provideOutletAuth } = craftService(
      { name: 'OutletAuth', scope: 'toProvide' },
      () => ({ currentUser: { id: 7, name: 'Bob' } as User }),
    );
    const { outlet } = setup();
    const meta = makeMeta({
      stayMs: 0,
      blankMs: 0,
      resolve: undefined,
      guard: function* () {
        const auth = yield* OutletAuth();
        return auth.currentUser;
      },
    });

    outlet.activateMatch(
      makeMatch(meta, TargetCmp, { providers: [provideOutletAuth()] }),
      TestBed.inject(EnvironmentInjector),
    );
    await flushChain();

    expect(meta.guardDataSink?.()).toEqual({ id: 7, name: 'Bob' });
    expect(outlet.state()).toBe('loaded');
    expect(outlet.targetComponent()).toBe(TargetCmp);
  });
});

describe('CraftRouterOutlet (view transitions)', () => {
  let deferred: {
    promise: Promise<RouteChainOutcome>;
    resolve: (outcome: RouteChainOutcome) => void;
  };
  let vtCalls: Array<() => void>;

  function setup(opts: { skipBlank?: boolean } = {}): {
    outlet: CraftRouterOutletController;
  } {
    let resolve!: (outcome: RouteChainOutcome) => void;
    const promise = new Promise<RouteChainOutcome>((r) => (resolve = r));
    deferred = { promise, resolve };
    vtCalls = [];

    TestBed.configureTestingModule({
      providers: [
        { provide: CRAFT_ROUTER, useValue: stubRouter() },
        { provide: CRAFT_ROUTE_CHAIN_RUNNER, useValue: () => deferred.promise },
        { provide: CRAFT_VIEW_TRANSITIONS_ENABLED, useValue: true },
        {
          provide: CRAFT_VIEW_TRANSITION_SKIP_BLANK,
          useValue: opts.skipBlank ?? false,
        },
        {
          // Capture the swap callback, then run it (so the DOM still updates).
          provide: CRAFT_START_VIEW_TRANSITION,
          useValue: (cb: () => void) => {
            vtCalls.push(cb);
            cb();
          },
        },
      ],
    });

    return {
      outlet: TestBed.runInInjectionContext(() =>
        createCraftRouterOutletController(),
      ),
    };
  }

  function activate(outlet: CraftRouterOutletController, meta: CraftRouteMeta) {
    outlet.activateMatch(makeMatch(meta), TestBed.inject(EnvironmentInjector));
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('routes the target swap through CRAFT_START_VIEW_TRANSITION', async () => {
    const { outlet } = setup();
    activate(outlet, makeMeta());
    deferred.resolve({
      kind: 'data',
      guardData: undefined,
      resolveData: undefined,
    });
    await flush();

    expect(outlet.state()).toBe('loaded');
    expect(outlet.targetComponent()).toBe(TargetCmp);
    // The target mount went through the seam.
    expect(vtCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('skips the blank phase for a withLoaderViewTransitionImage route (stay → pending)', () => {
    const { outlet } = setup();
    activate(
      outlet,
      makeMeta({
        stayMs: 300,
        blankMs: 300,
        withLoaderViewTransitionImage: true,
      }),
    );
    expect(outlet.state()).toBe('stay');

    vi.advanceTimersByTime(299);
    expect(outlet.state()).toBe('stay');
    // At stayMs it jumps straight to pending — no blank in between.
    vi.advanceTimersByTime(1);
    expect(outlet.state()).toBe('pending');
  });

  it('still walks through blank for a route that did not opt in', () => {
    const { outlet } = setup();
    activate(outlet, makeMeta({ stayMs: 300, blankMs: 300 }));

    vi.advanceTimersByTime(300);
    expect(outlet.state()).toBe('blank');
    vi.advanceTimersByTime(300);
    expect(outlet.state()).toBe('pending');
  });

  it('skipBlank option skips blank for every route', () => {
    const { outlet } = setup({ skipBlank: true });
    activate(outlet, makeMeta({ stayMs: 300, blankMs: 300 }));

    vi.advanceTimersByTime(300);
    expect(outlet.state()).toBe('pending');
  });

  it('has already swapped the displayed DOM when the view-transition callback returns', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let outlet!: CraftRouterOutletController;

    TestBed.configureTestingModule({
      providers: [
        { provide: CRAFT_ROUTER, useValue: stubRouter() },
        { provide: CRAFT_VIEW_TRANSITIONS_ENABLED, useValue: true },
        {
          provide: CRAFT_SYNC_TEMPLATE_FLUSH,
          useValue: () => {
            host.textContent = outlet.displayedComponent() ? 'target' : '';
          },
        },
        {
          provide: CRAFT_START_VIEW_TRANSITION,
          useValue: (cb: () => void) => {
            cb();
            expect(host.textContent).toBe('target');
          },
        },
      ],
    });

    outlet = TestBed.runInInjectionContext(() =>
      createCraftRouterOutletController(),
    );
    outlet.activateMatch(
      makeMatch(undefined),
      TestBed.inject(EnvironmentInjector),
    );
    expect(host.textContent).toBe('target');
    host.remove();
  });
});

describe('collectMatchProps', () => {
  it('merges parent params and data before the leaf segment', () => {
    const parent: CraftCompiledRoute = {
      path: 'team/:teamId',
      data: { someParentRouteData: 'foo' },
    };
    const leaf: CraftCompiledRoute = {
      path: 'user/:userId',
      data: { craftComponent: () => undefined },
    };
    const match: CraftMatch = {
      pathname: '/team/100/user/42',
      search: '?tab=info',
      hash: '',
      params: { teamId: '100', userId: '42' },
      queryParams: { tab: 'info' },
      route: leaf,
      routes: [parent, leaf],
      data: { someParentRouteData: 'foo', craftComponent: () => undefined },
    };

    expect(collectMatchProps(match)).toEqual({
      teamId: '100',
      someParentRouteData: 'foo',
      userId: '42',
      tab: 'info',
    });
  });

  it('falls back to the leaf params when there is a single route', () => {
    const route: CraftCompiledRoute = {
      path: 'user/:userId',
      data: { label: 'solo' },
    };
    const match: CraftMatch = {
      pathname: '/user/7',
      search: '',
      hash: '',
      params: { userId: '7' },
      queryParams: {},
      route,
      routes: [route],
      data: { label: 'solo' },
    };

    expect(collectMatchProps(match)).toEqual({
      userId: '7',
      label: 'solo',
    });
  });
});

describe('resolveComponentInput', () => {
  it('passes through an eager component type', async () => {
    expect(
      await resolveComponentInput({ component: TargetCmp, componentDeps: {} }),
    ).toBe(TargetCmp);
  });

  it('resolves a lazy () => import() loader to its default export', async () => {
    expect(
      await resolveComponentInput({
        loadComponent: () => Promise.resolve({ default: TargetCmp }),
        componentDeps: {},
      }),
    ).toBe(TargetCmp);
  });

  it('returns null for no component', async () => {
    expect(await resolveComponentInput(null)).toBeNull();
  });

  it('passes through an eager Craft target', async () => {
    const target = craftRouteTarget({ name: 'FunctionalError' });
    expect(await resolveComponentInput({ component: target })).toBe(target);
  });
});

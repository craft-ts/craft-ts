// @vitest-environment jsdom
import '@angular/compiler';
import {
  Component,
  EnvironmentInjector,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
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
import {
  CRAFT_ROUTE_CHAIN_RUNNER,
  createCraftRouterOutletController,
  type CraftRouterOutletController,
  resolveComponentInput,
} from './craft-router-outlet';
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

function makeRoute(meta: CraftRouteMeta | undefined): ActivatedRoute {
  const data = meta ? { [CRAFT_ROUTE_META]: meta } : {};
  return {
    component: TargetCmp,
    snapshot: {
      data,
      component: TargetCmp,
      routeConfig: { component: TargetCmp },
    },
  } as unknown as ActivatedRoute;
}

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe('CraftRouterOutlet', () => {
  let deferred: {
    promise: Promise<RouteChainOutcome>;
    resolve: (outcome: RouteChainOutcome) => void;
  };
  let runner: ReturnType<typeof vi.fn>;

  function setup(): {
    outlet: CraftRouterOutletController;
    router: Router;
  } {
    let resolve!: (outcome: RouteChainOutcome) => void;
    const promise = new Promise<RouteChainOutcome>((r) => (resolve = r));
    deferred = { promise, resolve };
    runner = vi.fn(() => deferred.promise);

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: CRAFT_ROUTE_CHAIN_RUNNER, useValue: runner },
      ],
    });

    return {
      outlet: TestBed.runInInjectionContext(() =>
        createCraftRouterOutletController(),
      ),
      router: TestBed.inject(Router),
    };
  }

  function activate(
    outlet: CraftRouterOutletController,
    meta: CraftRouteMeta | undefined,
  ) {
    outlet.activateWith(makeRoute(meta), TestBed.inject(EnvironmentInjector));
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

  it.fails('keeps pending visible for pendingMinMs before a final error', async () => {
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
  });

  it.fails('ignores a late chain resolution after navigation cancellation', async () => {
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
  });

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
    activate(outlet, makeMeta());
    deferred.resolve({ kind: 'stay' });
    await flush();
    expect(navigate).toHaveBeenCalledWith(router.url);
    expect(outlet.targetComponent()).toBeNull();
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
        provideRouter([]),
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
    outlet.activateWith(makeRoute(meta), TestBed.inject(EnvironmentInjector));
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
});

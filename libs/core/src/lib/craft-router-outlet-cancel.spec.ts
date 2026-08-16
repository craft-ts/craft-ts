// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RouteChainOutcome } from './craft-guard-runtime';
import { CRAFT_ROUTE_META, type CraftRouteMeta } from './craft-route-meta';
import {
  CRAFT_ROUTE_CHAIN_RUNNER,
  createCraftRouterOutletController,
  type CraftRouterOutletController,
} from './craft-router-outlet';
import { CRAFT_PENDING_COMPONENT } from './craft-pending';
import type {
  CraftCompiledRoute,
  CraftMatch,
} from './host/craft-router-runtime';
import { CRAFT_ROUTER, type CraftRouterNavigationApi } from './craft-router';
import {
  createEnvironmentInjector,
  Injector,
} from './host/craft-compat';
import { craftSignal } from './host/craft-signal';

class TargetCmp {}

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
    guardDataSink: craftSignal<unknown>(undefined),
    resolveDataSink: craftSignal<unknown>(undefined),
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

function makeMatch(meta: CraftRouteMeta | undefined): CraftMatch {
  const data = meta ? { [CRAFT_ROUTE_META]: meta } : {};
  const route: CraftCompiledRoute = {
    path: 'a',
    component: TargetCmp,
    data,
  };
  return {
    pathname: '/a',
    search: '',
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

describe('CraftRouterOutlet cancel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ignores a late chain resolution after navigation cancellation', async () => {
    let resolve!: (outcome: RouteChainOutcome) => void;
    const promise = new Promise<RouteChainOutcome>((r) => (resolve = r));
    const runner = vi.fn(() => promise);
    const router = stubRouter();
    const injector = createEnvironmentInjector(
      [
        { provide: CRAFT_ROUTER, useValue: router },
        { provide: CRAFT_ROUTE_CHAIN_RUNNER, useValue: runner },
        { provide: CRAFT_PENDING_COMPONENT, useValue: { component: TargetCmp } },
      ],
      Injector.NULL,
    );
    const outlet: CraftRouterOutletController = injector.run(() =>
      createCraftRouterOutletController(),
    );

    outlet.activateMatch(makeMatch(makeMeta({ stayMs: 300, blankMs: 300 })), injector);
    outlet.deactivate();
    await flush();

    resolve({
      kind: 'data',
      guardData: undefined,
      resolveData: undefined,
    });
    await flush();

    expect(outlet.state()).toBe('idle');
    expect(outlet.targetComponent()).toBeNull();
    expect(outlet.displayedComponent()).toBeNull();
  });
});

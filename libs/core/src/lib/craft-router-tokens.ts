import { craftService } from './craft-service';
import type {
  CraftCompiledRoute,
  CraftHistory as RuntimeCraftHistory,
  CraftLocation as RuntimeCraftLocation,
  CraftMatch as RuntimeCraftMatch,
} from './host/craft-router-runtime';
import type { CraftSignal, CraftWritableSignal } from './host/craft-signal';
import { craftSignal, craftWatch } from './host/craft-signal';
import {
  findUnresolvedLoadChildrenRoute,
  matchCraftRoutes,
  matchCraftRoutesAsync,
  serializeLocation,
  splitPath,
} from './host/craft-router-runtime';
import { CraftPlatform } from './craft-platform';

export type CraftHistory = RuntimeCraftHistory;
export type CraftLocation = RuntimeCraftLocation;
export type CraftMatch = RuntimeCraftMatch;

export type CraftUrlTree = {
  readonly __craftUrlTree: true;
  toString(): string;
};

export type CraftRouterEvent = {
  readonly type: 'NavigationStart' | 'NavigationEnd';
  readonly url: string;
};

export type CraftNavigationExtras = {
  replaceUrl?: boolean;
  skipLocationChange?: boolean;
  state?: Record<string, unknown>;
  queryParamsHandling?: 'merge' | 'preserve' | '';
  fragment?: string | null;
  preserveFragment?: boolean;
};

export type CraftNavigation = { extras?: CraftNavigationExtras };

export type CraftRouterNavigationApi = {
  readonly url: string;
  createUrlTree(input: {
    to: string;
    params?: Record<string, string>;
    queryParams?: Record<string, string> | null;
    fragment?: string | null;
  }): CraftUrlTree;
  navigate(
    input: {
      to: string;
      params?: Record<string, string>;
      queryParams?: Record<string, string> | null;
      fragment?: string | null;
    } & CraftNavigationExtras,
  ): Promise<boolean>;
  navigateByUrl(
    url: string | CraftUrlTree | { to: string },
    extras?: CraftNavigationExtras,
  ): Promise<boolean>;
  serializeUrl(tree: CraftUrlTree): string;
  getCurrentNavigation(): CraftNavigation | null;
};

const craftHistoryService = craftService(
  { name: 'CraftHistory', providedIn: 'toProvide' },
  function* (inputs: { $provided?: CraftHistory | (() => CraftHistory) }) {
    const provided = inputs.$provided
      ? typeof inputs.$provided === 'function'
        ? inputs.$provided()
        : inputs.$provided
      : undefined;
    if (provided) return provided;
    const platform = yield* CraftPlatform();
    return platform.history;
  },
) as unknown as {
  CraftHistory: () => Generator<unknown, CraftHistory, unknown>;
  provideCraftHistory: (value: CraftHistory | (() => CraftHistory)) => unknown;
  CRAFT_HISTORY_META_DATA: { inject(): CraftHistory };
};

const craftCompiledRoutesService = craftService(
  { name: 'CraftCompiledRoutes', providedIn: 'toProvide' },
  (inputs: { $provided: readonly CraftCompiledRoute[] }) => inputs.$provided,
) as unknown as {
  CraftCompiledRoutes: () => Generator<
    unknown,
    readonly CraftCompiledRoute[],
    unknown
  >;
  provideCraftCompiledRoutes: (value: readonly CraftCompiledRoute[]) => unknown;
  CRAFT_COMPILED_ROUTES_META_DATA: {
    inject(): readonly CraftCompiledRoute[];
  };
};

const craftLocationService = craftService(
  { name: 'CraftLocation', providedIn: 'toProvide' },
  function* (inputs: {
    $provided?: CraftWritableSignal<CraftLocation>;
  }) {
    if (inputs.$provided) return inputs.$provided();
    const history = yield* CraftHistory();
    const location = craftSignal(history.get());
    const stop = history.listen((next: CraftLocation) => location.set(next));
    return location;
  },
) as unknown as {
  CraftLocation: () => Generator<
    unknown,
    CraftWritableSignal<CraftLocation>,
    unknown
  >;
  provideCraftLocation: (
    value: CraftWritableSignal<CraftLocation>,
  ) => unknown;
  CRAFT_LOCATION_META_DATA: {
    inject(): CraftWritableSignal<CraftLocation>;
  };
};

const craftMatchService = craftService(
  { name: 'CraftMatch', providedIn: 'toProvide' },
  function* (inputs: {
    $provided?: CraftSignal<CraftMatch | null> | (() => CraftSignal<CraftMatch | null>);
  }) {
    const provided = inputs.$provided
      ? (typeof inputs.$provided === 'function'
          ? inputs.$provided
          : () => inputs.$provided)()
      : undefined;
    if (provided) return provided;

    const location = yield* CraftLocation();
    const compiled = yield* CraftCompiledRoutes();
    const history = yield* CraftHistory();
    const match = craftSignal<CraftMatch | null>(null);
    let generation = 0;
    craftWatch(() => {
      const nextLocation = location();
      const current = ++generation;
      const syncMatch = matchCraftRoutes(compiled, nextLocation);
      const pending = syncMatch
        ? findUnresolvedLoadChildrenRoute(
            compiled,
            splitPath(nextLocation.pathname || '/'),
          )
        : undefined;
      if (pending) {
        void matchCraftRoutesAsync(compiled, nextLocation).then((resolved) => {
          if (current === generation) match.set(resolved);
        });
        return;
      }
      match.set(syncMatch);
      if (syncMatch?.route.redirectTo && typeof syncMatch.route.redirectTo === 'string') {
        const target = syncMatch.route.redirectTo;
        if (target !== serializeLocation(nextLocation)) {
          history.replace(target, history.getState());
        }
      }
    });
    return match;
  },
) as unknown as {
  CraftMatch: () => Generator<unknown, CraftSignal<CraftMatch | null>, unknown>;
  provideCraftMatch: (
    value: CraftSignal<CraftMatch | null> | (() => CraftSignal<CraftMatch | null>),
  ) => unknown;
  CRAFT_MATCH_META_DATA: {
    inject(): CraftSignal<CraftMatch | null>;
  };
};

const craftChildMatchService = craftService(
  { name: 'CraftChildMatch', providedIn: 'toProvide' },
  function* (inputs: { $provided: CraftSignal<CraftMatch | null> }) {
    return inputs.$provided();
  },
) as unknown as {
  CraftChildMatch: () => Generator<unknown, CraftSignal<CraftMatch | null>, unknown>;
  provideCraftChildMatch: (value: CraftSignal<CraftMatch | null>) => unknown;
  CRAFT_CHILD_MATCH_META_DATA: {
    inject(): CraftSignal<CraftMatch | null>;
  };
};

const craftRouterRuntimeService = craftService(
  { name: 'CraftRouterRuntime', providedIn: 'toProvide' },
  function* (inputs: { $provided: CraftRouterNavigationApi | (() => CraftRouterNavigationApi) }) {
    return typeof inputs.$provided === 'function'
      ? inputs.$provided()
      : inputs.$provided;
  },
) as unknown as {
  CraftRouterRuntime: () => Generator<unknown, CraftRouterNavigationApi, unknown>;
  provideCraftRouterRuntime: (
    value: CraftRouterNavigationApi | (() => CraftRouterNavigationApi),
  ) => unknown;
  CRAFT_ROUTER_RUNTIME_META_DATA: {
    inject(): CraftRouterNavigationApi;
  };
};

export const CraftHistory = craftHistoryService.CraftHistory;
export const provideCraftHistory = (
  value: CraftHistory | (() => CraftHistory),
): unknown => craftHistoryService.provideCraftHistory(value);
export const ɵinjectCraftHistory = () => {
  try {
    return craftHistoryService.CRAFT_HISTORY_META_DATA.inject() as CraftHistory;
  } catch {
    return null;
  }
};

export const CraftLocation = craftLocationService.CraftLocation;
export const provideCraftLocation = (
  value: CraftWritableSignal<CraftLocation>,
): unknown => craftLocationService.provideCraftLocation(value);
export const ɵinjectCraftLocation = () => {
  try {
    return craftLocationService.CRAFT_LOCATION_META_DATA.inject() as CraftWritableSignal<CraftLocation>;
  } catch {
    return null;
  }
};

export const CraftMatch = craftMatchService.CraftMatch;
export const provideCraftMatch = (
  value: CraftSignal<CraftMatch | null> | (() => CraftSignal<CraftMatch | null>),
): unknown => craftMatchService.provideCraftMatch(value);
export const ɵinjectCraftMatch = () => {
  try {
    return craftMatchService.CRAFT_MATCH_META_DATA.inject() as CraftSignal<CraftMatch | null>;
  } catch {
    return null;
  }
};

export const CraftChildMatch = craftChildMatchService.CraftChildMatch;
export const provideCraftChildMatch = (
  value: CraftSignal<CraftMatch | null>,
): unknown => craftChildMatchService.provideCraftChildMatch(value);
export const ɵinjectCraftChildMatch = () => {
  try {
    return craftChildMatchService.CRAFT_CHILD_MATCH_META_DATA.inject() as CraftSignal<CraftMatch | null>;
  } catch {
    return null;
  }
};

export const CraftCompiledRoutes = craftCompiledRoutesService.CraftCompiledRoutes;
export const provideCraftCompiledRoutes = (
  value: readonly CraftCompiledRoute[],
): unknown => craftCompiledRoutesService.provideCraftCompiledRoutes(value);
export const ɵinjectCraftCompiledRoutes = () => {
  try {
    return craftCompiledRoutesService.CRAFT_COMPILED_ROUTES_META_DATA.inject() as readonly CraftCompiledRoute[];
  } catch {
    return [] as readonly CraftCompiledRoute[];
  }
};

export const CraftRouterRuntime = craftRouterRuntimeService.CraftRouterRuntime;
export const provideCraftRouterRuntimeValue = (
  value: CraftRouterNavigationApi | (() => CraftRouterNavigationApi),
): unknown => craftRouterRuntimeService.provideCraftRouterRuntime(value);
export const ɵinjectCraftRouterRuntime = () => {
  try {
    return craftRouterRuntimeService.CRAFT_ROUTER_RUNTIME_META_DATA.inject() as CraftRouterNavigationApi;
  } catch {
    return null;
  }
};

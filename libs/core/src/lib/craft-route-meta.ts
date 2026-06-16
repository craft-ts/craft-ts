import type { Type, WritableSignal } from '@angular/core';
import type {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
} from '@angular/router';
import type { CraftRouteExceptionHandlerMap } from './craft-guard-runtime';
import type { CraftExceptionComponentInput } from './craft-route-exceptions';

/**
 * Symbol key under which `craftRoutes` stashes a route's craft-only execution
 * metadata onto the Angular `Route.data`. The {@link CraftRouterOutlet} reads it
 * to drive the route's guard/resolve chain *after* the URL commits; it is never
 * a real `data` value the component sees.
 */
export const CRAFT_ROUTE_META = Symbol('craft-route-meta');

/** A guard/resolve generator factory — the outlet creates a fresh iterator per run. */
export type CraftRouteStepFactory = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => Generator<unknown, unknown, unknown>;

/** The craft-only execution metadata the outlet needs to run a route's chain. */
export interface CraftRouteMeta {
  /** `canMatch` composing generator (run first; success discarded). */
  readonly match?: CraftRouteStepFactory;
  /** `canActivate` composing generator (success = guarded data). */
  readonly guard?: CraftRouteStepFactory;
  /** `resolve` composing generator (success = resolved data). */
  readonly resolve?: CraftRouteStepFactory;
  /** Exhaustive exception handlers keyed by code. */
  readonly handleExceptions: CraftRouteExceptionHandlerMap;
  /** Signal the outlet writes the `canActivate` success value into. */
  readonly guardDataSink: WritableSignal<unknown> | null;
  /** Signal the outlet writes the `resolve` success value into. */
  readonly resolveDataSink: WritableSignal<unknown> | null;
  /** Per-route pending component override (eager or lazy). */
  readonly pendingComponent?: CraftExceptionComponentInput;
  /** Per-route global error component override. */
  readonly errorComponent?: Type<unknown>;
  /** Per-route phase 1 duration: keep the previous page on screen (ms). */
  readonly stayMs?: number;
  /** Per-route phase 2 duration: blank surface before the loader (ms). */
  readonly blankMs?: number;
  /** Per-route phase 3 minimum loader display time (ms). */
  readonly pendingMinMs?: number;
  /** Keep `canActivate` under reactive observation while active (default `true`). */
  readonly reactiveGuards: boolean;
  /**
   * This route opted into a shared-element view transition: the outlet drives
   * `document.startViewTransition()` around its swaps and skips the `'blank'`
   * phase so the morph bridges `previous page → pending skeleton → target`.
   */
  readonly withLoaderViewTransitionImage?: boolean;
}

/** Reads the craft route meta a `craftRoutes`-built route stashes on its `data`. */
export function getCraftRouteMeta(
  data: Record<string | symbol, unknown> | null | undefined,
): CraftRouteMeta | undefined {
  if (!data) {
    return undefined;
  }

  return data[CRAFT_ROUTE_META] as CraftRouteMeta | undefined;
}

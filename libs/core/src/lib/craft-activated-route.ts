import type { CraftRouteContext } from './host/craft-router-model';
import { type CraftServiceProvider, ɵcraftValueService } from './craft-service';

const craftActivatedRouteService = ɵcraftValueService(
  { name: 'CraftActivatedRoute', providedIn: 'toProvide' },
  (inputs: { $provided?: CraftRouteContext | (() => CraftRouteContext) }) =>
    typeof inputs.$provided === 'function'
      ? inputs.$provided()
      : inputs.$provided,
) as unknown as {
  CraftActivatedRoute: () => Generator<never, CraftRouteContext, unknown>;
  provideCraftActivatedRoute: (
    value: CraftRouteContext | (() => CraftRouteContext),
  ) => CraftServiceProvider;
};

/**
 * Yields the current `CraftRouteContext` through the Craft service
 * dependency system.
 *
 * ```ts
 * const activatedRoute = yield* CraftActivatedRoute();
 * ```
 */
export const CraftActivatedRoute =
  craftActivatedRouteService.CraftActivatedRoute;
export const provideCraftActivatedRoute = (
  value: CraftRouteContext | (() => CraftRouteContext),
): CraftServiceProvider => craftActivatedRouteService.provideCraftActivatedRoute(value);

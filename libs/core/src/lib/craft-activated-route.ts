import type { ActivatedRoute } from './host/craft-router-types';
import { craftService, type CraftServiceProvider } from './craft-service';

const craftActivatedRouteService = craftService(
  { name: 'CraftActivatedRoute', providedIn: 'toProvide' },
  (inputs: { $provided?: ActivatedRoute | (() => ActivatedRoute) }) =>
    typeof inputs.$provided === 'function'
      ? inputs.$provided()
      : inputs.$provided,
) as unknown as {
  CraftActivatedRoute: () => Generator<unknown, ActivatedRoute, unknown>;
  provideCraftActivatedRoute: (
    value: ActivatedRoute | (() => ActivatedRoute),
  ) => CraftServiceProvider;
};

/**
 * Yields the current Angular `ActivatedRoute` through the Craft service
 * dependency system.
 *
 * ```ts
 * const activatedRoute = yield* CraftActivatedRoute();
 * ```
 */
export const CraftActivatedRoute =
  craftActivatedRouteService.CraftActivatedRoute;
export const provideCraftActivatedRoute = (
  value: ActivatedRoute | (() => ActivatedRoute),
): CraftServiceProvider => craftActivatedRouteService.provideCraftActivatedRoute(value);

import { ActivatedRoute } from '@angular/router';
import {
  toCraftService,
  type SERVICE_HELPER_DEPENDENCIES,
  type ServiceYieldRequest,
  type ServiceTrackingMetadata,
} from './craft-service';

type CraftActivatedRouteTrackingMetadata = ServiceTrackingMetadata<
  'CraftActivatedRoute',
  'global',
  ActivatedRoute,
  never,
  undefined,
  never,
  false
>;

type CraftActivatedRouteTrackedHelper = {
  readonly [SERVICE_HELPER_DEPENDENCIES]?: CraftActivatedRouteTrackingMetadata;
};

type CraftActivatedRouteYieldRequest = ServiceYieldRequest<
  'global',
  ActivatedRoute,
  CraftActivatedRouteTrackingMetadata
>;

type CraftActivatedRouteHelper = CraftActivatedRouteTrackedHelper & {
  (): Generator<CraftActivatedRouteYieldRequest, ActivatedRoute, unknown>;
};

// Keep the internal `toCraftService` type out of the public declaration. Its
// runtime helper contains private symbol markers that TypeScript cannot emit
// from this package boundary.
const craftActivatedRouteService = toCraftService({
  name: 'CraftActivatedRoute',
  scope: 'global',
  token: ActivatedRoute,
}) as unknown as {
  CraftActivatedRoute: CraftActivatedRouteHelper;
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

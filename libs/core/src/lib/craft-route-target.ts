import {
  runInInjectionContext,
  type Injector,
} from './host/craft-compat';
import { craftService, type CraftServiceProvider } from './craft-service';

/**
 * What a route mounts. Everything Craft renders is a Craft component, so the
 * kind is informational: it exists because a route target used to be able to
 * be an Angular component too.
 */
export type CraftRouteTarget = {
  readonly kind: 'craft';
  /** Opaque in core; `@craft-ts/component` owns the concrete renderer. */
  readonly component: unknown;
};

/**
 * A route's component: the Craft component itself, or an explicit target. It
 * used to admit an Angular `Type<unknown>` as a third form.
 */
export type CraftRouteTargetInput = object | CraftRouteTarget;

/** Route-scoped target consumed by `CraftRouterOutletController`. */
const craftRouteTargetService = craftService(
  { name: 'CraftRouteTarget', providedIn: 'toProvide' },
  (inputs: {
    $provided?: CraftRouteTarget | null | (() => CraftRouteTarget | null);
  }) => {
    if (typeof inputs.$provided === 'function') {
      return inputs.$provided();
    }
    return inputs.$provided ?? null;
  },
) as unknown as {
  CraftRouteTarget: () => Generator<unknown, CraftRouteTarget | null, unknown>;
  provideCraftRouteTarget: (
    value: CraftRouteTarget | null | (() => CraftRouteTarget | null),
  ) => CraftServiceProvider;
  CRAFT_ROUTE_TARGET_META_DATA: { inject(): CraftRouteTarget | null };
};

export const CraftRouteTarget = craftRouteTargetService.CraftRouteTarget;
export const provideCraftRouteTarget = (
  value: CraftRouteTarget | null | (() => CraftRouteTarget | null),
): CraftServiceProvider => craftRouteTargetService.provideCraftRouteTarget(value);

export function ɵinjectCraftRouteTarget(): CraftRouteTarget | null {
  try {
    return craftRouteTargetService.CRAFT_ROUTE_TARGET_META_DATA.inject();
  } catch {
    return null;
  }
}

export function ɵinjectCraftRouteTargetIn(
  injector: Injector,
): CraftRouteTarget | null {
  return runInInjectionContext(injector, () => ɵinjectCraftRouteTarget());
}

export function craftRouteTarget(component: unknown): CraftRouteTarget {
  return { kind: 'craft', component };
}

export function isCraftRouteTarget(value: unknown): value is CraftRouteTarget {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    (value as { readonly kind?: unknown }).kind === 'craft' &&
    'component' in value
  );
}

/**
 * A bare component is a Craft component. This used to default to an Angular
 * target, which now resolves to a host that cannot exist — every unwrapped
 * component would have thrown at mount.
 */
export function normalizeCraftRouteTarget(
  input: CraftRouteTargetInput,
): CraftRouteTarget {
  return isCraftRouteTarget(input) ? input : craftRouteTarget(input);
}

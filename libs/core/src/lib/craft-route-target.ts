import { InjectionToken } from './host/craft-compat';

/**
 * What a route mounts. Everything Craft renders is a Craft component, so the
 * kind is informational: it exists because a route target used to be able to
 * be an Angular component too.
 */
export type CraftRouteTarget = {
  readonly kind: 'craft';
  /** Opaque in core; `@craft-ng/component` owns the concrete renderer. */
  readonly component: unknown;
};

/**
 * A route's component: the Craft component itself, or an explicit target. It
 * used to admit an Angular `Type<unknown>` as a third form.
 */
export type CraftRouteTargetInput = object | CraftRouteTarget;

/** Route-scoped target consumed by `CraftRouterOutletController`. */
export const CRAFT_ROUTE_TARGET = new InjectionToken<CraftRouteTarget | null>(
  'CRAFT_ROUTE_TARGET',
  { providedIn: 'root', factory: () => null },
);

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

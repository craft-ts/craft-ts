import { InjectionToken, type Type } from './host/craft-compat';

export type CraftRouteTarget =
  | {
      readonly kind: 'angular';
      readonly component: Type<unknown>;
    }
  | {
      readonly kind: 'craft';
      /** Opaque in core; `@craft-ng/component` owns the concrete renderer. */
      readonly component: unknown;
    };

export type CraftRouteTargetInput = Type<unknown> | CraftRouteTarget;

/** Route-scoped target consumed by `CraftRouterOutletController`. */
export const CRAFT_ROUTE_TARGET = new InjectionToken<CraftRouteTarget | null>(
  'CRAFT_ROUTE_TARGET',
  { providedIn: 'root', factory: () => null },
);

export function angularRouteTarget(component: Type<unknown>): CraftRouteTarget {
  return { kind: 'angular', component };
}

export function craftRouteTarget(component: unknown): CraftRouteTarget {
  return { kind: 'craft', component };
}

export function isCraftRouteTarget(value: unknown): value is CraftRouteTarget {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    ((value as { readonly kind?: unknown }).kind === 'angular' ||
      (value as { readonly kind?: unknown }).kind === 'craft') &&
    'component' in value
  );
}

export function normalizeCraftRouteTarget(
  input: CraftRouteTargetInput,
): CraftRouteTarget {
  return isCraftRouteTarget(input) ? input : angularRouteTarget(input);
}

export function angularComponentFromRouteTarget(
  target: CraftRouteTarget | null,
): Type<unknown> | null {
  return target?.kind === 'angular' ? target.component : null;
}

import type { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import type { StripCraftException } from './craft-exception';

/**
 * The optional data step of a craft route. Mirrors {@link craftCanActivate} but
 * yields a value rather than a guard decision: it `yield*`s craft services and
 * `yield* untilSettled(...)`, then returns the data the target component reads
 * through the generated `injectXxxResolvedData()` helper.
 *
 * Like the guards, it carries no inline exception handling — any `craftException`
 * it produces flows into the route's exhaustive `handleExceptions` map, and the
 * non-blocking {@link CraftRouterOutlet} drives it after the URL commits (so the
 * target is rendered only once the data resolves).
 *
 * ```ts
 * resolve: craftResolve(function* () {
 *   return yield* untilSettled(CraftHttpClient.get<Profile>('/api/profile'));
 * }),
 * ```
 */
export type CraftResolveFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => Generator<unknown, unknown, unknown>;

type CraftResolveYielded<Fn> = Fn extends (
  ...args: any[]
) => Generator<infer Yielded, any, any>
  ? Yielded
  : never;

type CraftResolveReturn<Fn> = Fn extends (
  ...args: any[]
) => Generator<any, infer Output, any>
  ? Output
  : never;

/**
 * The resolver returned by {@link craftResolve}. Its generator `Yielded`
 * preserves the resolve body's dependency requests *and* its
 * `CraftGenExceptionMarker`s (so route DI tracking and `handleExceptions`
 * exhaustiveness both see them); its return is the success value (exceptions
 * stripped) surfaced to `injectXxxResolvedData`.
 */
export type CraftResolveResultFn<Fn> = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => Generator<
  CraftResolveYielded<Fn>,
  StripCraftException<CraftResolveReturn<Fn>>,
  unknown
>;

/**
 * Packages a resolve generator for the route's `resolve` field. Identity at
 * runtime (the outlet drives the generator); the precise return type carries the
 * resolved data + reachable exceptions for the route's type machinery.
 */
export function craftResolve<Fn extends CraftResolveFn>(
  resolveFn: Fn,
): CraftResolveResultFn<Fn> {
  return resolveFn as unknown as CraftResolveResultFn<Fn>;
}

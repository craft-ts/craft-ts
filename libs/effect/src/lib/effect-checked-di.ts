import type {
  CraftRouteAdditionalProvidersOf,
  NamedBrandedServiceProvider,
} from '@craft-ts/core';
import type {
  MissingRequirements,
  RealRequirements,
} from './requirements';

// ---------------------------------------------------------------------------
// `assertNoRequirements`/`runEffect` (requirements.ts) check `R` at the yield
// site, where the effect is driven directly. `queryEffect`/`mutationEffect`/
// `asyncProcessEffect` (effect-adapter.ts) deliberately do NOT: their whole
// point is that a loader can return an Effect whose `R` is resolved later, by
// the nearest `provideLayer(...)` up the injector chain — the component never
// names the service it depends on.
//
// That freedom has a cost: nothing stops a loader from requiring a service no
// `provideLayer(...)` in the app or route actually installs. `provideLayer`
// now types its return as a `NamedBrandedServiceProvider` carrying the
// layer's `ROut`, so `AppProvidedDependencyValuesOf<typeof appConfig>` (from
// `@craft-ts/core`, already used for regular `craftService` DI) picks up
// Effect services too. `EffectRequirementsCheckedDI` is the explicit check
// that compares a loader's `R` against that union — the same opt-in shape as
// `RouteCheckedDI`: a type alias placed near the component or route, run
// through `CanRun`.
// ---------------------------------------------------------------------------

/**
 * Compares a loader's leftover requirements `R` against the union of Effect
 * services actually installed by `provideLayer(...)` somewhere in scope.
 *
 * Returns `true` when every requirement is covered, or a
 * {@link MissingRequirements} naming what's left — feed the result straight
 * into `CanRun` to turn a gap into a compile error.
 *
 * @example
 * // app.config.ts
 * export const appConfig = craftAppConfig({ providers: [provideLayer(SessionLive)] });
 * export type AppProvidedEffectServices = AppProvidedDependencyValuesOf<typeof appConfig>;
 *
 * // effect-shared-service.ts
 * type _Check = EffectRequirementsCheckedDI<
 *   Effect.Effect.Context<ReturnType<typeof checkUserAccess>>,
 *   AppProvidedEffectServices
 * >;
 * type _CanRun = CanRun<_Check>;
 */
export type EffectRequirementsCheckedDI<Requirements, AvailableValues> =
  [Exclude<RealRequirements<Requirements>, AvailableValues>] extends [never]
    ? true
    : MissingRequirements<
        Exclude<RealRequirements<Requirements>, AvailableValues>
      >;

type IsAny<Input> = 0 extends 1 & Input ? true : false;

type ProvidedEffectServicesFromEntry<Entry> =
  IsAny<Entry> extends true
    ? never
    : Entry extends NamedBrandedServiceProvider<any, any, infer Output>
      ? Output
      : Entry extends readonly unknown[]
        ? ProvidedEffectServicesOf<Entry>
        : never;

/**
 * Extracts the union of typed provider outputs — `provideLayer(...)`'s
 * `ROut`s among them — from a route-scoped `providers` array, the way
 * `AppProvidedDependencyValuesOf` does for a whole `craftAppConfig()`.
 *
 * A route's own `provideLayer(...)` doesn't appear in `AppProvidedEffectServices`
 * (that union only covers the app level), so a route with route-scoped
 * layers needs `ProvidedEffectServicesOfRoute` to get the full picture from
 * the typed route collection.
 *
 * @example
 * type _Check = EffectRequirementsCheckedDI<
 *   Effect.Services<typeof loadTeamOverview>,
 *   AppProvidedEffectServices |
 *     ProvidedEffectServicesOfRoute<typeof routes._routes, 'team'>
 * >;
 */
export type ProvidedEffectServicesOf<Providers> =
  Providers extends readonly unknown[]
    ? ProvidedEffectServicesFromEntry<Providers[number]>
    : never;

/** Extracts route-scoped Effect services from one route in a typed route tuple. */
export type ProvidedEffectServicesOfRoute<
  Routes,
  Path extends string,
> = Routes extends readonly unknown[]
  ? Extract<Routes[number], { readonly path: Path }> extends infer Route
    ? ProvidedEffectServicesOf<CraftRouteAdditionalProvidersOf<Route>>
    : never
  : never;

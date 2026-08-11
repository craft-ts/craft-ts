import type { Simplify, UnionToTuple } from './craft-service.shared';
import type { MissingProvidersFromDepsMap } from './branded-component/branded-component';
import type { NamedBrandedServiceProvider } from './craft-service';
import type {
  AppConfigProvidedDependencyValuesKey,
  AppConfigProvidedServiceNamesKey,
} from './craft-app-config';

/**
 * `RouteCheckedDI` is a per-route DI validation primitive meant to be used as
 * an alternative to `AppCheckedDI` when route volume makes the global check
 * brittle (TS2589).
 *
 * Where `AppCheckedDI` iterates over every route to build a global proof, this
 * type performs a **local** check: given a component dependency contract and
 * the set of provider names (and optionally provided value types) reachable
 * from this route's ancestors, it returns either `true` or the list of error
 * messages. Functional components expose that contract through
 * `ComponentDepsOf<typeof MyComponent>`; decorated Angular components can
 * still pass their legacy generated `GenDeps_*` alias.
 *
 * Recommended placement (used by the type-stress generator): the check lives
 * **in the route file** — i.e. alongside the `craftRoutes(...)` call that
 * wires the component to a path — rather than in the component file. This
 * keeps components pure and groups all DI validation for a feature in one
 * place.
 *
 * Typical use (chained at generation time):
 *
 *   // app.config.ts
 *   export const appConfig = craftAppConfig({ providers: [...] });
 *   export type AppProvidedNames = AppProvidedServiceNamesOf<typeof appConfig>;
 *   export type AppProvidedValues = AppProvidedDependencyValuesOf<typeof appConfig>;
 *
 *   // feature-x.routes.ts
 *   import type { GenDeps_FeatureXCompYComponent } from './FeatureXCompYComponent';
 *   import type { AppProvidedNames, AppProvidedValues } from '../../../app.config';
 *
 *   export const { featureXRoutes } = craftRoutes('featureX', [
 *     { path: 'item-0', providers: [provideFeatureXRouteService()],
 *       loadComponent: () => import('./FeatureXCompYComponent').then(m => m.FeatureXCompYComponent),
 *       componentDeps: {} as GenDeps_FeatureXCompYComponent },
 *   ]);
 *
 *   export type FeatureXRouteProvidedNames = AppProvidedNames | 'FeatureXRouteService';
 *   export type FeatureXRouteProvidedValues = AppProvidedValues;
 *
 *   // Cascade DI check — name union derived from GenDeps.provided so it stays
 *   // in sync with @Component.providers (via the `brand-angular-deps-match`
 *   // ESLint rule).
 *   type FeatureXCompYComponentProvidedNames =
 *     | FeatureXRouteProvidedNames
 *     | Extract<keyof GenDeps_FeatureXCompYComponent['provided'], string>;
 *   type _Check = RouteCheckedDI<
 *     GenDeps_FeatureXCompYComponent,
 *     FeatureXCompYComponentProvidedNames,
 *     FeatureXRouteProvidedValues,
 *     'FeatureXCompYComponent'
 *   >;
 *   type _CanRun = CanRun<_Check>;
 *
 * Trade-offs vs `AppCheckedDI`:
 *  - Pro: O(1) per route, no recursion over routes — scales indefinitely.
 *  - Pro: Errors surface in the route file, not in `main.ts`.
 *  - Con: Each ancestor (app, parent route) must explicitly re-export its
 *    cumulative provider names. The generator handles this; hand-written
 *    routes must thread the types manually.
 *  - Note: The check reads from `GenDeps.provided`. Drift between
 *    `@Component.providers` (runtime) and `GenDeps.provided` (type-level) is
 *    detected (and auto-fixed) by the `craft-ng/brand-angular-deps-match`
 *    ESLint rule. Running `lint` (or `lint --fix`) before `typecheck` is what
 *    closes the loop end-to-end.
 */

// -----------------------------------------------------------------------------
// Private helpers — duplicated from app-checked-di.ts on purpose to keep that
// file untouched (zero risk of regression for the central mode).
// -----------------------------------------------------------------------------

type DepsMap<Input> = Input extends { deps: infer Deps extends object }
  ? Deps
  : {};

type ProvidedMap<Input> = Input extends {
  provided: infer Provided extends object;
}
  ? Provided
  : {};

type PublicPropertiesMap<Input> = Input extends {
  publicProperties: infer PublicProperties extends object;
}
  ? PublicProperties
  : {};

type MissingProviderMap<Input> = Input extends {
  missingProvider: infer MissingProvider extends object;
}
  ? MissingProvider
  : Simplify<
      Omit<
        MissingProvidersFromDepsMap<DepsMap<Input>>,
        keyof ProvidedMap<Input>
      >
    >;

type InputErrorMessage<
  Name extends string,
  Context extends string,
> = `Input "${Name}" is not provided in ${Context}`;

type InjectedErrorMessage<
  Name extends string,
  Context extends string,
> = `The ${Name} service is not provided in ${Context}`;

type InputErrorMessagesFromNames<
  Names extends readonly unknown[],
  Context extends string,
> = Names extends readonly [infer Head extends string, ...infer Tail]
  ? [
      InputErrorMessage<Head, Context>,
      ...InputErrorMessagesFromNames<Tail, Context>,
    ]
  : [];

type InjectedErrorMessagesFromNames<
  Names extends readonly unknown[],
  Context extends string,
> = Names extends readonly [infer Head extends string, ...infer Tail]
  ? [
      InjectedErrorMessage<Head, Context>,
      ...InjectedErrorMessagesFromNames<Tail, Context>,
    ]
  : [];

/**
 * Fail closed when provider-name extraction widens to `string`.
 *
 * `RouteCheckedDI` removes missing providers by their names. If the available
 * names become `string`, that removal hides every missing provider and turns a
 * broken DI graph into `true`. This guard keeps that type-level failure
 * visible until the provider extraction is corrected.
 */
type WidenedProviderNamesError<AvailableProviderNames extends string> =
  string extends AvailableProviderNames
    ? [
        'Available provider names widened to string; type-safe DI validation is unavailable',
      ]
    : [];

// -----------------------------------------------------------------------------
// Cascade-specific helpers
// -----------------------------------------------------------------------------

/**
 * From a component's `MissingProviderMap`, remove entries whose name is in the
 * available provider names union (covers `provide{Name}()` calls anywhere in
 * the ancestor chain).
 */
type StripByNames<
  MissingProviders extends object,
  AvailableNames extends string,
> = Simplify<Omit<MissingProviders, AvailableNames>>;

/**
 * From a `MissingProviderMap`, find entries whose dependency type is
 * structurally assignable from one of the `ProvidedValues` (e.g. `Router`
 * provided by `provideCraftRouter`). Returns the union of those names.
 */
type NamesMatchingProvidedValues<
  MissingProviders extends object,
  ProvidedValues,
> = {
  [Name in Extract<
    keyof MissingProviders,
    string
  >]: MissingProviders[Name] extends ProvidedValues ? Name : never;
}[Extract<keyof MissingProviders, string>];

/**
 * Final missing providers after stripping by name AND by value type.
 * Mirrors the logic of `AppMissingProviderMap` but operates on a flat union
 * of provider names instead of an `AppRoutes` tuple.
 */
type ResolvedMissing<
  ComponentDeps,
  AvailableNames extends string,
  ProvidedValues,
> = Simplify<
  Omit<
    StripByNames<MissingProviderMap<ComponentDeps>, AvailableNames>,
    NamesMatchingProvidedValues<
      StripByNames<MissingProviderMap<ComponentDeps>, AvailableNames>,
      ProvidedValues
    >
  >
>;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Validates a component's DI graph against an explicit set of available
 * provider names (and optionally a set of provided dependency value types).
 *
 * Returns `true` if everything is satisfied, or a tuple of error messages
 * (suitable as a constraint argument to `CanRun`).
 *
 * @template ComponentDeps - The component's `GenDeps_*` type (must expose
 *   `missingProvider` and/or `publicProperties`).
 * @template AvailableProviderNames - Union of service names provided by app
 *   config + parent route providers + this component's own providers.
 * @template ProvidedValues - Optional. Union of provided dependency value
 *   types (e.g. `Router` instance from `provideCraftRouter`). Defaults to
 *   `never` (no value-type matching).
 * @template Context - Human-readable context used in error messages. Defaults
 *   to `'this component'`. Generators typically pass the component name.
 */
export type RouteCheckedDI<
  ComponentDeps,
  AvailableProviderNames extends string,
  ProvidedValues = never,
  Context extends string = 'this component',
  AvailableInputNames extends string = never,
> = string extends AvailableProviderNames
  ? WidenedProviderNamesError<AvailableProviderNames>
  : [
      ...InputErrorMessagesFromNames<
        UnionToTuple<
          Exclude<
            Extract<keyof PublicPropertiesMap<ComponentDeps>, string>,
            AvailableInputNames
          >
        >,
        Context
      >,
      ...InjectedErrorMessagesFromNames<
        UnionToTuple<
          Extract<
            keyof ResolvedMissing<
              ComponentDeps,
              AvailableProviderNames,
              ProvidedValues
            >,
            string
          >
        >,
        Context
      >,
    ] extends infer Errors extends string[]
    ? Errors extends []
      ? true
      : Errors
    : never;

/** O(1) DI check for renderComponent/errorComponent/withErrorComponent branches. */
export type RouteExceptionComponentCheckedDI<
  ComponentDeps,
  AvailableProviderNames extends string,
  ProvidedValues = never,
  Context extends string = 'exception component',
  AvailableInputNames extends string = never,
> = RouteCheckedDI<
  ComponentDeps,
  AvailableProviderNames,
  ProvidedValues,
  Context,
  AvailableInputNames
>;

/**
 * Extracts the union of provider service names from a `craftAppConfig()`
 * result.
 *
 * Usage:
 *   export const appConfig = craftAppConfig({ ... });
 *   export type AppProvidedNames = AppProvidedServiceNamesOf<typeof appConfig>;
 */
export type AppProvidedServiceNamesOf<AppConfigResult> =
  AppConfigResult extends {
    readonly [Key in AppConfigProvidedServiceNamesKey]?: infer Names extends
      string;
  }
    ? Names
    : never;

/**
 * Extracts the union of provided dependency value types from a
 * `craftAppConfig()` result.
 *
 * Usage:
 *   export type AppProvidedValues = AppProvidedDependencyValuesOf<typeof appConfig>;
 */
export type AppProvidedDependencyValuesOf<AppConfigResult> =
  AppConfigResult extends {
    readonly [Key in AppConfigProvidedDependencyValuesKey]?: infer Values;
  }
    ? Values
    : never;

/**
 * Extracts the union of service names from a route's `providers` array.
 *
 * Usage:
 *   const providers = [provideMyService()] as const;
 *   type MyRouteProvidedNames = RouteProvidedServiceNamesOf<typeof providers>;
 */
export type RouteProvidedServiceNamesOf<Providers> =
  Providers extends readonly unknown[]
    ? RouteProvidedServiceNamesFromEntry<Providers[number]>
    : never;

type RouteProvidedServiceNamesFromEntry<Entry> =
  Entry extends NamedBrandedServiceProvider<infer Name, any, any>
    ? Name
    : Entry extends readonly unknown[]
      ? RouteProvidedServiceNamesOf<Entry>
      : never;

// -----------------------------------------------------------------------------
// ValidateCascadeRoutesFile — one type alias per route file (zero per-route
// boilerplate, no circular dependency)
// -----------------------------------------------------------------------------

// Per-route entry error: reads `META_DATA[N]` directly. The route's own
// `providers: [...]` are ALREADY stripped from `META_DATA[N].missingProvider`
// by `RouteResolvedMissingProviderMap` inside craft-routes.ts, and the
// component's own `provided` is folded into `GenDeps.missingProvider` at the
// component level. So validation only needs the parent's provided names.
type CascadeRouteEntryError<
  ParentNames extends string,
  ParentValues,
  ParentInputNames extends string,
  RouteMeta,
> = RouteMeta extends { path: infer Path extends string }
  ? RouteCheckedDI<
      RouteMeta,
      ParentNames,
      ParentValues,
      `path: "${Path}"`,
      ParentInputNames
    > extends infer Result
    ? Result extends true
      ? []
      : Result extends readonly string[]
        ? Result
        : []
    : []
  : [];

// Unrolls 4 routes per recursion step (same shape as RoutesErrorMessagesByIndex
// in app-checked-di.ts) to stay well below the TS2589 limit even for large
// route arrays.
type AggregateCascadeErrorsByIndex<
  ParentNames extends string,
  ParentValues,
  RoutesMeta extends readonly unknown[],
  ParentInputNames extends string = never,
  Traversed extends readonly unknown[] = readonly [],
> = number extends RoutesMeta['length']
  ? []
  : Traversed['length'] extends RoutesMeta['length']
    ? []
    : [...Traversed, unknown]['length'] extends RoutesMeta['length']
      ? [
          ...CascadeRouteEntryError<
            ParentNames,
            ParentValues,
            ParentInputNames,
            RoutesMeta[Traversed['length']]
          >,
        ]
      : [...Traversed, unknown, unknown]['length'] extends RoutesMeta['length']
        ? [
            ...CascadeRouteEntryError<
              ParentNames,
              ParentValues,
              ParentInputNames,
              RoutesMeta[Traversed['length']]
            >,
            ...CascadeRouteEntryError<
              ParentNames,
              ParentValues,
              ParentInputNames,
              RoutesMeta[[...Traversed, unknown]['length']]
            >,
          ]
        : [
            ...CascadeRouteEntryError<
              ParentNames,
              ParentValues,
              ParentInputNames,
              RoutesMeta[Traversed['length']]
            >,
            ...CascadeRouteEntryError<
              ParentNames,
              ParentValues,
              ParentInputNames,
              RoutesMeta[[...Traversed, unknown]['length']]
            >,
            ...CascadeRouteEntryError<
              ParentNames,
              ParentValues,
              ParentInputNames,
              RoutesMeta[[...Traversed, unknown, unknown]['length']]
            >,
            ...CascadeRouteEntryError<
              ParentNames,
              ParentValues,
              ParentInputNames,
              RoutesMeta[[...Traversed, unknown, unknown, unknown]['length']]
            >,
            ...AggregateCascadeErrorsByIndex<
              ParentNames,
              ParentValues,
              RoutesMeta,
              ParentInputNames,
              [...Traversed, unknown, unknown, unknown, unknown]
            >,
          ];

/**
 * Aggregates `RouteCheckedDI` over every leaf route in a `craftRoutes(...)`
 * result, reading per-route metadata from `META_DATA`.
 *
 * Returns `true` if every route is satisfied, or a tuple of error messages
 * citing each broken route's path. Designed to be used in a SINGLE type alias
 * per route file (no runtime expression, no circular type dependency on the
 * app config):
 *
 *   // feature-x.routes.ts
 *   import type { AppProvidedNames, AppProvidedValues } from '../../../app.config';
 *
 *   export const { featureXRoutes } = craftRoutes('featureX', [...]);
 *
 *   type _CheckFeatureXDI = ValidateCascadeRoutesFile<
 *     AppProvidedNames,
 *     AppProvidedValues,
 *     typeof featureXRoutes
 *   >;
 *   type _CanRunFeatureX = CanRun<_CheckFeatureXDI>;
 *
 * That's the entire cascade boilerplate — two type aliases per file,
 * regardless of how many components it wires.
 *
 * Internally, `META_DATA[N].missingProvider` already accounts for the route's
 * own `providers: [...]` and the component's own `provided` map; only the
 * parent context (app + ancestor routes) needs to be stripped here.
 */
export type ValidateCascadeRoutesFile<
  ParentNames extends string,
  ParentValues,
  RoutesApp,
  ParentInputNames extends string = never,
> = RoutesApp extends {
  META_DATA: infer Meta extends readonly unknown[];
}
  ? AggregateCascadeErrorsByIndex<
      ParentNames,
      ParentValues,
      Meta,
      ParentInputNames
    > extends infer Errors extends readonly string[]
    ? Errors extends readonly []
      ? true
      : Errors
    : never
  : never;

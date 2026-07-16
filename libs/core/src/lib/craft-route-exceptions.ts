import {
  inject,
  InjectionToken,
  signal,
  type Signal,
  type Type,
  type WritableSignal,
} from '@angular/core';
import type { Router, UrlTree } from '@angular/router';
import type { AnyCraftException } from './craft-exception';
import type { ExtractCraftGenExceptions } from './craft-gen';
import {
  CraftRouterToYield,
  type CraftRouterUrlTreeInput,
  type CraftRouterYieldRequest,
  type NavigableRoutePath,
} from './craft-router';
import {
  toCraftService,
  // These marker symbols are imported type-only so the generated
  // `CraftGlobalErrorToYield` helper's inferred type is nameable in this
  // module's `.d.ts` (otherwise TS4023 — same recipe as `craft-router.ts`).
  type SERVICE_DEPENDENCY_ACCESS_MARKER,
  type SERVICE_EXPOSURE_TOKEN_MARKER,
  type SERVICE_HELPER_DEPENDENCIES,
  type SERVICE_META_DATA_TYPE,
  type SERVICE_RUNTIME_META,
  type SERVICE_YIELD_METADATA,
  type SERVICE_YIELD_REQUEST_MARKER,
} from './craft-service';

/**
 * Centralised, typed exception handling for craft routes.
 *
 * A craft route keeps `canActivate` / `canMatch` / `resolve` as its writing API
 * — each may throw a `craftException`. Instead of an inline resolver map per
 * guard, a single **`handleExceptions`** map on the route resolves the **union**
 * of every code reachable from those three steps, exhaustively (a missing or
 * extra code is a compile error). Each handler picks an {@link CraftExceptionOutcome}.
 *
 * Outcomes delegated to the application-wide error component (`globalError()`)
 * are mirrored into the {@link CraftGlobalExceptionRegistry} by an ESLint
 * autofix, so the global error component can read **all** of its possible
 * exceptions, typed, via {@link injectCraftGlobalError}.
 */

// ---------------------------------------------------------------------------
// Outcomes (issues) a handler can choose
// ---------------------------------------------------------------------------

/** A DI-checked component rendered on an exception branch. */
export type CraftExceptionComponentDescriptor<ComponentDeps = object> =
  | {
      readonly component: Type<unknown>;
      readonly loadComponent?: never;
      readonly componentDeps: ComponentDeps;
    }
  | {
      readonly component?: never;
      readonly loadComponent: () => Promise<
        Type<unknown> | { default: Type<unknown> }
      >;
      readonly componentDeps: ComponentDeps;
    };

export type CraftExceptionComponentInput = CraftExceptionComponentDescriptor;

/** Existing pending-component input; pending DI has its own check. */
export type CraftPendingComponentInput =
  | Type<unknown>
  | (() => Promise<{ default: Type<unknown> }>);

/**
 * What a route exception handler resolves an exception to:
 *
 * - `redirect` — navigate to a typed internal route or an explicit opaque URL.
 * - `render` — render a dedicated component instead of the target.
 * - `global` — render the application-wide error component (see the registry).
 * - `stay` — cancel the navigation; stay on the triggering page (restore URL).
 * - `noop` — render the target anyway, with resolve data left `undefined`.
 */
export type CraftExceptionOutcome =
  | { readonly kind: 'redirect'; readonly target: UrlTree | string }
  | {
      readonly kind: 'render';
      readonly component: CraftExceptionComponentDescriptor;
    }
  | { readonly kind: 'global' }
  | { readonly kind: 'stay' }
  | { readonly kind: 'noop' };

/** Distinguishes the initial route entry from a reactive guard re-evaluation. */
export type CraftRoutePhase = 'enter' | 'active';
type CraftExceptionOutcomeOf<Kind extends CraftExceptionOutcome['kind']> =
  Extract<CraftExceptionOutcome, { kind: Kind }>;

/**
 * The argument handed to each `handleExceptions` handler: the typed exception
 * being handled, the navigation `phase`, the Angular-native redirect helpers,
 * and the outcome constructors (`redirectTo`, `redirectUrl`, `renderComponent`, `globalError`,
 * `stay`, `noop`).
 */
export type CraftExceptionHandlerContext<Exception extends AnyCraftException> =
  {
    readonly exception: Exception;
    readonly payload: Exception extends { payload: infer Payload }
      ? Payload
      : unknown;
    /** `'enter'` for the initial activation, `'active'` for a reactive re-check. */
    readonly phase: CraftRoutePhase;
    readonly router: Router;
    readonly createUrlTree: Router['createUrlTree'];
    readonly navigate: Router['navigate'];
    readonly navigateByUrl: Router['navigateByUrl'];
    redirectTo<Input extends CraftRouterUrlTreeInput<NavigableRoutePath>>(
      input: Input,
    ): Generator<
      CraftRouterYieldRequest,
      CraftExceptionOutcomeOf<'redirect'>,
      unknown
    >;
    redirectUrl(target: UrlTree | string): CraftExceptionOutcomeOf<'redirect'>;
    renderComponent(
      component: CraftExceptionComponentDescriptor,
    ): CraftExceptionOutcomeOf<'render'>;
    globalError(): CraftExceptionOutcomeOf<'global'>;
    stay(): CraftExceptionOutcomeOf<'stay'>;
    noop(): CraftExceptionOutcomeOf<'noop'>;
  };

/**
 * A single branded generator handler. Its service yields are preserved exactly
 * and folded into the route's DI and HTTP dependency maps.
 */
declare const CRAFT_EXCEPTION_HANDLER: unique symbol;
type NormalizedHandlerException<Exception extends AnyCraftException> = [
  Exception,
] extends [never]
  ? AnyCraftException
  : Exception;

export type CraftExceptionHandler<
  Exception extends AnyCraftException,
  Result extends Generator<any, CraftExceptionOutcome, unknown> = Generator<
    unknown,
    CraftExceptionOutcome,
    unknown
  >,
> = ((context: CraftExceptionHandlerContext<Exception>) => Result) & {
  readonly [CRAFT_EXCEPTION_HANDLER]: true;
};

/** Brands a generator as a route exception handler while preserving its exact type. */
export function craftExceptionHandler<
  Exception extends AnyCraftException = AnyCraftException,
  Result extends Generator<any, CraftExceptionOutcome, unknown> = Generator<
    unknown,
    CraftExceptionOutcome,
    unknown
  >,
>(
  handler: (
    context: CraftExceptionHandlerContext<
      NoInfer<NormalizedHandlerException<Exception>>
    >,
  ) => Result,
): CraftExceptionHandler<NormalizedHandlerException<Exception>, Result> {
  return handler as CraftExceptionHandler<
    NormalizedHandlerException<Exception>,
    Result
  >;
}

/** The pure outcome constructors, merged into the handler context by the driver. */
export const craftExceptionOutcomeApi = {
  redirectUrl: (target: UrlTree | string) =>
    ({
      kind: 'redirect',
      target,
    }) as const,
  redirectTo: function* <
    Input extends CraftRouterUrlTreeInput<NavigableRoutePath>,
  >(
    input: Input,
  ): Generator<
    CraftRouterYieldRequest,
    CraftExceptionOutcomeOf<'redirect'>,
    unknown
  > {
    const target = yield* CraftRouterToYield.createUrlTree(input as never);
    return { kind: 'redirect', target };
  },
  renderComponent: (
    component: CraftExceptionComponentInput,
  ): CraftExceptionOutcomeOf<'render'> => ({ kind: 'render', component }),
  globalError: (): CraftExceptionOutcomeOf<'global'> => ({ kind: 'global' }),
  stay: (): CraftExceptionOutcomeOf<'stay'> => ({ kind: 'stay' }),
  noop: (): CraftExceptionOutcomeOf<'noop'> => ({ kind: 'noop' }),
} as const;

// ---------------------------------------------------------------------------
// Exception-union extraction + exhaustive handler map
// ---------------------------------------------------------------------------

type CraftExceptionCodes<Exception> = Exception extends {
  code: infer Code extends string;
}
  ? Code
  : never;

type CraftExceptionForCode<Exception, Code extends string> = Extract<
  Exception,
  { code: Code }
>;

/** `Yielded` of a generator-returning route field (canActivate/canMatch/resolve). */
type RouteFieldYielded<Field> = Field extends (
  ...args: any[]
) => Generator<infer Yielded, any, any>
  ? Yielded
  : never;

/** The `craftException`s a single guard/resolve field may produce. */
type RouteFieldExceptions<Field> = ExtractCraftGenExceptions<
  RouteFieldYielded<Field>
>;

/**
 * The full union of `craftException`s reachable from a route's
 * `canActivate ∪ canMatch ∪ resolve`. `handleExceptions` must resolve exactly
 * these codes.
 */
export type RouteExceptionUnion<RouteDefinition> =
  | (RouteDefinition extends { canActivate: infer Field }
      ? RouteFieldExceptions<Field>
      : never)
  | (RouteDefinition extends { canMatch: infer Field }
      ? RouteFieldExceptions<Field>
      : never)
  | (RouteDefinition extends { resolve: infer Field }
      ? RouteFieldExceptions<Field>
      : never);

/**
 * The exhaustive handler map for an exception union: one handler per reachable
 * code. A missing key is a compile error; pair with {@link NoExtraExceptionHandlers}
 * at the definition site to also reject codes that cannot occur.
 */
export type HandledExceptionsForUnion<Exception extends AnyCraftException> = {
  [Code in CraftExceptionCodes<Exception>]: CraftExceptionHandler<
    Extract<CraftExceptionForCode<Exception, Code>, AnyCraftException>
  >;
};

/**
 * Forces every key of the supplied `Handlers` literal that is **not** a reachable
 * code to `never`, so an extra handler is a compile error. Intersect with
 * {@link HandledExceptionsForUnion} at the field's definition site.
 */
export type NoExtraExceptionHandlers<
  Handlers,
  Exception extends AnyCraftException,
> = {
  [Code in keyof Handlers as Code extends CraftExceptionCodes<Exception>
    ? never
    : Code]: never;
};

/**
 * The `handleExceptions` field type for a route definition: exhaustive over the
 * union of its guard/resolve exception codes. `[Exception] extends [never]`
 * short-circuits to an empty object so a route without typed exceptions needs no
 * `handleExceptions`.
 */
export type RouteHandledExceptions<RouteDefinition> = [
  RouteExceptionUnion<RouteDefinition>,
] extends [never]
  ? Record<never, never>
  : HandledExceptionsForUnion<
      Extract<RouteExceptionUnion<RouteDefinition>, AnyCraftException>
    >;

// ---------------------------------------------------------------------------
// Post-inference exhaustiveness check
//
// `handleExceptions` cannot be validated by a self-referential field constraint
// at `craftRoute(path, def)` — the reachable-code union is derived from the *same*
// `def` being inferred, which TypeScript can only resolve as `never` (the
// contextual type is needed before inference completes). Instead the field is
// typed loosely (so handlers stay usable) and exhaustiveness is asserted once the
// whole collection is inferred, mirroring this codebase's `ValidateCascadeRoutesFile`
// DI check: `assertExhaustiveRouteExceptions(demoRoutes)`.
// ---------------------------------------------------------------------------

type RouteReachableCodes<RouteDefinition> = CraftExceptionCodes<
  Extract<RouteExceptionUnion<RouteDefinition>, AnyCraftException>
>;

type RouteHandledCodes<RouteDefinition> = RouteDefinition extends {
  handleExceptions: infer Handlers;
}
  ? Extract<keyof Handlers, string>
  : never;

type RoutePathOf<RouteDefinition> = RouteDefinition extends {
  path: infer Path extends string;
}
  ? Path
  : string;

// `never` when a route's handlers cover exactly its reachable codes; otherwise an
// object describing the missing or unexpected codes (surfaced in the type error).
type RouteExceptionsError<RouteDefinition> = [
  RouteReachableCodes<RouteDefinition>,
] extends [never]
  ? never
  : [
        Exclude<
          RouteReachableCodes<RouteDefinition>,
          RouteHandledCodes<RouteDefinition>
        >,
      ] extends [never]
    ? [
        Exclude<
          RouteHandledCodes<RouteDefinition>,
          RouteReachableCodes<RouteDefinition>
        >,
      ] extends [never]
      ? never
      : {
          route: RoutePathOf<RouteDefinition>;
          unexpectedHandlers: Exclude<
            RouteHandledCodes<RouteDefinition>,
            RouteReachableCodes<RouteDefinition>
          >;
        }
    : {
        route: RoutePathOf<RouteDefinition>;
        missingHandlers: Exclude<
          RouteReachableCodes<RouteDefinition>,
          RouteHandledCodes<RouteDefinition>
        >;
      };

type CollectRouteExceptionsErrors<Routes> = Routes extends readonly unknown[]
  ? { [Index in keyof Routes]: RouteExceptionsError<Routes[Index]> }[number]
  : never;

/**
 * `unknown` when every route in the collection handles exactly its reachable
 * exception codes; otherwise an error object listing the offending routes. Used
 * by {@link assertExhaustiveRouteExceptions}.
 */
export type AssertRoutesExceptionsHandled<RoutesApp> = RoutesApp extends {
  readonly _routes: infer Routes;
}
  ? [Exclude<CollectRouteExceptionsErrors<Routes>, never>] extends [never]
    ? unknown
    : {
        ERROR_unhandled_or_extra_route_exceptions: Exclude<
          CollectRouteExceptionsErrors<Routes>,
          never
        >;
      }
  : unknown;

/**
 * Asserts (at compile time) that every route's `handleExceptions` covers exactly
 * the exception codes reachable from its `canActivate` / `canMatch` / `resolve`.
 * A missing or extra code makes `routes` un-assignable, surfacing the offending
 * route + codes in the error.
 *
 * ```ts
 * export const { demoRoutes } = craftRoutes('demo', [ … ]);
 * assertExhaustiveRouteExceptions(demoRoutes);
 * ```
 */
export function assertExhaustiveRouteExceptions<RoutesApp>(
  routes: RoutesApp & AssertRoutesExceptionsHandled<RoutesApp>,
): RoutesApp {
  return routes;
}

// ---------------------------------------------------------------------------
// Global exception registry + global error component access
// ---------------------------------------------------------------------------

/**
 * Mirrors the codes a route delegates to the global error component (handlers
 * that call `globalError()`), keyed by route path:
 *
 * ```ts
 * declare module '@craft-ng/core' {
 *   interface CraftGlobalExceptionRegistry {
 *     'user/:userId': {
 *       USER_DISABLED: CraftRouteExceptionType<typeof demoRoutes, 'user/:userId', 'USER_DISABLED'>;
 *     };
 *   }
 * }
 * ```
 *
 * Maintained automatically by the `global-exception-registry-match` ESLint
 * autofix — do not edit by hand.
 */
export interface CraftGlobalExceptionRegistry {}

/**
 * The typed exception object for a `code` on a route `Path` of a `craftRoutes`
 * collection. Resolves through the collection's phantom `_routes`, so the ESLint
 * autofix can write `CraftRouteExceptionType<typeof demoRoutes, '<path>', '<code>'>`
 * from literals alone (no type checker needed).
 */
export type CraftRouteExceptionType<
  RoutesApp,
  Path extends string,
  Code extends string,
> = RoutesApp extends { readonly _routes: infer Routes }
  ? Routes extends readonly unknown[]
    ? Extract<
        RouteExceptionUnion<Extract<Routes[number], { path: Path }>>,
        { code: Code }
      >
    : never
  : never;

/**
 * The union of every exception delegated to the global error component, across
 * all registered routes and codes. `never` until the registry is augmented.
 */
export type CraftGlobalHandledException = {
  [Path in keyof CraftGlobalExceptionRegistry]: CraftGlobalExceptionRegistry[Path][keyof CraftGlobalExceptionRegistry[Path]];
}[keyof CraftGlobalExceptionRegistry];

/**
 * The signal the outlet fills with the active global exception just before it
 * renders the global error component. Runtime-typed loosely; the typed view is
 * exposed by {@link injectCraftGlobalError}.
 */
export const CRAFT_GLOBAL_ERROR = new InjectionToken<
  WritableSignal<AnyCraftException | null>
>('CRAFT_GLOBAL_ERROR', {
  providedIn: 'root',
  factory: () => signal<AnyCraftException | null>(null),
});

/**
 * Reads the exception that routed to the global error component, typed as the
 * exhaustive union of everything the {@link CraftGlobalExceptionRegistry}
 * records. Discriminate on `error().code`.
 *
 * ```ts
 * readonly error = injectCraftGlobalError();
 * // switch (this.error().code) { case 'USER_DISABLED': … }
 * ```
 */
export function injectCraftGlobalError(): Signal<CraftGlobalHandledException> {
  return inject(
    CRAFT_GLOBAL_ERROR,
  ) as unknown as Signal<CraftGlobalHandledException>;
}

/**
 * Adapts the same {@link CRAFT_GLOBAL_ERROR} token as a craft dependency named
 * `CraftGlobalError`, so the global exception can be read from a generator body
 * the way a `toCraftService` dependency is — see {@link CraftGlobalErrorToYield}.
 * Typed as the exhaustive {@link CraftGlobalHandledException} view, matching
 * {@link injectCraftGlobalError}.
 */
const craftGlobalErrorService = toCraftService({
  name: 'CraftGlobalError',
  scope: 'global',
  inject: (): Signal<CraftGlobalHandledException> =>
    inject(CRAFT_GLOBAL_ERROR) as unknown as Signal<CraftGlobalHandledException>,
});

/**
 * Generator counterpart to {@link injectCraftGlobalError}. Reads the exception
 * routed to the global error component from inside a `function*` body:
 *
 * ```ts
 * const error = yield* CraftGlobalErrorToYield();
 * // switch (error().code) { case 'USER_DISABLED': … }
 * ```
 *
 * Same typed view as {@link injectCraftGlobalError} — the exhaustive union
 * recorded in {@link CraftGlobalExceptionRegistry} — and it tracks as a
 * `CraftGlobalError` dependency, exactly like the property form.
 */
export const CraftGlobalErrorToYield =
  craftGlobalErrorService.CraftGlobalErrorToYield;

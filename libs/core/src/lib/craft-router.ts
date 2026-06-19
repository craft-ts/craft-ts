import {
  Directive,
  effect,
  inject,
  input,
  type EnvironmentProviders,
  type Provider,
} from '@angular/core';
import {
  Router,
  RouterLink,
  provideRouter,
  type NavigationBehaviorOptions,
  type NavigationExtras,
  type Params,
  type RouterFeatures,
  type Routes,
  type UrlCreationOptions,
  type UrlTree,
} from '@angular/router';
import {
  isCraftLoadingFeature,
  provideCraftLoading,
  type CraftLoadingFeature,
} from './craft-pending';
import {
  CRAFT_VIEW_TRANSITION_STATE_KEY,
  type CraftViewTransitionInput,
  type ViewTransitionPayloadDef,
} from './craft-view-transition';
import {
  type GetServiceYields,
  type SERVICE_DEPENDENCY_ACCESS_MARKER,
  type SERVICE_EXPOSURE_TOKEN_MARKER,
  type SERVICE_HELPER_DEPENDENCIES,
  type SERVICE_META_DATA_TYPE,
  type SERVICE_RUNTIME_META,
  type SERVICE_YIELD_METADATA,
  type SERVICE_YIELD_REQUEST_MARKER,
  toCraftService,
} from './craft-service';
import type { Simplify } from './craft-service.shared';

export interface CraftRouterRoutesRegistry {}

type CraftRouterRoutesRegistryKey = Extract<
  keyof CraftRouterRoutesRegistry,
  string
>;

type RegisteredRouteMetaData =
  CraftRouterRoutesRegistry[CraftRouterRoutesRegistryKey] extends infer Routes
    ? Routes extends readonly unknown[]
      ? Routes[number]
      : never
    : never;

type RegisteredRoutePath = RegisteredRouteMetaData extends {
  path: infer Path extends string;
}
  ? Path
  : never;

export type NavigableRoutePath = Exclude<
  RegisteredRoutePath,
  `${string}**${string}`
>;

type RemoveOptionalMarker<Value extends string> = Value extends `${infer Name}?`
  ? Name
  : Value;

type SegmentParamName<Segment extends string> =
  Segment extends `:${infer Param}` ? RemoveOptionalMarker<Param> : never;

type PathParamNames<Path extends string> =
  Path extends `${infer Segment}/${infer Rest}`
    ? SegmentParamName<Segment> | PathParamNames<Rest>
    : SegmentParamName<Path>;

type RouteParamMap<Path extends string> = Simplify<{
  [Key in PathParamNames<Path>]: string;
}>;

type RegisteredRouteMetaDataForPath<Path extends string> = Extract<
  RegisteredRouteMetaData,
  { path: Path }
>;

type QueryParamNamesFromRouteMetaData<RouteMetaData> = RouteMetaData extends {
  queryParams: infer QueryParams extends object;
}
  ? Extract<keyof QueryParams, string>
  : never;

type QueryParamNamesForPath<Path extends string> =
  QueryParamNamesFromRouteMetaData<RegisteredRouteMetaDataForPath<Path>>;

type RouteQueryParamMap<Path extends string> = Simplify<{
  [Key in QueryParamNamesForPath<Path>]?: string;
}>;

type RouteParamsField<Path extends string> = [PathParamNames<Path>] extends [
  never,
]
  ? { params?: never }
  : { params: RouteParamMap<Path> };

type RouteQueryParamsField<Path extends string> = [
  QueryParamNamesForPath<Path>,
] extends [never]
  ? { queryParams?: never }
  : { queryParams?: RouteQueryParamMap<Path> };

// Unwraps the `viewTransitionPayload<T>()` marker the slim registry stores for a
// view-transition route into the declared `T | null` (the `null` = the nav's
// explicit opt-out). Done here — lazily, per navigation call site — rather than
// inside the registry, which is at TypeScript's instantiation-depth ceiling.
type ViewTransitionInputForPath<Path extends string> = string extends Path
  ? never
  : RegisteredRouteMetaDataForPath<Path> extends {
        viewTransition: ViewTransitionPayloadDef<infer Payload>;
      }
    ? Payload | null
    : never;

// Mirrors `RouteQueryParamsField`, but REQUIRED: a route that declares
// `withLoaderViewTransitionImage` surfaces a `viewTransition` field in the slim
// registry, which forces every link/navigation to it to pass the payload (or an
// explicit `null` opt-out).
type RouteViewTransitionField<Path extends string> = [
  ViewTransitionInputForPath<Path>,
] extends [never]
  ? { viewTransition?: never }
  : { viewTransition: ViewTransitionInputForPath<Path> };

type CraftRouterAbsoluteTarget<Path extends NavigableRoutePath> = Simplify<
  {
    to: Path;
  } & RouteParamsField<Path> &
    RouteQueryParamsField<Path> &
    RouteViewTransitionField<Path>
>;

type CraftRouterUrlCreationOptions<Path extends string> = Simplify<
  Omit<UrlCreationOptions, 'relativeTo' | 'queryParams'> &
    RouteQueryParamsField<Path>
>;

type CraftRouterNavigationOptions<Path extends string> = Simplify<
  Omit<NavigationExtras, 'relativeTo' | 'queryParams'> &
    RouteQueryParamsField<Path>
>;

type CraftRouterLinkOptions<Path extends string> = Simplify<
  Omit<
    NavigationExtras,
    | 'relativeTo'
    | 'queryParams'
    | 'onSameUrlNavigation'
    | 'browserUrl'
    | 'scroll'
  > &
    RouteQueryParamsField<Path>
>;

export type CraftRouterUrlTreeInput<
  Path extends NavigableRoutePath = NavigableRoutePath,
> = Path extends NavigableRoutePath
  ? Simplify<
      Omit<CraftRouterAbsoluteTarget<Path>, 'queryParams'> &
        CraftRouterUrlCreationOptions<Path>
    >
  : never;

export type CraftRouterNavigationInput<
  Path extends NavigableRoutePath = NavigableRoutePath,
> = Path extends NavigableRoutePath
  ? Simplify<
      Omit<CraftRouterAbsoluteTarget<Path>, 'queryParams'> &
        CraftRouterNavigationOptions<Path>
    >
  : never;

export type CraftRouterLinkInput<
  Path extends NavigableRoutePath = NavigableRoutePath,
> = Path extends NavigableRoutePath
  ? Simplify<
      Omit<CraftRouterAbsoluteTarget<Path>, 'queryParams'> &
        CraftRouterLinkOptions<Path>
    >
  : never;

export type CraftRouter = Omit<
  Router,
  'createUrlTree' | 'navigate' | 'navigateByUrl'
> & {
  createUrlTree(input: CraftRouterUrlTreeInput): UrlTree;
  navigate(input: CraftRouterNavigationInput): Promise<boolean>;
  navigateByUrl(input: CraftRouterNavigationInput): Promise<boolean>;
};

type HelperDependencies<Helper> = Helper extends {
  readonly [SERVICE_HELPER_DEPENDENCIES]?: infer Metadata;
}
  ? Metadata
  : never;

type WithInternalHelperDependencies<Helper> = {
  readonly [SERVICE_HELPER_DEPENDENCIES]?: HelperDependencies<Helper>;
};

type GeneratorYield<GeneratorValue> =
  GeneratorValue extends Generator<infer Yielded, any, any> ? Yielded : never;

type CraftRouterInputWithOptionalQueryParams = {
  to: string;
  params?: Record<string, string>;
  queryParams?: Params | null;
  viewTransition?: CraftViewTransitionInput;
};

type CraftRouterInputExtras = CraftRouterInputWithOptionalQueryParams &
  NavigationExtras;

// The `toCraftService` return type references internal Angular symbols
// (`SIGNAL`, `[iterator]`, `[unscopables]`) that ng-packagr cannot serialize to
// `.d.ts` (TS4023/TS4118). Cast through `unknown` and re-shape the destructured
// locals as opaque `Function` so declaration emit only sees a serializable
// shape. The exported `injectCraftRouter`/`CraftRouterToYield` below re-cast
// through `as unknown as ...`, so the lost typing here doesn't reach consumers.
const _routerService = toCraftService(
  {
    name: 'CraftRouter',
    scope: 'manuallyProvidedAtRoot',
    token: Router,
    provide: provideRouter,
  },
  (router): Router => createCraftRouter(router),
) as unknown as {
  injectCraftRouter: Function;
  provideCraftRouter: Function;
  CraftRouterToYield: Function;
};

const injectCraftRouterInternal = _routerService.injectCraftRouter;
const provideCraftRouterInternal = _routerService.provideCraftRouter;
const CraftRouterToYieldInternal = _routerService.CraftRouterToYield;

// We can't reach the request type via `ReturnType<typeof CraftRouterToYieldInternal>`
// because it picks the LAST overload (`<Exposed, Yielded>(...)`), whose
// generator's yield collapses to `unknown` when the generics are unbound.
// `GetServiceYields` extracts the proper `ServiceYieldRequest<...>` (and
// `ExposureYield<...>`) union from the helper's tracked metadata directly.
export type CraftRouterYieldRequest = GetServiceYields<
  typeof CraftRouterToYieldInternal
>;

type StructuralRouteParamsField<Path extends string> = [
  PathParamNames<Path>,
] extends [never]
  ? { params?: never }
  : { params: Simplify<{ [Key in PathParamNames<Path>]: string }> };

type DerivedNavigationInput<Path extends string> = Simplify<
  { to: Path } & StructuralRouteParamsField<Path> &
    Omit<NavigationExtras, 'relativeTo' | 'queryParams'> & {
      queryParams?: Params | null;
    }
>;

type DerivedUrlTreeInput<Path extends string> = Simplify<
  { to: Path } & StructuralRouteParamsField<Path> &
    Omit<UrlCreationOptions, 'relativeTo' | 'queryParams'> & {
      queryParams?: Params | null;
    }
>;

type RoutePathFromInput<Input extends { to: NavigableRoutePath }> = Extract<
  Input['to'],
  NavigableRoutePath
>;

/**
 * Derived shortcuts for `createUrlTree`, `navigate`, `navigateByUrl`.
 *
 * `to` is constrained to `NavigableRoutePath`, so typos in the path produce a
 * "Did you mean…" error pointing at every registered route. `params` and
 * `queryParams` are validated against that route's definition.
 *
 * This works because the registry is augmented with the slim
 * `CraftRoutesPathRegistry` view (`typeof routes.META_PATHS`) rather than the
 * full `CraftRoutesMetaData`. The slim view excludes `componentDeps`-derived
 * fields, which would otherwise create a self-referencing cycle when the
 * shortcut is called from a component whose own `GenDeps_*` is registered:
 *
 *     navigate(...) signature
 *       → NavigableRoutePath
 *         → CraftRouterRoutesRegistry
 *           → componentDeps (GenDeps_X)            // ← excluded by META_PATHS
 *             → propertiesDeps.method = ExtractDeps<X['method']>
 *               → X['method'] inferred from body
 *                 → body calls navigate(...) ↺ back to the top
 *
 * If a registry augmentation uses `typeof X.META_DATA` instead of
 * `typeof X.META_PATHS`, the cycle returns and TypeScript falls back to
 * `nextPage: any` with TS7022.
 */
type CraftRouterCraftMethodShortcuts = {
  createUrlTree: <Input extends { to: NavigableRoutePath }>(
    input: Input & CraftRouterUrlTreeInput<RoutePathFromInput<Input>>,
  ) => Generator<CraftRouterYieldRequest, UrlTree, unknown>;
  navigate: <Input extends { to: NavigableRoutePath }>(
    input: Input & CraftRouterNavigationInput<RoutePathFromInput<Input>>,
  ) => Generator<CraftRouterYieldRequest, Promise<boolean>, unknown>;
  navigateByUrl: <Input extends { to: NavigableRoutePath }>(
    input: Input & CraftRouterNavigationInput<RoutePathFromInput<Input>>,
  ) => Generator<CraftRouterYieldRequest, Promise<boolean>, unknown>;
};

type RouterPropertyShortcut<Value> = Value extends (
  ...args: infer Args
) => infer Result
  ? Args extends []
    ? { (): Generator<CraftRouterYieldRequest, Value, unknown> }
    : {
        (): Generator<CraftRouterYieldRequest, Value, unknown>;
        (...args: Args): Generator<CraftRouterYieldRequest, Result, unknown>;
      }
  : { (): Generator<CraftRouterYieldRequest, Value, unknown> };

type CraftRouterPropertyShortcuts = CraftRouterCraftMethodShortcuts & {
  [Key in Exclude<
    keyof Router,
    keyof Function | 'then' | 'createUrlTree' | 'navigate' | 'navigateByUrl'
  >]: RouterPropertyShortcut<Router[Key]>;
};

export type CraftRouterInjectHelper = WithInternalHelperDependencies<
  typeof injectCraftRouterInternal
> & {
  (): CraftRouter;
  <Exposed extends object>(
    bindings: undefined,
    expose: (router: CraftRouter) => Exposed,
  ): Exposed;
};

export type CraftRouterToYieldHelper = WithInternalHelperDependencies<
  typeof CraftRouterToYieldInternal
> &
  CraftRouterPropertyShortcuts & {
    (): Generator<CraftRouterYieldRequest, CraftRouter, unknown>;
    <Exposed extends object>(
      bindings: undefined,
      expose: (router: CraftRouter) => Exposed,
    ): Generator<CraftRouterYieldRequest, Exposed, unknown>;
  };

/**
 * Registers the router (Angular `provideRouter` under the hood) AND the
 * non-blocking outlet's pending/error surface in one call. Angular
 * `RouterFeatures` (`withComponentInputBinding()`, `withViewTransitions()`, …)
 * and craft loading features (`withErrorComponent()`, `withTransitionTimings()`,
 * `withPendingComponent()`, `withLoadingText()`) can be mixed freely — they are
 * split apart and routed to `provideRouter` / `provideCraftLoading` accordingly.
 *
 * ```ts
 * provideCraftRouter(
 *   demoRoutes.toRoutes(),
 *   withComponentInputBinding(),
 *   withErrorComponent({ component: MyGlobalErrorScreen, componentDeps: {} as GenDeps_MyGlobalErrorScreen }),
 *   withTransitionTimings({ stayMs: 300, blankMs: 300, pendingMinMs: 500 }),
 * )
 * ```
 *
 * Equivalent to a separate `provideRouter(...)` + `provideCraftLoading(...)`,
 * but keeps all routing configuration in a single provider.
 */
export function provideCraftRouter(
  routes: Routes,
  ...features: Array<RouterFeatures | CraftLoadingFeature>
): (Provider | EnvironmentProviders)[] {
  const routerFeatures: RouterFeatures[] = [];
  const loadingFeatures: CraftLoadingFeature[] = [];

  for (const feature of features) {
    if (isCraftLoadingFeature(feature)) {
      loadingFeatures.push(feature);
    } else {
      routerFeatures.push(feature);
    }
  }

  return [
    provideCraftRouterInternal(routes, ...routerFeatures),
    ...provideCraftLoading(...loadingFeatures),
  ];
}

export const injectCraftRouter =
  injectCraftRouterInternal as unknown as CraftRouterInjectHelper;

/**
 * Yields the `CraftRouter` inside a generator. Two equivalent forms.
 *
 * # Derived shortcut — recommended
 *
 * ```ts
 * yield* CraftRouterToYield.navigate({
 *   to: 'query/:userId',          // validated against the registry
 *   params: { userId: '1' },      // validated against the path's :params
 * });
 * ```
 *
 * `to` must match a path in `CraftRouterRoutesRegistry`; typos produce a
 * "Did you mean…" error. `params` and `queryParams` are validated against
 * that route's declaration.
 *
 * # Full router access
 *
 * ```ts
 * const router = yield* CraftRouterToYield();
 * router.events.subscribe(...);
 * ```
 *
 * Use this when you need a router property the shortcut doesn't expose
 * (e.g. `events`, `routerState`, `url`).
 *
 * # Registry setup
 *
 * For the path validation to work without creating a self-referencing cycle,
 * the registry augmentation must use the slim `META_PATHS` view, not
 * `META_DATA`:
 *
 * ```ts
 * declare module '@craft-ng/core' {
 *   interface CraftRouterRoutesRegistry {
 *     Demo: typeof demoRoutes.META_PATHS;
 *   }
 * }
 * ```
 *
 * `META_DATA` stays available on the same `craftRoutes` result for tooling
 * that needs the full per-route component dependencies (e.g. an e2e test
 * runner that mocks every endpoint a route can reach).
 */
export const CraftRouterToYield =
  CraftRouterToYieldInternal as unknown as CraftRouterToYieldHelper;

@Directive({
  selector: '[craftRouterLink]',
  standalone: true,
  hostDirectives: [
    {
      directive: RouterLink,
      inputs: ['target'],
    },
  ],
})
export class CraftRouterLink {
  private readonly routerLink = inject(RouterLink, { self: true });

  readonly craftRouterLink = input<CraftRouterLinkInput | null | undefined>(
    undefined,
    { alias: 'craftRouterLink' },
  );

  constructor() {
    effect(() => {
      const input = this.craftRouterLink();

      if (!input) {
        this.routerLink.routerLink = null;
        this.routerLink.queryParams = undefined;
        this.routerLink.fragment = undefined;
        this.routerLink.queryParamsHandling = undefined;
        this.routerLink.preserveFragment = false;
        this.routerLink.skipLocationChange = false;
        this.routerLink.replaceUrl = false;
        this.routerLink.state = undefined;
        this.routerLink.info = undefined;
        this.routerLink.ngOnChanges();
        return;
      }

      this.routerLink.routerLink = createCraftRouterCommands(input);
      this.routerLink.queryParams = input.queryParams;
      this.routerLink.fragment = input.fragment;
      this.routerLink.queryParamsHandling = input.queryParamsHandling;
      this.routerLink.preserveFragment = input.preserveFragment ?? false;
      this.routerLink.skipLocationChange = input.skipLocationChange ?? false;
      this.routerLink.replaceUrl = input.replaceUrl ?? false;
      this.routerLink.state = withViewTransitionState(
        input as { viewTransition?: CraftViewTransitionInput },
        input.state,
      );
      this.routerLink.info = input.info;
      this.routerLink.relativeTo = null;
      this.routerLink.ngOnChanges();
    });
  }
}

function createCraftRouter(router: Router): Router {
  const createUrlTree = (input: CraftRouterUrlTreeInput) =>
    router.createUrlTree(
      createCraftRouterCommands(input),
      getUrlCreationOptions(input),
    );
  const navigate = (input: CraftRouterNavigationInput) =>
    router.navigate(
      createCraftRouterCommands(input),
      getNavigationOptions(input),
    );
  const navigateByUrl = (input: CraftRouterNavigationInput) =>
    router.navigateByUrl(
      createUrlTree(input),
      getNavigationBehaviorOptions(input),
    );

  return new Proxy(router, {
    get(target, property, receiver) {
      switch (property) {
        case 'createUrlTree':
          return createUrlTree;
        case 'navigate':
          return navigate;
        case 'navigateByUrl':
          return navigateByUrl;
        default:
          return Reflect.get(target, property, receiver);
      }
    },
  }) as unknown as Router;
}

function createCraftRouterCommands(
  input: CraftRouterInputWithOptionalQueryParams,
): readonly unknown[] {
  if (input.to === '') {
    return ['/'];
  }

  const segments = input.to.split('/').filter(Boolean);

  if (segments.length === 0) {
    return ['/'];
  }

  return segments.map((segment, index) => {
    const value = segment.startsWith(':')
      ? resolveRouteParamValue(segment, input)
      : segment;

    return index === 0 ? `/${value}` : value;
  });
}

function resolveRouteParamValue(
  segment: string,
  input: CraftRouterInputWithOptionalQueryParams,
): string {
  const paramName = segment.slice(1).replace(/\?$/, '');
  const value = input.params?.[paramName];

  if (value === undefined) {
    throw new Error(
      `Missing route param "${paramName}" for route "${input.to}".`,
    );
  }

  return value;
}

function getUrlCreationOptions(
  input: CraftRouterInputExtras,
): UrlCreationOptions {
  return {
    queryParams: input.queryParams,
    fragment: input.fragment,
    queryParamsHandling: input.queryParamsHandling,
    preserveFragment: input.preserveFragment,
    relativeTo: null,
  };
}

function getNavigationOptions(input: CraftRouterInputExtras): NavigationExtras {
  return {
    ...getUrlCreationOptions(input),
    onSameUrlNavigation: input.onSameUrlNavigation,
    skipLocationChange: input.skipLocationChange,
    replaceUrl: input.replaceUrl,
    state: withViewTransitionState(input, input.state),
    info: input.info,
    browserUrl: input.browserUrl,
    scroll: input.scroll,
  };
}

function getNavigationBehaviorOptions(
  input: CraftRouterInputExtras,
): NavigationBehaviorOptions {
  return {
    onSameUrlNavigation: input.onSameUrlNavigation,
    skipLocationChange: input.skipLocationChange,
    replaceUrl: input.replaceUrl,
    state: withViewTransitionState(input, input.state),
    info: input.info,
    browserUrl: input.browserUrl,
    scroll: input.scroll,
  };
}

/**
 * Threads the view-transition payload into Angular's navigation `state` under
 * {@link CRAFT_VIEW_TRANSITION_STATE_KEY}, where the outlet reads it. Leaves the
 * caller's `state` untouched when no `viewTransition` was passed.
 */
function withViewTransitionState(
  input: { viewTransition?: CraftViewTransitionInput },
  state: { [k: string]: unknown } | undefined,
): { [k: string]: unknown } | undefined {
  if (input.viewTransition === undefined) {
    return state;
  }
  return {
    ...(state ?? {}),
    [CRAFT_VIEW_TRANSITION_STATE_KEY]: input.viewTransition,
  };
}

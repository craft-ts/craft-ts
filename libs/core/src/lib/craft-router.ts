import {
  DestroyRef,
  EnvironmentInjector,
  Injector,
  inject,
  getCraftRootDefaultProviders,
  type EnvironmentProviders,
  type Provider,
} from './host/craft-compat';
import type { GetDeps } from './branded-component/branded-component';
import {
  isCraftLoadingFeature,
  provideCraftLoading,
  type CraftLoadingFeature,
} from './craft-pending';
import {
  createCraftTitleStrategy,
  type CraftTitleStrategy,
} from './craft-a11y';
import {
  type ActivatedRoute,
  type ActivatedRouteSnapshot,
  type Data,
  type ParamMap,
  type RouterStateSnapshot,
} from './host/craft-router-types';
import { provideCraftActivatedRoute } from './craft-activated-route';
import {
  craftService,
  type ServiceTrackingMetadata,
  type ServiceYieldRequest,
  type SERVICE_HELPER_DEPENDENCIES,
} from './craft-service';
import type { Simplify } from './craft-service.shared';
import {
  ɵprovideCraftViewTransitionDefaults,
  CRAFT_VIEW_TRANSITION_STATE_KEY,
  type CraftViewTransitionInput,
  type ViewTransitionPayloadDef,
} from './craft-view-transition';
import {
  craftNodeDirective,
  ɵinjectCraftNodeEffectFactoryIn,
  type CraftNodeDirective,
} from './craft-node-directive';
import { executeYieldable } from './yieldable';
import { executeGeneratorCompatibleFactoryAsync } from './craft-program-runtime';
import {
  buildPathFromTemplate,
  createBrowserHistory,
  createUrlFromParts,
  findUnresolvedLoadChildrenRoute,
  matchCraftRoutes,
  matchCraftRoutesAsync,
  parseSearchParams,
  serializeLocation,
  splitPath,
  toCraftRouterUrl,
  toExternalCraftRouterUrl,
  type CraftCompiledRoute,
  type CraftLocation as RuntimeCraftLocation,
} from './host/craft-router-runtime';
import {
  craftSignal,
  craftWatch,
  type CraftSignal,
  type CraftWritableSignal,
} from './host/craft-signal';
import {
  provideCraftCompiledRoutes,
  CraftHistory,
  provideCraftHistory,
  CraftLocation,
  provideCraftLocation,
  CraftMatch,
  provideCraftMatch,
  CraftRouterRuntime,
  provideCraftRouterRuntimeValue,
  ɵinjectCraftRouterRuntime,
  type CraftNavigation,
  type CraftNavigationExtras,
  type CraftRouterNavigationApi,
  type CraftRouterEvent,
  type CraftUrlTree,
} from './craft-router-tokens';
import { ɵinjectCraftPlatform } from './craft-platform';
import {
  ɵinjectCraftHistory,
  ɵinjectCraftLocation,
  ɵinjectCraftCompiledRoutes,
} from './craft-router-tokens';

export {
  createBrowserHistory,
  createMemoryHistory,
  matchCraftRoutes,
  matchCraftRoutesAsync,
  type CraftCompiledRoute,
} from './host/craft-router-runtime';
export {
  CraftCompiledRoutes,
  provideCraftCompiledRoutes,
  CraftHistory,
  provideCraftHistory,
  CraftLocation,
  provideCraftLocation,
  CraftMatch,
  provideCraftMatch,
  type CraftNavigationExtras,
  type CraftRouterNavigationApi,
  type CraftUrlTree,
} from './craft-router-tokens';

// The registry is intentionally empty here and augmented by route declarations.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-empty-interface
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

type QueryParamsNamesFromRouteMetaData<RouteMetaData> = RouteMetaData extends {
  queryParams: infer QueryParams extends object;
}
  ? Extract<keyof QueryParams, string>
  : never;

type QueryParamsNamesForPath<Path extends string> =
  QueryParamsNamesFromRouteMetaData<RegisteredRouteMetaDataForPath<Path>>;

type RouteQueryParamsMap<Path extends string> = Simplify<{
  [Key in QueryParamsNamesForPath<Path>]?: string;
}>;

type RouteParamsField<Path extends string> = [PathParamNames<Path>] extends [
  never,
]
  ? { params?: never }
  : { params: RouteParamMap<Path> };

type RouteQueryParamsField<Path extends string> = [
  QueryParamsNamesForPath<Path>,
] extends [never]
  ? { queryParams?: never }
  : { queryParams?: RouteQueryParamsMap<Path> };

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
  Omit<CraftNavigationExtras, 'state'> & RouteQueryParamsField<Path>
>;

type CraftRouterNavigationOptions<Path extends string> = Simplify<
  CraftNavigationExtras & RouteQueryParamsField<Path>
>;

type CraftRouterLinkOptions<Path extends string> = Simplify<
  Omit<CraftNavigationExtras, 'onSameUrlNavigation' | 'browserUrl' | 'scroll'> &
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

export type CraftRouter = {
  readonly url: string;
  createUrlTree(input: CraftRouterUrlTreeInput): CraftUrlTree;
  navigate(input: CraftRouterNavigationInput): Promise<boolean>;
  navigateByUrl(
    url: string | CraftUrlTree,
    extras?: CraftNavigationExtras,
  ): Promise<boolean>;
  navigateByUrl(input: CraftRouterNavigationInput): Promise<boolean>;
  serializeUrl(tree: CraftUrlTree): string;
  isActive(
    url: string | CraftUrlTree,
    extras?: {
      paths?: 'exact' | 'subset';
      queryParams?: string;
      fragment?: string;
      matrixParams?: string;
    },
  ): boolean;
  events: {
    subscribe(fn: (event: CraftRouterEvent) => void): { unsubscribe(): void };
  };
  getCurrentNavigation(): CraftNavigation | null;
};

type HelperDependencies<Helper> = Helper extends {
  readonly [SERVICE_HELPER_DEPENDENCIES]?: infer Metadata;
}
  ? Metadata
  : never;

type WithInternalHelperDependencies<Helper> = {
  readonly [SERVICE_HELPER_DEPENDENCIES]?: HelperDependencies<Helper>;
};

type CraftRouterInputWithOptionalQueryParams = {
  to: string;
  params?: Record<string, string>;
  queryParams?: Record<string, string> | null;
  fragment?: string | null;
  viewTransition?: CraftViewTransitionInput;
};

type CraftRouterInputExtras = CraftRouterInputWithOptionalQueryParams &
  CraftNavigationExtras;

const routerService = craftService(
  { name: 'CraftRouter', providedIn: 'toProvide' },
  function* () {
    return (yield* CraftRouterRuntime()) as CraftRouter;
  },
);

type GeneratedCraftRouterHelper = {
  (): Generator<unknown, CraftRouter, unknown>;
  <Exposed extends object>(
    bindings: undefined,
    expose: (router: CraftRouter) => Exposed,
  ): Generator<unknown, Exposed, unknown>;
};

const CraftRouterInternal =
  routerService.CraftRouter as unknown as GeneratedCraftRouterHelper;

// We can't reach the request type via `ReturnType<typeof CraftRouterInternal>`
// because it picks the LAST overload (`<Exposed, Yielded>(...)`), whose
// generator's yield collapses to `unknown` when the generics are unbound.
// Keep the public service request's literal name and result type here so
// helper dependency extraction still records `CraftRouter`, without exposing
// craftService's private runtime markers in this package's declaration output.
export type CraftRouterYieldRequest = ServiceYieldRequest<
  'toProvide',
  CraftRouter,
  ServiceTrackingMetadata<
    'CraftRouter',
    'toProvide',
    CraftRouter,
    never,
    undefined,
    never,
    false,
    false
  >
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
  ) => Generator<CraftRouterYieldRequest, CraftUrlTree, unknown>;
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
    keyof CraftRouter,
    'then' | 'createUrlTree' | 'navigate' | 'navigateByUrl'
  >]: RouterPropertyShortcut<CraftRouter[Key]>;
};

export type CraftRouterHelper = WithInternalHelperDependencies<
  typeof CraftRouterInternal
> &
  CraftRouterPropertyShortcuts & {
    (): Generator<CraftRouterYieldRequest, CraftRouter, unknown>;
    <Exposed extends object>(
      bindings: undefined,
      expose: (router: CraftRouter) => Exposed,
    ): Generator<CraftRouterYieldRequest, Exposed, unknown>;
  };

/**
 * Registers the Craft history matcher AND the non-blocking outlet's
 * pending/error surface in one call. Craft loading features
 * (`withErrorComponent()`, `withTransitionTimings()`, `withPendingComponent()`,
 * `withLoadingText()`, `withCraftViewTransitions()`) are applied; leftover
 * Angular `RouterFeatures` such as `withComponentInputBinding()` are ignored
 * (input binding is owned by the outlet).
 *
 * ```ts
 * provideCraftRouter(
 *   demoRoutes.toRoutes(),
 *   withErrorComponent({ component: CraftGlobalErrorComponentHost }),
 *   withTransitionTimings({ stayMs: 300, blankMs: 300, pendingMinMs: 500 }),
 * )
 * ```
 */
export function provideCraftRouter(
  routes: readonly CraftCompiledRoute[] | readonly { readonly path?: string }[],
  ...features: Array<CraftLoadingFeature | unknown>
): (Provider | EnvironmentProviders)[] {
  const loadingFeatures: CraftLoadingFeature[] = [];
  const configuredRoutes = [...(routes as readonly CraftCompiledRoute[])];
  const useHashLocation = features.some(isCraftHashLocationFeature);

  for (const feature of features) {
    if (isCraftLoadingFeature(feature)) {
      loadingFeatures.push(feature);
      if (feature.recoveryRoute) {
        configuredRoutes.push(feature.recoveryRoute as CraftCompiledRoute);
      }
    }
  }

  return [
    ...getCraftRootDefaultProviders(),
    routerService.provideCraftRouter() as unknown as Provider,
    ...provideCraftRouterRuntime(configuredRoutes, useHashLocation),
    ...ɵprovideCraftViewTransitionDefaults(),
    ...provideCraftLoading(...loadingFeatures),
  ];
}

const CRAFT_HASH_LOCATION_FEATURE = Symbol('craft-hash-location-feature');

/** Router feature that stores the Craft URL after `#`, for static client apps. */
export interface CraftHashLocationFeature {
  readonly [CRAFT_HASH_LOCATION_FEATURE]: true;
}

/**
 * Use hash URLs such as `/#/products/42?page=2`. The server cannot select a
 * route from a fragment, so this strategy is intended for client rendered apps.
 */
export function withHashLocation(): CraftHashLocationFeature {
  return { [CRAFT_HASH_LOCATION_FEATURE]: true };
}

function isCraftHashLocationFeature(
  value: unknown,
): value is CraftHashLocationFeature {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [CRAFT_HASH_LOCATION_FEATURE]?: unknown })[
      CRAFT_HASH_LOCATION_FEATURE
    ] === true
  );
}

/**
 * Yields the `CraftRouter` inside a generator. Two equivalent forms.
 *
 * # Derived shortcut — recommended
 *
 * ```ts
 * yield* CraftRouter.navigate({
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
 * const router = yield* CraftRouter();
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
 * declare module '@craft-ts/core' {
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
export const CraftRouter = CraftRouterInternal as unknown as CraftRouterHelper;

type CraftRouterLinkValue = CraftRouterLinkInput | null | undefined;

type CraftRouterLinkBinding =
  | CraftRouterLinkValue
  | (() =>
      | CraftRouterLinkValue
      | Generator<unknown, CraftRouterLinkValue, unknown>);

/**
 * Creates a functional Craft directive for type-safe router links.
 *
 * @example
 * a({}, 'Tasks').pipe(CraftRouterLink({ to: 'tasks' }))
 */
export function CraftRouterLink(
  link: CraftRouterLinkBinding,
): CraftNodeDirective<Readonly<Record<never, never>>> {
  return craftNodeDirective<Readonly<Record<never, never>>>(
    'CraftRouterLink',
    [],
    (context) => {
      const router = ɵinjectCraftRouterRuntime() as CraftRouter;
      let currentInput: CraftRouterLinkInput | null | undefined;
      let currentUrlTree: CraftUrlTree | undefined;

      const syncAriaCurrent = () => {
        if (!currentUrlTree) {
          context.renderer.removeAttribute(context.element, 'aria-current');
          return;
        }
        const active = router.isActive(currentUrlTree, {
          paths: 'exact',
          queryParams: 'ignored',
          fragment: 'ignored',
          matrixParams: 'ignored',
        });
        if (active) {
          context.renderer.setAttribute(
            context.element,
            'aria-current',
            'page',
          );
        } else {
          context.renderer.removeAttribute(context.element, 'aria-current');
        }
      };

      const hrefEffect = ɵinjectCraftNodeEffectFactoryIn(context.injector)(
        'router-link-href',
        () => {
          const candidate = link;
          currentInput =
            typeof candidate === 'function'
              ? executeYieldable(candidate, [], context.injector)
              : candidate;

          if (!currentInput) {
            currentUrlTree = undefined;
            context.renderer.removeAttribute(context.element, 'href');
            syncAriaCurrent();
            return;
          }

          currentUrlTree = router.createUrlTree(currentInput);
          context.renderer.setAttribute(
            context.element,
            'href',
            router.serializeUrl(currentUrlTree),
          );
          syncAriaCurrent();
        },
      );

      const navigation = router.events.subscribe((event) => {
        if (event.type === 'NavigationEnd') syncAriaCurrent();
      });

      const removeClickListener = context.renderer.listen(
        context.element,
        'click',
        (event) => {
          const mouseEvent = event as MouseEvent;
          if (
            !currentInput ||
            !currentUrlTree ||
            !shouldHandleCraftRouterLinkClick(mouseEvent, context.element)
          ) {
            return;
          }

          mouseEvent.preventDefault();
          void router.navigateByUrl(
            currentUrlTree,
            getNavigationBehaviorOptions(currentInput),
          );
        },
        // Intercept before a user click handler can synchronously destroy the
        // anchor (for example, a menu item that closes its containing panel).
        { capture: true },
      );
      return () => {
        removeClickListener();
        navigation.unsubscribe();
        hrefEffect.destroy();
      };
    },
  );
}

export function shouldHandleCraftRouterLinkClick(
  event: MouseEvent,
  element: Element,
): boolean {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.metaKey
  ) {
    return false;
  }

  const target = element.getAttribute('target');
  if (target && target.toLowerCase() !== '_self') return false;
  if (element.hasAttribute('download')) return false;
  if (
    element.hasAttribute('disabled') ||
    element.getAttribute('aria-disabled') === 'true'
  ) {
    return false;
  }
  return true;
}

function emptyParamMap(): ParamMap {
  return {
    has: () => false,
    get: () => null,
    getAll: () => [],
    keys: [],
  };
}

function emptyActivatedRouteSnapshot(): ActivatedRouteSnapshot {
  const snapshot: ActivatedRouteSnapshot = {
    routeConfig: null,
    url: [],
    params: {},
    queryParams: {},
    fragment: null,
    data: {} as Data,
    outlet: 'primary',
    paramMap: emptyParamMap(),
    queryParamMap: emptyParamMap(),
    parent: null,
    root: null as unknown as ActivatedRouteSnapshot,
    firstChild: null,
    children: [],
    pathFromRoot: [],
  };
  snapshot.root = snapshot;
  snapshot.pathFromRoot = [snapshot];
  return snapshot;
}

function matchToRouterStateSnapshot(match: CraftMatch): RouterStateSnapshot {
  const makeNode = (
    route: CraftCompiledRoute,
    firstChild: ActivatedRouteSnapshot | null,
  ): ActivatedRouteSnapshot => ({
    routeConfig: route,
    url: [],
    params: match.params,
    queryParams: match.queryParams,
    fragment: match.hash ? match.hash.replace(/^#/, '') || null : null,
    data: (route.data ?? match.data ?? {}) as Data,
    outlet: 'primary',
    title: typeof route.title === 'string' ? route.title : undefined,
    paramMap: emptyParamMap(),
    queryParamMap: emptyParamMap(),
    parent: null,
    root: null as unknown as ActivatedRouteSnapshot,
    firstChild,
    children: firstChild ? [firstChild] : [],
    pathFromRoot: [],
  });

  let child: ActivatedRouteSnapshot | null = null;
  for (let index = match.routes.length - 1; index >= 0; index -= 1) {
    child = makeNode(match.routes[index]!, child);
  }
  const root = child ?? makeNode(match.route, null);
  const path: ActivatedRouteSnapshot[] = [];
  let current: ActivatedRouteSnapshot | null = root;
  while (current) {
    path.push(current);
    current = current.firstChild;
  }
  path.forEach((node, index) => {
    node.parent = index > 0 ? path[index - 1]! : null;
    node.pathFromRoot = path.slice(0, index + 1);
    node.root = root;
  });
  return { url: serializeLocation(match), root };
}

function commitCraftMatch(
  match: CraftWritableSignal<CraftMatch | null>,
  history: CraftHistory,
  location: CraftLocation,
  resolved: CraftMatch | null,
  titleStrategy: CraftTitleStrategy,
): void {
  match.set(resolved);
  if (resolved && serializeLocation(resolved) !== serializeLocation(location)) {
    history.replace(serializeLocation(resolved), history.getState());
  }
  if (resolved) {
    titleStrategy.updateTitle(matchToRouterStateSnapshot(resolved));
  }
}

async function resolveFunctionRedirectTo(
  match: CraftMatch,
  parent: EnvironmentInjector,
): Promise<string | null> {
  const redirectTo = match.route.redirectTo;
  if (typeof redirectTo !== 'function') {
    return null;
  }
  const providers = Array.isArray(match.route.providers)
    ? (match.route.providers as Provider[])
    : [];
  const injector =
    providers.length > 0
      ? Injector.create({
          providers,
          parent,
          name: 'CraftRedirectTo',
        })
      : parent;
  const settled = await executeGeneratorCompatibleFactoryAsync({
    factory: redirectTo as (...args: unknown[]) => unknown,
    thisArg: undefined,
    getInjector: () => injector,
    args: [],
    invalidYieldErrorMessage:
      'craft redirectTo can only yield craftService dependencies, exposed dependency helpers, or an craftUntilSettled/craftUntilDefined await request.',
  });
  if (settled.kind !== 'done') {
    return null;
  }
  const value = settled.value;
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as { toString?: unknown }).toString === 'function'
  ) {
    const url = String(value);
    return url.length > 0 && url !== '[object Object]' ? url : null;
  }
  return null;
}

function toAbsoluteRedirectUrl(url: string): string {
  return url.startsWith('/') ? url : `/${url}`;
}

function provideCraftRouterRuntime(
  routes: readonly CraftCompiledRoute[] = [],
  useHashLocation = false,
  ..._features: unknown[]
): Provider[] {
  const navigation: { current: CraftNavigation | null } = { current: null };
  let currentMatch: (() => CraftMatch | null) | null = null;
  return [
    provideCraftCompiledRoutes(routes) as unknown as Provider,
    provideCraftHistory((() => {
      const platform = ɵinjectCraftPlatform();
      // Browser platforms build their default path history before router
      // features are instantiated. Recreate it from the platform window when
      // hash mode is selected so the strategy is active from the first read.
      const history = (() => {
        if (platform?.kind === 'browser' && useHashLocation) {
          platform.history.dispose();
          return createBrowserHistory(platform.window ?? globalThis.window, {
            useHashLocation,
          });
        }
        return platform?.history ?? createBrowserHistory(globalThis.window);
      })();
      inject(DestroyRef).onDestroy(() => history.dispose());
      return history;
    }) as unknown as CraftHistory) as unknown as Provider,
    provideCraftLocation((() => {
      const history = injectCraftHistory();
      const location = craftSignal(history.get());
      const stop = history.listen((next) => location.set(next));
      inject(DestroyRef).onDestroy(stop);
      return location;
    }) as unknown as CraftWritableSignal<RuntimeCraftLocation>) as unknown as Provider,
    provideCraftMatch((() => {
      const location = injectCraftLocation();
      const compiled = injectCraftCompiledRoutes();
      const history = injectCraftHistory();
      const environmentInjector = inject(EnvironmentInjector);
      const titleStrategy = createCraftTitleStrategy();
      const match = craftSignal<CraftMatch | null>(null);
      currentMatch = match;
      let generation = 0;
      craftWatch(() => {
        const nextLocation = location();
        const current = ++generation;
        const syncMatch = matchCraftRoutes(compiled, nextLocation);
        if (typeof syncMatch?.route.redirectTo === 'function') {
          void resolveFunctionRedirectTo(syncMatch, environmentInjector).then(
            (redirectUrl) => {
              if (current !== generation || !redirectUrl) return;
              const target = toAbsoluteRedirectUrl(redirectUrl);
              if (target !== serializeLocation(nextLocation)) {
                history.replace(target, history.getState());
              }
            },
          );
          return;
        }
        const pending = findUnresolvedLoadChildrenRoute(
          compiled,
          splitPath(syncMatch?.pathname || nextLocation.pathname || '/'),
        );
        if (pending) {
          void matchCraftRoutesAsync(compiled, {
            ...nextLocation,
            pathname: nextLocation.pathname || '/',
          }).then((resolved) => {
            if (current !== generation) return;
            commitCraftMatch(match, history, nextLocation, resolved, titleStrategy);
          }).catch(() => {
            // Keep the last committed match if a lazy route chunk fails. The
            // navigation has already been recorded in history, but the outlet
            // can still render the page it successfully mounted before this
            // failed rematch.
          });
          return;
        }
        commitCraftMatch(match, history, nextLocation, syncMatch, titleStrategy);
        navigation.current = null;
      });
      return match;
    }) as unknown as CraftSignal<CraftMatch | null>) as unknown as Provider,
    // The Craft router owns the activated route: it is the leaf of the
    // snapshot built from the current match, and empty before the first one.
    provideCraftActivatedRoute((): ActivatedRoute => {
        const leafOf = (snapshot: ActivatedRouteSnapshot) => {
          let node = snapshot;
          while (node.firstChild) node = node.firstChild;
          return node;
        };
        const snapshot = () => {
          const current = currentMatch?.() ?? null;
          return current
            ? leafOf(matchToRouterStateSnapshot(current).root)
            : emptyActivatedRouteSnapshot();
        };
        return {
          get snapshot() {
            return snapshot();
          },
          get pathFromRoot() {
            return snapshot().pathFromRoot.map((node) => ({
              snapshot: node,
              pathFromRoot: [],
            }));
          },
        };
      }),
    provideCraftRouterRuntimeValue((() =>
      createNativeCraftRouter(
        injectCraftHistory(),
        injectCraftLocation(),
        navigation,
        useHashLocation,
      )) as unknown as CraftRouterNavigationApi) as unknown as Provider,
  ];
}

const injectCraftHistory = () => {
  return ɵinjectCraftHistory() as CraftHistory;
};
const injectCraftLocation = () =>
  ɵinjectCraftLocation() as CraftWritableSignal<CraftLocation>;
const injectCraftCompiledRoutes = () =>
  ɵinjectCraftCompiledRoutes() as readonly CraftCompiledRoute[];

function createNativeCraftRouter(
  history: CraftHistory,
  location: CraftWritableSignal<CraftLocation>,
  navigation: { current: CraftNavigation | null },
  useHashLocation = false,
): CraftRouter {
  const listeners = new Set<(event: CraftRouterEvent) => void>();

  const toUrl = (
    input: CraftRouterInputWithOptionalQueryParams & CraftNavigationExtras,
  ): string => {
    const current = history.get();
    let query = input.queryParams ?? undefined;
    if (input.queryParamsHandling === 'preserve') {
      query = parseSearchParams(current.search);
    } else if (input.queryParamsHandling === 'merge') {
      query = {
        ...parseSearchParams(current.search),
        ...(input.queryParams ?? {}),
      };
    }
    const fragment = input.preserveFragment
      ? current.hash.replace(/^#/, '') || undefined
      : (input.fragment ?? undefined);
    return createUrlFromParts(
      buildPathFromTemplate(input.to, input.params),
      query,
      fragment,
    );
  };

  const createUrlTree = (input: CraftRouterUrlTreeInput): CraftUrlTree => {
    const url = toUrl(input);
    return { toString: () => url, __craftUrlTree: true as const };
  };

  const commit = (
    inputUrl: string,
    extras?: CraftNavigationExtras,
  ): Promise<boolean> => {
    const url = toCraftRouterUrl(inputUrl, useHashLocation);
    const withVt = extras
      ? {
          ...extras,
          state: withViewTransitionState(
            extras as { viewTransition?: CraftViewTransitionInput },
            extras.state,
          ),
        }
      : extras;
    navigation.current = { extras: withVt };
    for (const listener of listeners) {
      listener({ type: 'NavigationStart', url });
    }
    if (withVt?.skipLocationChange) {
      history.skip(url, withVt.state ?? null);
    } else if (withVt?.replaceUrl) {
      history.replace(url, withVt.state ?? null);
    } else {
      history.push(url, withVt?.state ?? null);
    }
    for (const listener of listeners) {
      listener({ type: 'NavigationEnd', url });
    }
    return Promise.resolve(true);
  };

  return {
    get url() {
      return serializeLocation(location());
    },
    createUrlTree,
    navigate: (input) => commit(toUrl(input), input as CraftNavigationExtras),
    navigateByUrl: ((input: unknown, extras?: CraftNavigationExtras) => {
      if (typeof input === 'string') {
        return commit(input, extras);
      }
      if (
        input &&
        typeof input === 'object' &&
        'to' in input &&
        typeof (input as { to?: unknown }).to === 'string'
      ) {
        const navigationInput = input as CraftRouterNavigationInput;
        return commit(toUrl(navigationInput), {
          ...extras,
          ...(navigationInput as CraftNavigationExtras),
        });
      }
      return commit(String(input), extras);
    }) as CraftRouter['navigateByUrl'],
    serializeUrl: (tree) =>
      toExternalCraftRouterUrl(tree.toString(), useHashLocation),
    isActive: (tree, extras) => {
      const target =
        toCraftRouterUrl(String(tree), useHashLocation)
          .split('?')[0]
          ?.split('#')[0] ?? '';
      const current = location().pathname;
      if (extras?.paths === 'subset') {
        return current === target || current.startsWith(`${target}/`);
      }
      return current === target;
    },
    events: {
      subscribe(fn) {
        listeners.add(fn);
        return {
          unsubscribe: () => {
            listeners.delete(fn);
          },
        };
      },
    },
    getCurrentNavigation: () => navigation.current,
  };
}

export function createCraftRouterCommands(
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

function getNavigationBehaviorOptions(
  input: CraftRouterInputExtras,
): CraftNavigationExtras {
  return {
    replaceUrl: input.replaceUrl,
    skipLocationChange: input.skipLocationChange,
    state: withViewTransitionState(input, input.state),
  };
}

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

/** @deprecated Moved to `@craft-ts/angular`. */
export type GenDeps_LegacyCraftRouterLink = GetDeps<{
  deps: Record<string, never>;
  provided: Record<never, never>;
  missingProvider: Record<string, never>;
}>;

/** @deprecated DI metadata belongs to `LegacyCraftRouterLink` only. */
export type GenDeps_CraftRouterLink = GenDeps_LegacyCraftRouterLink;

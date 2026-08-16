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
  CRAFT_TITLE_STRATEGY,
  createCraftTitleStrategy,
  type CraftTitleStrategy,
} from './craft-a11y';
import {
  ActivatedRoute,
  type ActivatedRouteSnapshot,
  type Data,
  type ParamMap,
  type RouterStateSnapshot,
} from './host/craft-router-types';
import {
  ɵtoCraftService as toCraftService,
  type GetServiceYields,
  type SERVICE_HELPER_DEPENDENCIES,
  type ServiceTrackingMetadata,
} from './craft-service';
import type { Simplify } from './craft-service.shared';
import {
  CRAFT_VIEW_TRANSITION_STATE_KEY,
  type CraftViewTransitionInput,
  type ViewTransitionPayloadDef,
} from './craft-view-transition';
import {
  CRAFT_NODE_EFFECT_FACTORY,
  craftNodeDirective,
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
  type CraftCompiledRoute,
  type CraftHistory,
  type CraftLocation,
  type CraftMatch,
} from './host/craft-router-runtime';
import {
  craftSignal,
  craftWatch,
  type CraftWritableSignal,
} from './host/craft-signal';
import {
  CRAFT_COMPILED_ROUTES,
  CRAFT_HISTORY,
  CRAFT_LOCATION,
  CRAFT_MATCH,
  CRAFT_ROUTER,
  type CraftNavigation,
  type CraftNavigationExtras,
  type CraftRouterEvent,
  type CraftUrlTree,
} from './craft-router-tokens';

export {
  createBrowserHistory,
  createMemoryHistory,
  matchCraftRoutes,
  matchCraftRoutesAsync,
  type CraftCompiledRoute,
  type CraftHistory,
  type CraftLocation,
  type CraftMatch,
} from './host/craft-router-runtime';
export {
  CRAFT_COMPILED_ROUTES,
  CRAFT_HISTORY,
  CRAFT_LOCATION,
  CRAFT_MATCH,
  CRAFT_ROUTER,
  type CraftNavigationExtras,
  type CraftRouterNavigationApi,
  type CraftUrlTree,
} from './craft-router-tokens';

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

type GeneratorYield<GeneratorValue> =
  GeneratorValue extends Generator<infer Yielded, any, any> ? Yielded : never;

type CraftRouterInputWithOptionalQueryParams = {
  to: string;
  params?: Record<string, string>;
  queryParams?: Record<string, string> | null;
  fragment?: string | null;
  viewTransition?: CraftViewTransitionInput;
};

type CraftRouterInputExtras = CraftRouterInputWithOptionalQueryParams &
  CraftNavigationExtras;

// The `toCraftService` return type references internal Angular symbols
// (`SIGNAL`, `[iterator]`, `[unscopables]`) that ng-packagr cannot serialize to
// `.d.ts` (TS4023/TS4118). Cast through `unknown` and re-shape the destructured
// locals as opaque `Function` so declaration emit only sees a serializable
// shape. The exported `CraftRouter` below re-casts
// through `as unknown as ...`, so the lost typing here doesn't reach consumers.
const _routerService = toCraftService(
  {
    name: 'CraftRouter',
    scope: 'manuallyProvidedAtRoot',
    token: CRAFT_ROUTER,
    provide: provideCraftRouterRuntime,
  },
  (router): CraftRouter => router as CraftRouter,
) as unknown as {
  provideCraftRouter: Function;
  CraftRouter: Function & CraftRouterTrackedHelper;
};

type CraftRouterTrackingMetadata = ServiceTrackingMetadata<
  'CraftRouter',
  'manuallyProvidedAtRoot',
  CraftRouter,
  never,
  undefined,
  [routes: readonly CraftCompiledRoute[], ...features: unknown[]],
  false,
  false
>;

type CraftRouterTrackedHelper = {
  readonly [SERVICE_HELPER_DEPENDENCIES]?: CraftRouterTrackingMetadata;
};

const provideCraftRouterInternal = _routerService.provideCraftRouter;
const CraftRouterInternal = _routerService.CraftRouter;

// We can't reach the request type via `ReturnType<typeof CraftRouterInternal>`
// because it picks the LAST overload (`<Exposed, Yielded>(...)`), whose
// generator's yield collapses to `unknown` when the generics are unbound.
// `GetServiceYields` extracts the proper `ServiceYieldRequest<...>` (and
// `ExposureYield<...>`) union from the helper's tracked metadata directly.
export type CraftRouterYieldRequest = GetServiceYields<
  typeof CraftRouterInternal
>;

type StructuralRouteParamsField<Path extends string> = [
  PathParamNames<Path>,
] extends [never]
  ? { params?: never }
  : { params: Simplify<{ [Key in PathParamNames<Path>]: string }> };

type DerivedNavigationInput<Path extends string> = Simplify<
  { to: Path } & StructuralRouteParamsField<Path> &
    CraftNavigationExtras & {
      queryParams?: Record<string, string> | null;
    }
>;

type DerivedUrlTreeInput<Path extends string> = Simplify<
  { to: Path } & StructuralRouteParamsField<Path> &
    Omit<CraftNavigationExtras, 'state'> & {
      queryParams?: Record<string, string> | null;
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
    keyof Function | 'then' | 'createUrlTree' | 'navigate' | 'navigateByUrl'
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
    provideCraftRouterInternal(configuredRoutes),
    ...provideCraftLoading(...loadingFeatures),
  ];
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
export const CraftRouter = CraftRouterInternal as unknown as CraftRouterHelper;

type CraftRouterLinkProps = {
  readonly craftRouterLink: CraftRouterLinkInput | null | undefined;
};

/**
 * Functional Craft directive for type-safe router links.
 *
 * @example
 * a({ craftRouterLink: { to: 'tasks' } }, 'Tasks').pipe(CraftRouterLink)
 */
export const CraftRouterLink = craftNodeDirective<CraftRouterLinkProps>(
  'CraftRouterLink',
  ['craftRouterLink'],
  (context) => {
    const router = context.injector.get(CRAFT_ROUTER) as CraftRouter;
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
        context.renderer.setAttribute(context.element, 'aria-current', 'page');
      } else {
        context.renderer.removeAttribute(context.element, 'aria-current');
      }
    };

    const hrefEffect = context.injector.get(CRAFT_NODE_EFFECT_FACTORY)(
      'router-link-href',
      () => {
        const candidate = context.props.craftRouterLink;
        currentInput =
          typeof candidate === 'function'
            ? executeYieldable(
                candidate as () => CraftRouterLinkInput | null | undefined,
                [],
                context.injector,
              )
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
    );
    return () => {
      removeClickListener();
      navigation.unsubscribe();
      hrefEffect.destroy();
    };
  },
);

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
    data: ((route.data ?? match.data) ?? {}) as Data,
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
  if (
    resolved &&
    serializeLocation(resolved) !== serializeLocation(location)
  ) {
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
  ..._features: unknown[]
): Provider[] {
  const navigation: { current: CraftNavigation | null } = { current: null };
  return [
    { provide: CRAFT_COMPILED_ROUTES, useValue: routes },
    {
      provide: CRAFT_TITLE_STRATEGY,
      useFactory: () => createCraftTitleStrategy(),
    },
    {
      // The Angular island used to bridge this token onto Angular's own
      // ActivatedRoute. The Craft router owns it now: it is the leaf of the
      // snapshot built from the current match, and empty before the first one.
      provide: ActivatedRoute,
      useFactory: (match: () => CraftMatch | null): ActivatedRoute => {
        const leafOf = (snapshot: ActivatedRouteSnapshot) => {
          let node = snapshot;
          while (node.firstChild) node = node.firstChild;
          return node;
        };
        const snapshot = () => {
          const current = match();
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
      },
      deps: [CRAFT_MATCH],
    },
    {
      provide: CRAFT_HISTORY,
      useFactory: () => {
        const history = createBrowserHistory(window);
        inject(DestroyRef).onDestroy(() => history.dispose());
        return history;
      },
    },
    {
      provide: CRAFT_LOCATION,
      useFactory: (history: CraftHistory) => {
        const location = craftSignal(history.get());
        const stop = history.listen((next) => location.set(next));
        inject(DestroyRef).onDestroy(stop);
        return location;
      },
      deps: [CRAFT_HISTORY],
    },
    {
      provide: CRAFT_MATCH,
      useFactory: (
        location: CraftWritableSignal<CraftLocation>,
        compiled: readonly CraftCompiledRoute[],
        history: CraftHistory,
      ) => {
        const environmentInjector = inject(EnvironmentInjector);
        const titleStrategy =
          inject(CRAFT_TITLE_STRATEGY, { optional: true }) ??
          createCraftTitleStrategy();
        const match = craftSignal<CraftMatch | null>(null);
        let generation = 0;
        craftWatch(() => {
          const nextLocation = location();
          const current = ++generation;
          const syncMatch = matchCraftRoutes(compiled, nextLocation);
          if (typeof syncMatch?.route.redirectTo === 'function') {
            void resolveFunctionRedirectTo(syncMatch, environmentInjector)
              .then((redirectUrl) => {
                if (current !== generation || !redirectUrl) {
                  return;
                }
                const target = toAbsoluteRedirectUrl(redirectUrl);
                if (target === serializeLocation(nextLocation)) {
                  return;
                }
                history.replace(target, history.getState());
              })
              .catch(() => {
                // Keep the previous match instead of mounting the redirect route.
              });
            return;
          }
          const pendingLocation = syncMatch ?? nextLocation;
          const pending = findUnresolvedLoadChildrenRoute(
            compiled,
            splitPath(pendingLocation.pathname || '/'),
          );
          if (pending) {
            void matchCraftRoutesAsync(compiled, {
              ...nextLocation,
              pathname: pendingLocation.pathname || '/',
              search: pendingLocation.search,
              hash: pendingLocation.hash,
            }).then(
              (resolved) => {
                if (current !== generation) {
                  return;
                }
                commitCraftMatch(
                  match,
                  history,
                  nextLocation,
                  resolved,
                  titleStrategy,
                );
                navigation.current = null;
              },
              () => {
                // Keep the previous match. Inflight is cleared in
                // ensureChildrenLoaded so a later navigation can retry.
              },
            );
            return;
          }
          commitCraftMatch(
            match,
            history,
            nextLocation,
            syncMatch,
            titleStrategy,
          );
          navigation.current = null;
        });
        return match;
      },
      deps: [CRAFT_LOCATION, CRAFT_COMPILED_ROUTES, CRAFT_HISTORY],
    },
    {
      provide: CRAFT_ROUTER,
      useFactory: (
        history: CraftHistory,
        location: CraftWritableSignal<CraftLocation>,
      ) => createNativeCraftRouter(history, location, navigation),
      deps: [CRAFT_HISTORY, CRAFT_LOCATION],
    },
  ];
}

function createNativeCraftRouter(
  history: CraftHistory,
  location: CraftWritableSignal<CraftLocation>,
  navigation: { current: CraftNavigation | null },
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
    url: string,
    extras?: CraftNavigationExtras,
  ): Promise<boolean> => {
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
    serializeUrl: (tree) => tree.toString(),
    isActive: (tree, extras) => {
      const target = String(tree).split('?')[0]?.split('#')[0] ?? '';
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

/** @deprecated Moved to `@craft-ng/angular`. */
export type GenDeps_LegacyCraftRouterLink = GetDeps<{
  deps: Record<string, never>;
  provided: Record<never, never>;
  missingProvider: Record<string, never>;
}>;

/** @deprecated DI metadata belongs to `LegacyCraftRouterLink` only. */
export type GenDeps_CraftRouterLink = GenDeps_LegacyCraftRouterLink;

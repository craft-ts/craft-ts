import {
  Directive,
  Input,
  OnChanges,
  inject,
  type SimpleChanges,
} from '@angular/core';
import {
  Router,
  RouterLink,
  provideRouter,
  type NavigationBehaviorOptions,
  type NavigationExtras,
  type Params,
  type UrlCreationOptions,
  type UrlTree,
} from '@angular/router';
import {
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

type NavigableRoutePath = Exclude<RegisteredRoutePath, `${string}**${string}`>;

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

type CraftRouterAbsoluteTarget<Path extends NavigableRoutePath> = Simplify<
  {
    to: Path;
  } & RouteParamsField<Path> &
    RouteQueryParamsField<Path>
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
};

type CraftRouterInputExtras = CraftRouterInputWithOptionalQueryParams &
  NavigationExtras;

const {
  injectCraftRouter: injectCraftRouterInternal,
  provideCraftRouter,
  CraftRouterToYield: CraftRouterToYieldInternal,
} = toCraftService(
  {
    name: 'CraftRouter',
    scope: 'manuallyProvidedAtRoot',
    token: Router,
    provide: provideRouter,
  },
  (router): Router => createCraftRouter(router),
);

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
> & {
  (): Generator<
    GeneratorYield<ReturnType<typeof CraftRouterToYieldInternal>>,
    CraftRouter,
    unknown
  >;
  <Exposed extends object>(
    bindings: undefined,
    expose: (router: CraftRouter) => Exposed,
  ): Generator<
    GeneratorYield<ReturnType<typeof CraftRouterToYieldInternal>>,
    Exposed,
    unknown
  >;
};

export { provideCraftRouter };
export const injectCraftRouter =
  injectCraftRouterInternal as unknown as CraftRouterInjectHelper;
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
export class CraftRouterLink implements OnChanges {
  private readonly routerLink = inject(RouterLink, { self: true });

  @Input({ alias: 'craftRouterLink' })
  craftRouterLink: CraftRouterLinkInput | null | undefined;

  ngOnChanges(_changes: SimpleChanges): void {
    const input = this.craftRouterLink;

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
    this.routerLink.state = input.state;
    this.routerLink.info = input.info;
    this.routerLink.relativeTo = null;
    this.routerLink.ngOnChanges();
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
    state: input.state,
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
    state: input.state,
    info: input.info,
    browserUrl: input.browserUrl,
    scroll: input.scroll,
  };
}

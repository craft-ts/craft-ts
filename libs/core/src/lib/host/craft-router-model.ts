/** Types used by Craft's router, route guards, and navigation state. */

export type Data = Record<string, unknown>;

export type CraftUrlSegment = {
  path: string;
  parameters: Record<string, string>;
};

export type CraftParamMap = {
  has(name: string): boolean;
  get(name: string): string | null;
  getAll(name: string): string[];
  keys: string[];
};

/**
 * Carries the same brand as `CraftUrlTree` — and for the same reason. Without
 * it a url tree is just `{ toString(): string }`, which EVERY object satisfies,
 * so `Exclude<…, CraftGuardResult>` erased every object a guard returned and the
 * route's `GuardedData` helper silently disappeared.
 */
export type CraftRedirectTree = {
  readonly __craftUrlTree: true;
  toString(): string;
};

export type CraftGuardResult = boolean | CraftRedirectTree;

/** CraftRouteConfig params, keyed by the `:name` segments that produced them. */
export type CraftRouteParams = Record<string, string>;

export type CraftCanActivate = (
  route: CraftRouteSnapshot,
  state: CraftRouterState,
) => CraftGuardResult | Promise<CraftGuardResult>;

export type CraftCanMatch = (
  route: CraftRouteConfig,
  segments: CraftUrlSegment[],
) => CraftGuardResult | Promise<CraftGuardResult>;

/**
 * Emitted once a navigation has committed. Craft's own navigation stream
 * reports the start and completion of each navigation for trace consumers.
 */
export class CraftNavigationEnd {
  readonly id: number;
  readonly url: string;
  readonly urlAfterRedirects: string;

  constructor(id: number, url: string, urlAfterRedirects: string) {
    this.id = id;
    this.url = url;
    this.urlAfterRedirects = urlAfterRedirects;
  }
}

export type CraftRouteConfig = {
  path?: string;
  pathMatch?: 'full' | 'prefix';
  component?: unknown;
  loadComponent?: () => Promise<unknown> | unknown;
  loadChildren?: () => Promise<unknown> | unknown;
  children?: CraftRouteConfig[];
  canActivate?: unknown[];
  canMatch?: unknown[];
  canActivateChild?: unknown[];
  resolve?: Record<string, unknown>;
  data?: Data;
  // Readonly: a route's providers are an input the router only ever reads, and
  // helpers like loadCraftComponent hand back `readonly` arrays.
  providers?: readonly unknown[];
  title?: string | (() => string | Promise<string>);
  outlet?: string;
  redirectTo?: string | ((redirectData: CraftPartialRouteSnapshot) => unknown);
};

export type CraftRouteSnapshot = {
  routeConfig: CraftRouteConfig | null;
  url: CraftUrlSegment[];
  params: Record<string, string>;
  queryParams: Record<string, string>;
  fragment: string | null;
  data: Data;
  outlet: string;
  title?: string;
  paramMap: CraftParamMap;
  queryParamMap: CraftParamMap;
  parent: CraftRouteSnapshot | null;
  root: CraftRouteSnapshot;
  firstChild: CraftRouteSnapshot | null;
  children: CraftRouteSnapshot[];
  pathFromRoot: CraftRouteSnapshot[];
};

export type CraftRouterState = {
  url: string;
  root: CraftRouteSnapshot;
};

export type CraftPartialRouteSnapshot = CraftRouteSnapshot;

export type CraftRouteContext = {
  snapshot: CraftRouteSnapshot;
  pathFromRoot: CraftRouteContext[];
};


export abstract class CraftTitleStrategy {
  abstract updateTitle(snapshot: CraftRouterState): void;
  buildTitle(snapshot: CraftRouterState): string | undefined {
    let current: CraftRouteSnapshot | null = snapshot.root;
    let title: string | undefined;
    while (current) {
      if (typeof current.title === 'string') {
        title = current.title;
      }
      current = current.firstChild;
    }
    return title;
  }
}

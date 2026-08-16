export type CraftLocation = {
  pathname: string;
  search: string;
  hash: string;
};

export interface CraftHistory {
  get(): CraftLocation;
  listen(fn: (location: CraftLocation) => void): () => void;
  push(url: string): void;
  replace(url: string): void;
}

export type CraftQueryParams = Record<string, string>;

export type CraftCompiledRoute = {
  path: string;
  pathMatch?: 'full' | 'prefix';
  redirectTo?: string | ((...args: unknown[]) => unknown);
  children?: CraftCompiledRoute[];
  loadChildren?: () => Promise<readonly CraftCompiledRoute[] | unknown>;
  component?: unknown;
  loadComponent?: () => Promise<unknown> | unknown;
  data?: Record<string | symbol, unknown>;
  providers?: unknown[];
  title?: string;
  canActivate?: unknown[];
  canMatch?: unknown[];
};

export type CraftMatch = {
  pathname: string;
  search: string;
  hash: string;
  params: Record<string, string>;
  queryParams: CraftQueryParams;
  route: CraftCompiledRoute;
  routes: readonly CraftCompiledRoute[];
  data: Record<string | symbol, unknown>;
};

export function parseUrl(url: string): CraftLocation {
  const hashIndex = url.indexOf('#');
  const withoutHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : url.slice(hashIndex);
  const searchIndex = withoutHash.indexOf('?');
  const pathname =
    searchIndex === -1 ? withoutHash : withoutHash.slice(0, searchIndex);
  const search = searchIndex === -1 ? '' : withoutHash.slice(searchIndex);
  return {
    pathname: pathname || '/',
    search,
    hash,
  };
}

export function serializeLocation(location: CraftLocation): string {
  return `${location.pathname}${location.search}${location.hash}`;
}

export function parseSearchParams(search: string): CraftQueryParams {
  const params: CraftQueryParams = {};
  const raw = search.startsWith('?') ? search.slice(1) : search;
  if (!raw) {
    return params;
  }
  for (const pair of raw.split('&')) {
    if (!pair) {
      continue;
    }
    const eq = pair.indexOf('=');
    const key = decodeURIComponent(eq === -1 ? pair : pair.slice(0, eq));
    const value = decodeURIComponent(eq === -1 ? '' : pair.slice(eq + 1));
    params[key] = value;
  }
  return params;
}

export function serializeSearchParams(params: CraftQueryParams): string {
  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== null && value !== '',
  );
  if (entries.length === 0) {
    return '';
  }
  return `?${entries
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join('&')}`;
}

export function readWindowLocation(win: Window): CraftLocation {
  return {
    pathname: win.location.pathname || '/',
    search: win.location.search,
    hash: win.location.hash,
  };
}

export function createBrowserHistory(win: Window): CraftHistory {
  const listeners = new Set<(location: CraftLocation) => void>();

  const notify = (): void => {
    const location = readWindowLocation(win);
    for (const listener of listeners) {
      listener(location);
    }
  };

  const onPopState = (): void => {
    notify();
  };
  win.addEventListener('popstate', onPopState);

  return {
    get: () => readWindowLocation(win),
    listen(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    push(url) {
      win.history.pushState(win.history.state, '', url);
      notify();
    },
    replace(url) {
      win.history.replaceState(win.history.state, '', url);
      notify();
    },
  };
}

export function createMemoryHistory(initialUrl = '/'): CraftHistory {
  let current = parseUrl(initialUrl);
  const listeners = new Set<(location: CraftLocation) => void>();

  const notify = (): void => {
    for (const listener of listeners) {
      listener(current);
    }
  };

  return {
    get: () => current,
    listen(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    push(url) {
      current = parseUrl(url);
      notify();
    },
    replace(url) {
      current = parseUrl(url);
      notify();
    },
  };
}

export function splitPath(pathname: string): string[] {
  return pathname.split('/').filter(Boolean);
}

function splitRoutePath(path: string): string[] {
  if (path === '**') {
    return ['**'];
  }
  return path.split('/').filter((segment) => segment.length > 0);
}

function isOptionalParam(segment: string): boolean {
  return segment.startsWith(':') && segment.endsWith('?');
}

function paramName(segment: string): string {
  return segment.slice(1).replace(/\?$/, '');
}

type SegmentMatch = {
  consumed: number;
  params: Record<string, string>;
} | null;

function matchSegments(
  routePath: string,
  remaining: readonly string[],
  pathMatch: 'full' | 'prefix' = 'prefix',
): SegmentMatch {
  if (routePath === '**') {
    return { consumed: remaining.length, params: {} };
  }

  const segments = splitRoutePath(routePath);
  const params: Record<string, string> = {};
  let index = 0;

  for (const segment of segments) {
    if (segment === '**') {
      return { consumed: remaining.length, params };
    }
    if (isOptionalParam(segment)) {
      if (index < remaining.length) {
        params[paramName(segment)] = remaining[index];
        index += 1;
      }
      continue;
    }
    if (index >= remaining.length) {
      return null;
    }
    if (segment.startsWith(':')) {
      params[paramName(segment)] = remaining[index];
      index += 1;
      continue;
    }
    if (segment !== remaining[index]) {
      return null;
    }
    index += 1;
  }

  if (pathMatch === 'full' && index !== remaining.length) {
    return null;
  }

  return { consumed: index, params };
}

function mergeData(
  routes: readonly CraftCompiledRoute[],
): Record<string | symbol, unknown> {
  const data: Record<string | symbol, unknown> = {};
  for (const route of routes) {
    if (!route.data) {
      continue;
    }
    Object.assign(data, route.data);
  }
  return data;
}

function matchRouteList(
  routes: readonly CraftCompiledRoute[],
  remaining: readonly string[],
  ancestors: readonly CraftCompiledRoute[],
  params: Record<string, string>,
  location: CraftLocation,
): CraftMatch | null {
  for (const route of routes) {
    const pathMatch =
      route.pathMatch ??
      (route.path === '' && !route.children ? 'full' : 'prefix');
    const segmentMatch = matchSegments(route.path, remaining, pathMatch);
    if (!segmentMatch) {
      continue;
    }

    const nextRemaining = remaining.slice(segmentMatch.consumed);
    const nextParams = { ...params, ...segmentMatch.params };
    const chain = [...ancestors, route];

    if (route.children && route.children.length > 0) {
      const childMatch = matchRouteList(
        route.children,
        nextRemaining,
        chain,
        nextParams,
        location,
      );
      if (childMatch) {
        return childMatch;
      }
      if (nextRemaining.length > 0) {
        continue;
      }
    }

    if (nextRemaining.length > 0 && route.path !== '**') {
      continue;
    }

    return {
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      params: nextParams,
      queryParams: parseSearchParams(location.search),
      route,
      routes: chain,
      data: mergeData(chain),
    };
  }

  return null;
}

export function matchCraftRoutes(
  routes: unknown,
  location: CraftLocation,
): CraftMatch | null {
  if (!Array.isArray(routes)) {
    return null;
  }
  const pathname = location.pathname || '/';
  return matchRouteList(
    routes as CraftCompiledRoute[],
    splitPath(pathname),
    [],
    {},
    { ...location, pathname },
  );
}

function hasUnresolvedLoadChildren(route: CraftCompiledRoute): boolean {
  return (
    typeof route.loadChildren === 'function' &&
    !(route.children && route.children.length > 0)
  );
}

export function findUnresolvedLoadChildrenRoute(
  routes: readonly CraftCompiledRoute[],
  remaining: readonly string[],
): CraftCompiledRoute | null {
  for (const route of routes) {
    const pathMatch =
      route.pathMatch ??
      (route.path === '' && !route.children && !route.loadChildren
        ? 'full'
        : 'prefix');
    const segmentMatch = matchSegments(route.path, remaining, pathMatch);
    if (!segmentMatch) {
      continue;
    }

    const nextRemaining = remaining.slice(segmentMatch.consumed);

    if (route.children && route.children.length > 0) {
      const nested = findUnresolvedLoadChildrenRoute(
        route.children,
        nextRemaining,
      );
      if (nested) {
        return nested;
      }
    }

    if (
      hasUnresolvedLoadChildren(route) &&
      (nextRemaining.length > 0 || route.component === undefined)
    ) {
      return route;
    }
  }

  return null;
}

function normalizeLoadedChildren(loaded: unknown): CraftCompiledRoute[] {
  if (Array.isArray(loaded)) {
    return loaded as CraftCompiledRoute[];
  }
  if (
    loaded &&
    typeof loaded === 'object' &&
    'toRoutes' in loaded &&
    typeof (loaded as { toRoutes: unknown }).toRoutes === 'function'
  ) {
    return normalizeLoadedChildren(
      (loaded as { toRoutes: () => unknown }).toRoutes(),
    );
  }
  if (loaded && typeof loaded === 'object' && 'default' in loaded) {
    return normalizeLoadedChildren((loaded as { default: unknown }).default);
  }
  throw new Error(
    'loadChildren must return a craftRoutes collection or a Craft compiled route array.',
  );
}

const loadChildrenInflight = new WeakMap<CraftCompiledRoute, Promise<void>>();

async function ensureChildrenLoaded(route: CraftCompiledRoute): Promise<void> {
  if (!hasUnresolvedLoadChildren(route)) {
    return;
  }
  const existing = loadChildrenInflight.get(route);
  if (existing) {
    await existing;
    return;
  }
  const pending = Promise.resolve(route.loadChildren!()).then((loaded) => {
    route.children = normalizeLoadedChildren(loaded);
    route.loadChildren = undefined;
    loadChildrenInflight.delete(route);
  });
  loadChildrenInflight.set(route, pending);
  await pending;
}

export async function matchCraftRoutesAsync(
  routes: unknown,
  location: CraftLocation,
): Promise<CraftMatch | null> {
  if (!Array.isArray(routes)) {
    return null;
  }
  const compiled = routes as CraftCompiledRoute[];
  const pathname = location.pathname || '/';
  const normalized = { ...location, pathname };

  for (;;) {
    const pending = findUnresolvedLoadChildrenRoute(
      compiled,
      splitPath(pathname),
    );
    if (!pending) {
      return matchCraftRoutes(compiled, normalized);
    }
    await ensureChildrenLoaded(pending);
  }
}

export function buildPathFromTemplate(
  template: string,
  params?: Record<string, string>,
): string {
  if (template === '' || template === '/') {
    return '/';
  }
  const segments = template
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      if (!segment.startsWith(':')) {
        return segment;
      }
      const name = paramName(segment);
      const value = params?.[name];
      if (value === undefined) {
        if (isOptionalParam(segment)) {
          return null;
        }
        throw new Error(
          `Missing route param "${name}" for route "${template}".`,
        );
      }
      return value;
    });
  return `/${segments.filter((segment): segment is string => segment !== null).join('/')}`;
}

export function createUrlFromParts(
  pathname: string,
  queryParams?: Record<string, string | undefined> | null,
  fragment?: string | null,
): string {
  const search = serializeSearchParams(
    Object.fromEntries(
      Object.entries(queryParams ?? {}).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === 'string' && entry[1].length > 0,
      ),
    ),
  );
  const hash = fragment
    ? fragment.startsWith('#')
      ? fragment
      : `#${fragment}`
    : '';
  return `${pathname}${search}${hash}`;
}

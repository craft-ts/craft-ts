import { craftToken } from './host/craft-injector';
import {
  createBrowserHistory,
  createMemoryHistory,
  type CraftHistory,
} from './host/craft-router-runtime';
import type { SsrMode } from './craft-ssr';

export type CraftPlatformKind = 'browser' | 'server';

export type CraftStorage = Pick<
  Storage,
  'clear' | 'getItem' | 'key' | 'removeItem' | 'setItem'
> & { readonly length: number };

export type CraftPlatform = Readonly<{
  kind: CraftPlatformKind;
  /** True only during the first client pass over server-rendered DOM. */
  hydrating: boolean;
  document?: Document;
  window?: Window;
  history: CraftHistory;
  localStorage: CraftStorage;
  sessionStorage: CraftStorage;
  requestSignal?: AbortSignal;
  serverResources?: CraftServerResourceController;
  now(): number;
  randomUUID(): string;
  listen(
    target: EventTarget,
    event: string,
    handler: EventListener,
  ): () => void;
}>;

export type CraftServerResourceController = Readonly<{
  defer(source: string, start: () => void): void;
  decide(source: string, mode: SsrMode): void;
}>;

export const CRAFT_PLATFORM = craftToken<CraftPlatform>('CraftPlatform');

export function createMemoryStorage(): CraftStorage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

export function createBrowserPlatform(
  win: Window,
  options: Readonly<{ hydrating?: boolean }> = {},
): CraftPlatform {
  return {
    kind: 'browser',
    hydrating: options.hydrating ?? false,
    document: win.document,
    window: win,
    history: createBrowserHistory(win),
    localStorage: win.localStorage,
    sessionStorage: win.sessionStorage,
    now: () => win.performance.now(),
    randomUUID: () => win.crypto.randomUUID(),
    listen: (target, event, handler) => {
      target.addEventListener(event, handler);
      return () => target.removeEventListener(event, handler);
    },
  };
}

export function createServerPlatform(
  options: Readonly<{
    url?: string;
    document?: Document;
    signal?: AbortSignal;
  }> = {},
): CraftPlatform {
  const localStorage = createMemoryStorage();
  const sessionStorage = createMemoryStorage();
  const serverResources = createServerResourceController();
  const history = createMemoryHistory(options.url ?? '/');
  const window = createServerWindow(
    history,
    options.document,
    localStorage,
    sessionStorage,
  );
  return {
    kind: 'server',
    hydrating: false,
    document: options.document,
    window,
    history,
    localStorage,
    sessionStorage,
    requestSignal: options.signal,
    serverResources,
    now: () => globalThis.performance?.now?.() ?? Date.now(),
    randomUUID: () =>
      globalThis.crypto?.randomUUID?.() ??
      // Runtime correlation IDs may still need a value on older Node releases;
      // hydration identities never use this API.
      `server-${Date.now().toString(36)}`,
    listen: () => () => undefined,
  };
}

function createServerWindow(
  craftHistory: CraftHistory,
  document: Document | undefined,
  localStorage: CraftStorage,
  sessionStorage: CraftStorage,
): Window {
  const currentUrl = () => {
    const location = craftHistory.get();
    return new URL(
      `${location.pathname}${location.search}${location.hash}`,
      'http://localhost',
    );
  };
  const location = {
    get href() {
      return currentUrl().href;
    },
    get origin() {
      return currentUrl().origin;
    },
    get protocol() {
      return currentUrl().protocol;
    },
    get host() {
      return currentUrl().host;
    },
    get hostname() {
      return currentUrl().hostname;
    },
    get port() {
      return currentUrl().port;
    },
    get pathname() {
      return currentUrl().pathname;
    },
    get search() {
      return currentUrl().search;
    },
    get hash() {
      return currentUrl().hash;
    },
    assign: (url: string | URL) => craftHistory.push(String(url)),
    replace: (url: string | URL) => craftHistory.replace(String(url)),
    reload: () => undefined,
  };
  const history = {
    get length() {
      return 1;
    },
    get state() {
      return craftHistory.getState();
    },
    back: () => undefined,
    forward: () => undefined,
    go: () => undefined,
    pushState: (data: unknown, _unused: string, url?: string | URL | null) =>
      craftHistory.push(
        url === undefined || url === null ? location.href : String(url),
        data,
      ),
    replaceState: (data: unknown, _unused: string, url?: string | URL | null) =>
      craftHistory.replace(
        url === undefined || url === null ? location.href : String(url),
        data,
      ),
  };
  return {
    document,
    location,
    history,
    localStorage,
    sessionStorage,
    performance: globalThis.performance,
    crypto: globalThis.crypto,
    navigator: {
      userAgent: 'CraftTS Server',
      language: 'en',
      languages: ['en'],
      onLine: true,
      cookieEnabled: false,
      sendBeacon: () => false,
      share: async () => undefined,
    },
    innerWidth: 0,
    innerHeight: 0,
    scrollX: 0,
    scrollY: 0,
    scrollTo: () => undefined,
    alert: () => undefined,
    confirm: () => false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown as Window;
}

function createServerResourceController(): CraftServerResourceController {
  const deferred = new Map<string, Set<() => void>>();
  const blocking = new Set<string>();
  const scheduled = new Set<() => void>();

  const schedule = (start: () => void) => {
    if (scheduled.has(start)) return;
    scheduled.add(start);
    queueMicrotask(() => {
      scheduled.delete(start);
      start();
    });
  };

  return {
    defer(source, start) {
      if (blocking.has(source)) {
        schedule(start);
        return;
      }
      let starts = deferred.get(source);
      if (!starts) {
        starts = new Set();
        deferred.set(source, starts);
      }
      starts.add(start);
    },
    decide(source, mode) {
      if (mode !== 'block') return;
      blocking.add(source);
      const starts = deferred.get(source);
      if (!starts) return;
      deferred.delete(source);
      for (const start of starts) schedule(start);
    },
  };
}

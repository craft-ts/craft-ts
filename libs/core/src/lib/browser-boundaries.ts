import {
  craftService,
  type CraftServiceApi,
  type GetServiceYields,
  type ServiceTrackingMetadata,
  ɵHOST_TAG_LIST,
  ɵTRACK_TAGS_LIST,
} from './craft-service';
import { type TrackTag } from './host-tag';
import {
  CORRELATION_ID_SERVICE,
  getCurrentStartCorrelationId,
  type CorrelationIdMetadata,
} from './correlation-id';
import { SERVICE_YIELD_REQUEST_MARKER } from './craft-generator-runtime';
import type { Injector } from './host/craft-compat';

type AnyBrowserBoundaryMethod = (...args: any[]) => any;
type ConsoleMetadataMethod = 'debug' | 'info' | 'log' | 'warn' | 'error';

type MethodArgs<Method> = Method extends (...args: infer Args) => any
  ? Args
  : never;

type MethodResult<Method> = Method extends (...args: any[]) => infer Result
  ? Result
  : never;

type BrowserBoundaryDsl<Service extends object, Yielded = unknown> = {
  [Key in keyof Service]: Service[Key] extends (
    ...args: infer Args
  ) => infer Result
    ? (...args: Args) => Generator<Yielded, Result, unknown>
    : never;
};

type BrowserBoundary<Service extends object> = (
  bindings?: undefined,
  expose?: (service: Service) => unknown,
) => Generator<any, any, any>;

type BrowserBoundaryService<Name extends string, Output> = CraftServiceApi<
  Name,
  'global',
  {},
  Output,
  ServiceTrackingMetadata<Name, 'global', Output, never, undefined, never, true>
>;

type ConsoleMetaContext = {
  from: readonly string[];
  tags: readonly TrackTag[];
  correlation: CorrelationIdMetadata;
};

type ConsoleMetaYield = Readonly<{
  [SERVICE_YIELD_REQUEST_MARKER]: true;
  scope: 'function';
  resolve: (injector: Injector) => ConsoleMetaContext;
}>;

type ConsoleBoundaryYield =
  | GetServiceYields<
      BrowserBoundaryService<
        'ConsoleService',
        ConsoleServiceApi
      >['ConsoleService']
    >
  | ConsoleMetaYield;

type BrowserCryptoYield = GetServiceYields<
  BrowserBoundaryService<
    'BrowserCryptoService',
    BrowserCryptoServiceApi
  >['BrowserCryptoService']
>;

type StorageLike = Pick<
  Storage,
  'clear' | 'getItem' | 'key' | 'removeItem' | 'setItem'
> & {
  readonly length: number;
};

export type CookieSameSite = 'lax' | 'strict' | 'none';

export type CookieSetOptions = {
  domain?: string;
  expires?: Date | string;
  maxAge?: number;
  partitioned?: boolean;
  path?: string;
  sameSite?: CookieSameSite;
  secure?: boolean;
};

export type CookieRemoveOptions = Omit<CookieSetOptions, 'expires' | 'maxAge'>;

export interface ConsoleServiceApi {
  debug(...data: unknown[]): void;
  info(...data: unknown[]): void;
  log(...data: unknown[]): void;
  warn(...data: unknown[]): void;
  error(...data: unknown[]): void;
  trace(...data: unknown[]): void;
  group(...label: unknown[]): void;
  groupCollapsed(...label: unknown[]): void;
  groupEnd(): void;
  time(label?: string): void;
  timeEnd(label?: string): void;
}

export interface StorageServiceApi {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  key(index: number): string | null;
  length(): number;
}

export interface CookiesServiceApi {
  get(name: string): string | undefined;
  getAll(): Record<string, string>;
  set(name: string, value: string, options?: CookieSetOptions): void;
  remove(name: string, options?: CookieRemoveOptions): void;
  has(name: string): boolean;
}

export interface BrowserLocationServiceApi {
  href(): string;
  origin(): string;
  protocol(): string;
  host(): string;
  hostname(): string;
  port(): string;
  pathname(): string;
  search(): string;
  hash(): string;
  assign(url: string | URL): void;
  replace(url: string | URL): void;
  reload(): void;
}

export interface BrowserHistoryServiceApi {
  length(): number;
  state(): any;
  back(): void;
  forward(): void;
  go(delta?: number): void;
  pushState(data: any, unused: string, url?: string | URL | null): void;
  replaceState(data: any, unused: string, url?: string | URL | null): void;
}

export interface BrowserNavigatorServiceApi {
  userAgent(): string;
  language(): string;
  languages(): readonly string[];
  onLine(): boolean;
  cookieEnabled(): boolean;
  sendBeacon(url: string | URL, data?: BodyInit | null): boolean;
  share(data?: ShareData): Promise<void>;
}

export interface BrowserPerformanceServiceApi {
  now(): number;
  mark(name: string, options?: PerformanceMarkOptions): PerformanceMark;
  measure(
    measureName: string,
    startOrMeasureOptions?: string | PerformanceMeasureOptions,
    endMark?: string,
  ): PerformanceMeasure;
  clearMarks(markName?: string): void;
  clearMeasures(measureName?: string): void;
}

export interface BrowserCryptoServiceApi {
  randomUUID(): string;
  getRandomValues<TypedArray extends ArrayBufferView>(
    typedArray: TypedArray,
  ): TypedArray;
  digest(
    algorithm: AlgorithmIdentifier,
    data: BufferSource,
  ): Promise<ArrayBuffer>;
}

export interface BrowserDocumentServiceApi {
  title(): string;
  setTitle(value: string): void;
  lang(): string;
  setLang(value: string): void;
  dir(): 'ltr' | 'rtl' | 'auto' | '';
  setDir(value: 'ltr' | 'rtl' | 'auto' | ''): void;
  visibilityState(): DocumentVisibilityState;
  hasFocus(): boolean;
}

export interface BrowserWindowServiceApi {
  innerWidth(): number;
  innerHeight(): number;
  scrollX(): number;
  scrollY(): number;
  scrollTo(...args: [options: ScrollToOptions] | [x: number, y: number]): void;
  alert(message?: string): void;
  confirm(message?: string): boolean;
}

function createBoundaryCall<
  Service extends object,
  ServiceHelper extends BrowserBoundary<Service> = BrowserBoundary<Service>,
>(serviceHelper: ServiceHelper) {
  type Yielded = GetServiceYields<ServiceHelper>;

  return function <Key extends keyof Service & string>(key: Key) {
    return function* (
      ...args: MethodArgs<Service[Key]>
    ): Generator<Yielded, MethodResult<Service[Key]>, unknown> {
      const exposed = (yield* serviceHelper(undefined, (service) => ({
        method: service[key],
      }))) as {
        method: Service[Key];
      };

      return (exposed.method as AnyBrowserBoundaryMethod)(
        ...args,
      ) as MethodResult<Service[Key]>;
    };
  };
}

const CONSOLE_INTERNAL_FRAME_PATTERNS = [
  'runCraftGenerator',
  'executeGeneratorCompatibleFactory',
  'runInInjectionContext',
  'createConsoleCall',
  'Object.log',
  'Object.info',
  'Object.debug',
  'Object.warn',
  'Object.error',
  'Object.trace',
];

function parseConsoleStackTrace(stack: string | undefined): string {
  if (!stack) return '';

  const lines = stack.split('\n');

  const filtered = lines
    .slice(1) // remove the "Error" header line
    .filter(
      (line) =>
        !CONSOLE_INTERNAL_FRAME_PATTERNS.some((pattern) =>
          line.includes(pattern),
        ),
    );

  return filtered.join('\n');
}

type ConsoleBrowserInfo = {
  userAgent: string;
  language: string;
  languages: readonly string[];
  onLine: boolean;
  platform: string | undefined;
  screen: { width: number; height: number } | undefined;
};

function getConsoleBrowserInfo(): ConsoleBrowserInfo | undefined {
  const nav = globalThis.navigator;
  if (!nav) return undefined;

  const scr = globalThis.screen;

  return {
    userAgent: nav.userAgent,
    language: nav.language,
    languages: nav.languages,
    onLine: nav.onLine,
    platform:
      'platform' in nav ? (nav as { platform?: string }).platform : undefined,
    screen: scr ? { width: scr.width, height: scr.height } : undefined,
  };
}

function createConsoleCall<Key extends ConsoleMetadataMethod>(key: Key) {
  return function* (
    ...args: MethodArgs<ConsoleServiceApi[Key]>
  ): Generator<
    ConsoleBoundaryYield,
    MethodResult<ConsoleServiceApi[Key]>,
    unknown
  > {
    const consoleService = yield* ConsoleService();
    const {
      from,
      tags,
      correlation: correlationMeta,
    } = (yield {
      [SERVICE_YIELD_REQUEST_MARKER]: true,
      scope: 'function' as const,
      resolve: (injector: Injector): ConsoleMetaContext => ({
        from: injector.get(ɵHOST_TAG_LIST),
        tags: injector.get(ɵTRACK_TAGS_LIST),
        correlation: {
          lastCorrelationId:
            injector.get(CORRELATION_ID_SERVICE, null)?.lastCorrelationId() ??
            null,
          mayCorrelatedIds:
            injector.get(CORRELATION_ID_SERVICE, null)?.mayCorrelatedIds() ??
            [],
          startCorrelationId: getCurrentStartCorrelationId(),
        },
      }),
    } satisfies ConsoleMetaYield) as unknown as ConsoleMetaContext;

    const metadata: {
      from: readonly string[];
      tags: readonly TrackTag[];
      trace: string;
      correlationId: CorrelationIdMetadata;
      timestamp: string;
      route: string;
      browser?: ConsoleBrowserInfo;
    } = {
      from,
      tags,
      trace: parseConsoleStackTrace(new Error().stack),
      correlationId: correlationMeta,
      timestamp: new Date().toUTCString(),
      route: globalThis.window?.location?.href ?? '',
    };

    if (key === 'error') {
      metadata.browser = getConsoleBrowserInfo();
    }

    return (consoleService[key] as AnyBrowserBoundaryMethod)(
      ...args,
      metadata,
    ) as MethodResult<ConsoleServiceApi[Key]>;
  };
}

function requireBrowserValue<Value>(
  value: Value | null | undefined,
  name: string,
): Value {
  if (value === undefined || value === null) {
    throw new Error(
      `Browser boundary "${name}" is not available outside a browser environment.`,
    );
  }

  return value;
}

function getBrowserWindow() {
  return requireBrowserValue(globalThis.window, 'window');
}

function getBrowserDocument() {
  return requireBrowserValue(globalThis.document, 'document');
}

/** @internal Angular TitleStrategy writes the document title through the same boundary as `BrowserDocument.setTitle`. */
export function ɵapplyBrowserDocumentTitle(value: string): void {
  getBrowserDocument().title = value;
}

function createInMemoryStorage(): StorageLike {
  const values = new Map<string, string>();

  return {
    clear: () => {
      values.clear();
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
    get length() {
      return values.size;
    },
  };
}

function getBrowserStorage(
  name: 'localStorage' | 'sessionStorage',
): StorageLike {
  const browserWindow = getBrowserWindow() as unknown as Window &
    Record<string | symbol, unknown>;
  const candidate = browserWindow[name] as Partial<StorageLike> | undefined;

  if (
    candidate &&
    typeof candidate.getItem === 'function' &&
    typeof candidate.setItem === 'function' &&
    typeof candidate.removeItem === 'function' &&
    typeof candidate.clear === 'function' &&
    typeof candidate.key === 'function' &&
    typeof candidate.length === 'number'
  ) {
    return candidate as StorageLike;
  }

  const fallbackKey = Symbol.for(`craft.browser-boundary.${name}`);

  if (!(fallbackKey in browserWindow)) {
    Object.defineProperty(browserWindow, fallbackKey, {
      value: createInMemoryStorage(),
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }

  return browserWindow[fallbackKey] as StorageLike;
}

function getBrowserLocalStorage() {
  return getBrowserStorage('localStorage');
}

function getBrowserSessionStorage() {
  return getBrowserStorage('sessionStorage');
}

function getBrowserLocation() {
  return requireBrowserValue(getBrowserWindow().location, 'location');
}

function getBrowserHistory() {
  return requireBrowserValue(getBrowserWindow().history, 'history');
}

function getBrowserNavigator() {
  return requireBrowserValue(getBrowserWindow().navigator, 'navigator');
}

function getBrowserPerformance() {
  return requireBrowserValue(getBrowserWindow().performance, 'performance');
}

function getBrowserCrypto() {
  return requireBrowserValue(getBrowserWindow().crypto, 'crypto');
}

function decodeCookieComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function readCookieEntries(): Array<[string, string]> {
  const rawCookie = getBrowserDocument().cookie;

  if (!rawCookie) {
    return [];
  }

  return rawCookie
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separatorIndex = part.indexOf('=');
      const rawName =
        separatorIndex === -1 ? part : part.slice(0, separatorIndex);
      const rawValue =
        separatorIndex === -1 ? '' : part.slice(separatorIndex + 1);

      return [
        decodeCookieComponent(rawName),
        decodeCookieComponent(rawValue),
      ] as const;
    });
}

function buildCookieMap() {
  return Object.fromEntries(readCookieEntries()) as Record<string, string>;
}

function formatCookieSameSite(value: CookieSameSite) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function writeCookie(name: string, value: string, options?: CookieSetOptions) {
  const segments = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];

  if (options?.domain) {
    segments.push(`Domain=${options.domain}`);
  }

  if (options?.expires) {
    segments.push(
      `Expires=${
        options.expires instanceof Date
          ? options.expires.toUTCString()
          : options.expires
      }`,
    );
  }

  if (options?.maxAge !== undefined) {
    segments.push(`Max-Age=${options.maxAge}`);
  }

  if (options?.path) {
    segments.push(`Path=${options.path}`);
  }

  if (options?.sameSite) {
    segments.push(`SameSite=${formatCookieSameSite(options.sameSite)}`);
  }

  if (options?.secure) {
    segments.push('Secure');
  }

  if (options?.partitioned) {
    segments.push('Partitioned');
  }

  getBrowserDocument().cookie = segments.join('; ');
}

function removeCookie(name: string, options?: CookieRemoveOptions) {
  writeCookie(name, '', {
    ...options,
    expires: new Date(0),
    maxAge: 0,
    path: options?.path ?? '/',
  });
}

const consoleService: BrowserBoundaryService<
  'ConsoleService',
  ConsoleServiceApi
> = craftService(
  {
    name: 'ConsoleService',
    scope: 'global',
    browserBoundary: true,
  },
  (): ConsoleServiceApi => ({
    debug: (...data) => globalThis.console.debug(...data),
    info: (...data) => globalThis.console.info(...data),
    log: (...data) => globalThis.console.log(...data),
    warn: (...data) => globalThis.console.warn(...data),
    error: (...data) => globalThis.console.error(...data),
    trace: (...data) => globalThis.console.trace(...data),
    group: (...label) => globalThis.console.group(...label),
    groupCollapsed: (...label) => globalThis.console.groupCollapsed(...label),
    groupEnd: () => globalThis.console.groupEnd(),
    time: (label) => globalThis.console.time(label),
    timeEnd: (label) => globalThis.console.timeEnd(label),
  }),
);
export const ConsoleService: BrowserBoundaryService<
  'ConsoleService',
  ConsoleServiceApi
>['ConsoleService'] = consoleService.ConsoleService;
export const CONSOLE_SERVICE_META_DATA: BrowserBoundaryService<
  'ConsoleService',
  ConsoleServiceApi
>['CONSOLE_SERVICE_META_DATA'] = consoleService.CONSOLE_SERVICE_META_DATA;

const localStorageService: BrowserBoundaryService<
  'LocalStorageService',
  StorageServiceApi
> = craftService(
  {
    name: 'LocalStorageService',
    scope: 'global',
    browserBoundary: true,
  },
  (): StorageServiceApi => ({
    getItem: (key) => getBrowserLocalStorage().getItem(key),
    setItem: (key, value) => getBrowserLocalStorage().setItem(key, value),
    removeItem: (key) => getBrowserLocalStorage().removeItem(key),
    clear: () => getBrowserLocalStorage().clear(),
    key: (index) => getBrowserLocalStorage().key(index),
    length: () => getBrowserLocalStorage().length,
  }),
);
export const LocalStorageService: BrowserBoundaryService<
  'LocalStorageService',
  StorageServiceApi
>['LocalStorageService'] = localStorageService.LocalStorageService;
export const LOCAL_STORAGE_SERVICE_META_DATA: BrowserBoundaryService<
  'LocalStorageService',
  StorageServiceApi
>['LOCAL_STORAGE_SERVICE_META_DATA'] =
  localStorageService.LOCAL_STORAGE_SERVICE_META_DATA;

const sessionStorageService: BrowserBoundaryService<
  'SessionStorageService',
  StorageServiceApi
> = craftService(
  {
    name: 'SessionStorageService',
    scope: 'global',
    browserBoundary: true,
  },
  (): StorageServiceApi => ({
    getItem: (key) => getBrowserSessionStorage().getItem(key),
    setItem: (key, value) => getBrowserSessionStorage().setItem(key, value),
    removeItem: (key) => getBrowserSessionStorage().removeItem(key),
    clear: () => getBrowserSessionStorage().clear(),
    key: (index) => getBrowserSessionStorage().key(index),
    length: () => getBrowserSessionStorage().length,
  }),
);
export const SessionStorageService: BrowserBoundaryService<
  'SessionStorageService',
  StorageServiceApi
>['SessionStorageService'] = sessionStorageService.SessionStorageService;
export const SESSION_STORAGE_SERVICE_META_DATA: BrowserBoundaryService<
  'SessionStorageService',
  StorageServiceApi
>['SESSION_STORAGE_SERVICE_META_DATA'] =
  sessionStorageService.SESSION_STORAGE_SERVICE_META_DATA;

const cookiesService: BrowserBoundaryService<
  'CookiesService',
  CookiesServiceApi
> = craftService(
  {
    name: 'CookiesService',
    scope: 'global',
    browserBoundary: true,
  },
  (): CookiesServiceApi => ({
    get: (name) => buildCookieMap()[name],
    getAll: () => buildCookieMap(),
    set: (name, value, options) => writeCookie(name, value, options),
    remove: (name, options) => removeCookie(name, options),
    has: (name) => Object.prototype.hasOwnProperty.call(buildCookieMap(), name),
  }),
);
export const CookiesService: BrowserBoundaryService<
  'CookiesService',
  CookiesServiceApi
>['CookiesService'] = cookiesService.CookiesService;
export const COOKIES_SERVICE_META_DATA: BrowserBoundaryService<
  'CookiesService',
  CookiesServiceApi
>['COOKIES_SERVICE_META_DATA'] = cookiesService.COOKIES_SERVICE_META_DATA;

const browserLocationService: BrowserBoundaryService<
  'BrowserLocationService',
  BrowserLocationServiceApi
> = craftService(
  {
    name: 'BrowserLocationService',
    scope: 'global',
    browserBoundary: true,
  },
  (): BrowserLocationServiceApi => ({
    href: () => getBrowserLocation().href,
    origin: () => getBrowserLocation().origin,
    protocol: () => getBrowserLocation().protocol,
    host: () => getBrowserLocation().host,
    hostname: () => getBrowserLocation().hostname,
    port: () => getBrowserLocation().port,
    pathname: () => getBrowserLocation().pathname,
    search: () => getBrowserLocation().search,
    hash: () => getBrowserLocation().hash,
    assign: (url) => getBrowserLocation().assign(url),
    replace: (url) => getBrowserLocation().replace(url),
    reload: () => getBrowserLocation().reload(),
  }),
);
export const BrowserLocationService: BrowserBoundaryService<
  'BrowserLocationService',
  BrowserLocationServiceApi
>['BrowserLocationService'] = browserLocationService.BrowserLocationService;
export const BROWSER_LOCATION_SERVICE_META_DATA: BrowserBoundaryService<
  'BrowserLocationService',
  BrowserLocationServiceApi
>['BROWSER_LOCATION_SERVICE_META_DATA'] =
  browserLocationService.BROWSER_LOCATION_SERVICE_META_DATA;

const browserHistoryService: BrowserBoundaryService<
  'BrowserHistoryService',
  BrowserHistoryServiceApi
> = craftService(
  {
    name: 'BrowserHistoryService',
    scope: 'global',
    browserBoundary: true,
  },
  (): BrowserHistoryServiceApi => ({
    length: () => getBrowserHistory().length,
    state: () => getBrowserHistory().state,
    back: () => getBrowserHistory().back(),
    forward: () => getBrowserHistory().forward(),
    go: (delta) => getBrowserHistory().go(delta),
    pushState: (data, unused, url) =>
      getBrowserHistory().pushState(data, unused, url),
    replaceState: (data, unused, url) =>
      getBrowserHistory().replaceState(data, unused, url),
  }),
);
export const BrowserHistoryService: BrowserBoundaryService<
  'BrowserHistoryService',
  BrowserHistoryServiceApi
>['BrowserHistoryService'] = browserHistoryService.BrowserHistoryService;
export const BROWSER_HISTORY_SERVICE_META_DATA: BrowserBoundaryService<
  'BrowserHistoryService',
  BrowserHistoryServiceApi
>['BROWSER_HISTORY_SERVICE_META_DATA'] =
  browserHistoryService.BROWSER_HISTORY_SERVICE_META_DATA;

const browserNavigatorService: BrowserBoundaryService<
  'BrowserNavigatorService',
  BrowserNavigatorServiceApi
> = craftService(
  {
    name: 'BrowserNavigatorService',
    scope: 'global',
    browserBoundary: true,
  },
  (): BrowserNavigatorServiceApi => ({
    userAgent: () => getBrowserNavigator().userAgent,
    language: () => getBrowserNavigator().language,
    languages: () => getBrowserNavigator().languages,
    onLine: () => getBrowserNavigator().onLine,
    cookieEnabled: () => getBrowserNavigator().cookieEnabled,
    sendBeacon: (url, data) => getBrowserNavigator().sendBeacon(url, data),
    share: (data) => getBrowserNavigator().share(data),
  }),
);
export const BrowserNavigatorService: BrowserBoundaryService<
  'BrowserNavigatorService',
  BrowserNavigatorServiceApi
>['BrowserNavigatorService'] = browserNavigatorService.BrowserNavigatorService;
export const BROWSER_NAVIGATOR_SERVICE_META_DATA: BrowserBoundaryService<
  'BrowserNavigatorService',
  BrowserNavigatorServiceApi
>['BROWSER_NAVIGATOR_SERVICE_META_DATA'] =
  browserNavigatorService.BROWSER_NAVIGATOR_SERVICE_META_DATA;

const browserPerformanceService: BrowserBoundaryService<
  'BrowserPerformanceService',
  BrowserPerformanceServiceApi
> = craftService(
  {
    name: 'BrowserPerformanceService',
    scope: 'global',
    browserBoundary: true,
  },
  (): BrowserPerformanceServiceApi => ({
    now: () => getBrowserPerformance().now(),
    mark: (name, options) => getBrowserPerformance().mark(name, options),
    measure: (measureName, startOrMeasureOptions, endMark) => {
      if (endMark !== undefined) {
        return getBrowserPerformance().measure(
          measureName,
          startOrMeasureOptions as string,
          endMark,
        );
      }

      if (startOrMeasureOptions !== undefined) {
        return getBrowserPerformance().measure(
          measureName,
          startOrMeasureOptions as string | PerformanceMeasureOptions,
        );
      }

      return getBrowserPerformance().measure(measureName);
    },
    clearMarks: (markName) => getBrowserPerformance().clearMarks(markName),
    clearMeasures: (measureName) =>
      getBrowserPerformance().clearMeasures(measureName),
  }),
);
export const BrowserPerformanceService: BrowserBoundaryService<
  'BrowserPerformanceService',
  BrowserPerformanceServiceApi
>['BrowserPerformanceService'] =
  browserPerformanceService.BrowserPerformanceService;
export const BROWSER_PERFORMANCE_SERVICE_META_DATA: BrowserBoundaryService<
  'BrowserPerformanceService',
  BrowserPerformanceServiceApi
>['BROWSER_PERFORMANCE_SERVICE_META_DATA'] =
  browserPerformanceService.BROWSER_PERFORMANCE_SERVICE_META_DATA;

const browserCryptoService: BrowserBoundaryService<
  'BrowserCryptoService',
  BrowserCryptoServiceApi
> = craftService(
  {
    name: 'BrowserCryptoService',
    scope: 'global',
    browserBoundary: true,
  },
  (): BrowserCryptoServiceApi => ({
    randomUUID: () => getBrowserCrypto().randomUUID(),
    getRandomValues: <TypedArray extends ArrayBufferView>(
      typedArray: TypedArray,
      // lib.dom narrowed getRandomValues to ArrayBufferView<ArrayBuffer>; the
      // boundary stays open to any view and hands it through unchanged.
    ) =>
      (
        getBrowserCrypto().getRandomValues as (view: ArrayBufferView) => ArrayBufferView
      )(typedArray) as TypedArray,
    digest: (algorithm, data) =>
      getBrowserCrypto().subtle.digest(algorithm, data),
  }),
);
export const BrowserCryptoService: BrowserBoundaryService<
  'BrowserCryptoService',
  BrowserCryptoServiceApi
>['BrowserCryptoService'] = browserCryptoService.BrowserCryptoService;
export const BROWSER_CRYPTO_SERVICE_META_DATA: BrowserBoundaryService<
  'BrowserCryptoService',
  BrowserCryptoServiceApi
>['BROWSER_CRYPTO_SERVICE_META_DATA'] =
  browserCryptoService.BROWSER_CRYPTO_SERVICE_META_DATA;

const browserDocumentService: BrowserBoundaryService<
  'BrowserDocumentService',
  BrowserDocumentServiceApi
> = craftService(
  {
    name: 'BrowserDocumentService',
    scope: 'global',
    browserBoundary: true,
  },
  (): BrowserDocumentServiceApi => ({
    title: () => getBrowserDocument().title,
    setTitle: (value) => {
      ɵapplyBrowserDocumentTitle(value);
    },
    lang: () => getBrowserDocument().documentElement.lang,
    setLang: (value) => {
      getBrowserDocument().documentElement.lang = value;
    },
    dir: () =>
      (getBrowserDocument().documentElement.getAttribute('dir') ?? '') as
        | 'ltr'
        | 'rtl'
        | 'auto'
        | '',
    setDir: (value) => {
      const el = getBrowserDocument().documentElement;
      if (value) {
        el.setAttribute('dir', value);
      } else {
        el.removeAttribute('dir');
      }
    },
    visibilityState: () => getBrowserDocument().visibilityState,
    hasFocus: () => getBrowserDocument().hasFocus(),
  }),
);
export const BrowserDocumentService: BrowserBoundaryService<
  'BrowserDocumentService',
  BrowserDocumentServiceApi
>['BrowserDocumentService'] = browserDocumentService.BrowserDocumentService;
export const BROWSER_DOCUMENT_SERVICE_META_DATA: BrowserBoundaryService<
  'BrowserDocumentService',
  BrowserDocumentServiceApi
>['BROWSER_DOCUMENT_SERVICE_META_DATA'] =
  browserDocumentService.BROWSER_DOCUMENT_SERVICE_META_DATA;

const browserWindowService: BrowserBoundaryService<
  'BrowserWindowService',
  BrowserWindowServiceApi
> = craftService(
  {
    name: 'BrowserWindowService',
    scope: 'global',
    browserBoundary: true,
  },
  (): BrowserWindowServiceApi => ({
    innerWidth: () => getBrowserWindow().innerWidth,
    innerHeight: () => getBrowserWindow().innerHeight,
    scrollX: () => getBrowserWindow().scrollX,
    scrollY: () => getBrowserWindow().scrollY,
    scrollTo: (...args) => {
      if (args.length === 1) {
        getBrowserWindow().scrollTo(args[0]);
        return;
      }

      getBrowserWindow().scrollTo(args[0], args[1]);
    },
    alert: (message) => getBrowserWindow().alert(message),
    confirm: (message) => getBrowserWindow().confirm(message),
  }),
);
export const BrowserWindowService: BrowserBoundaryService<
  'BrowserWindowService',
  BrowserWindowServiceApi
>['BrowserWindowService'] = browserWindowService.BrowserWindowService;
export const BROWSER_WINDOW_SERVICE_META_DATA: BrowserBoundaryService<
  'BrowserWindowService',
  BrowserWindowServiceApi
>['BROWSER_WINDOW_SERVICE_META_DATA'] =
  browserWindowService.BROWSER_WINDOW_SERVICE_META_DATA;

const callRawConsole = createBoundaryCall<
  ConsoleServiceApi,
  typeof ConsoleService
>(ConsoleService);
const callLocalStorage = createBoundaryCall<
  StorageServiceApi,
  typeof LocalStorageService
>(LocalStorageService);
const callSessionStorage = createBoundaryCall<
  StorageServiceApi,
  typeof SessionStorageService
>(SessionStorageService);
const callCookies = createBoundaryCall<
  CookiesServiceApi,
  typeof CookiesService
>(CookiesService);
const callBrowserLocation = createBoundaryCall<
  BrowserLocationServiceApi,
  typeof BrowserLocationService
>(BrowserLocationService);
const callBrowserHistory = createBoundaryCall<
  BrowserHistoryServiceApi,
  typeof BrowserHistoryService
>(BrowserHistoryService);
const callBrowserNavigator = createBoundaryCall<
  BrowserNavigatorServiceApi,
  typeof BrowserNavigatorService
>(BrowserNavigatorService);
const callBrowserPerformance = createBoundaryCall<
  BrowserPerformanceServiceApi,
  typeof BrowserPerformanceService
>(BrowserPerformanceService);
const callBrowserCrypto = createBoundaryCall<
  BrowserCryptoServiceApi,
  typeof BrowserCryptoService
>(BrowserCryptoService);
const callBrowserDocument = createBoundaryCall<
  BrowserDocumentServiceApi,
  typeof BrowserDocumentService
>(BrowserDocumentService);
const callBrowserWindow = createBoundaryCall<
  BrowserWindowServiceApi,
  typeof BrowserWindowService
>(BrowserWindowService);

export const Console: BrowserBoundaryDsl<
  ConsoleServiceApi,
  ConsoleBoundaryYield
> = {
  debug: createConsoleCall('debug'),
  info: createConsoleCall('info'),
  log: createConsoleCall('log'),
  warn: createConsoleCall('warn'),
  error: createConsoleCall('error'),
  trace: callRawConsole('trace'),
  group: callRawConsole('group'),
  groupCollapsed: callRawConsole('groupCollapsed'),
  groupEnd: callRawConsole('groupEnd'),
  time: callRawConsole('time'),
  timeEnd: callRawConsole('timeEnd'),
};

export const LocalStorage: BrowserBoundaryDsl<
  StorageServiceApi,
  GetServiceYields<typeof LocalStorageService>
> = {
  getItem: callLocalStorage('getItem'),
  setItem: callLocalStorage('setItem'),
  removeItem: callLocalStorage('removeItem'),
  clear: callLocalStorage('clear'),
  key: callLocalStorage('key'),
  length: callLocalStorage('length'),
};

export const SessionStorage: BrowserBoundaryDsl<
  StorageServiceApi,
  GetServiceYields<typeof SessionStorageService>
> = {
  getItem: callSessionStorage('getItem'),
  setItem: callSessionStorage('setItem'),
  removeItem: callSessionStorage('removeItem'),
  clear: callSessionStorage('clear'),
  key: callSessionStorage('key'),
  length: callSessionStorage('length'),
};

export const Cookies: BrowserBoundaryDsl<
  CookiesServiceApi,
  GetServiceYields<typeof CookiesService>
> = {
  get: callCookies('get'),
  getAll: callCookies('getAll'),
  set: callCookies('set'),
  remove: callCookies('remove'),
  has: callCookies('has'),
};

export const BrowserLocation: BrowserBoundaryDsl<
  BrowserLocationServiceApi,
  GetServiceYields<typeof BrowserLocationService>
> = {
  href: callBrowserLocation('href'),
  origin: callBrowserLocation('origin'),
  protocol: callBrowserLocation('protocol'),
  host: callBrowserLocation('host'),
  hostname: callBrowserLocation('hostname'),
  port: callBrowserLocation('port'),
  pathname: callBrowserLocation('pathname'),
  search: callBrowserLocation('search'),
  hash: callBrowserLocation('hash'),
  assign: callBrowserLocation('assign'),
  replace: callBrowserLocation('replace'),
  reload: callBrowserLocation('reload'),
};

export const BrowserHistory: BrowserBoundaryDsl<
  BrowserHistoryServiceApi,
  GetServiceYields<typeof BrowserHistoryService>
> = {
  length: callBrowserHistory('length'),
  state: callBrowserHistory('state'),
  back: callBrowserHistory('back'),
  forward: callBrowserHistory('forward'),
  go: callBrowserHistory('go'),
  pushState: callBrowserHistory('pushState'),
  replaceState: callBrowserHistory('replaceState'),
};

export const BrowserNavigator: BrowserBoundaryDsl<
  BrowserNavigatorServiceApi,
  GetServiceYields<typeof BrowserNavigatorService>
> = {
  userAgent: callBrowserNavigator('userAgent'),
  language: callBrowserNavigator('language'),
  languages: callBrowserNavigator('languages'),
  onLine: callBrowserNavigator('onLine'),
  cookieEnabled: callBrowserNavigator('cookieEnabled'),
  sendBeacon: callBrowserNavigator('sendBeacon'),
  share: callBrowserNavigator('share'),
};

export const BrowserPerformance: BrowserBoundaryDsl<
  BrowserPerformanceServiceApi,
  GetServiceYields<typeof BrowserPerformanceService>
> = {
  now: callBrowserPerformance('now'),
  mark: callBrowserPerformance('mark'),
  measure: callBrowserPerformance('measure'),
  clearMarks: callBrowserPerformance('clearMarks'),
  clearMeasures: callBrowserPerformance('clearMeasures'),
};

export const BrowserCrypto: BrowserBoundaryDsl<
  BrowserCryptoServiceApi,
  BrowserCryptoYield
> = {
  randomUUID: callBrowserCrypto('randomUUID'),
  getRandomValues: function* <TypedArray extends ArrayBufferView>(
    typedArray: TypedArray,
  ): Generator<BrowserCryptoYield, TypedArray, unknown> {
    const cryptoService = yield* BrowserCryptoService();

    return cryptoService.getRandomValues(typedArray);
  },
  digest: callBrowserCrypto('digest'),
};

export const BrowserDocument: BrowserBoundaryDsl<
  BrowserDocumentServiceApi,
  GetServiceYields<typeof BrowserDocumentService>
> = {
  title: callBrowserDocument('title'),
  setTitle: callBrowserDocument('setTitle'),
  lang: callBrowserDocument('lang'),
  setLang: callBrowserDocument('setLang'),
  dir: callBrowserDocument('dir'),
  setDir: callBrowserDocument('setDir'),
  visibilityState: callBrowserDocument('visibilityState'),
  hasFocus: callBrowserDocument('hasFocus'),
};

export const BrowserWindow: BrowserBoundaryDsl<
  BrowserWindowServiceApi,
  GetServiceYields<typeof BrowserWindowService>
> = {
  innerWidth: callBrowserWindow('innerWidth'),
  innerHeight: callBrowserWindow('innerHeight'),
  scrollX: callBrowserWindow('scrollX'),
  scrollY: callBrowserWindow('scrollY'),
  scrollTo: callBrowserWindow('scrollTo'),
  alert: callBrowserWindow('alert'),
  confirm: callBrowserWindow('confirm'),
};

import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  EnvironmentInjector,
  inject,
  InjectionToken,
  signal,
  type Signal,
  type Type,
  type ValueProvider,
  type WritableSignal,
} from '@angular/core';
import {
  NavigationError,
  RedirectCommand,
  Router,
  withNavigationErrorHandler,
  type RouterFeatures,
} from '@angular/router';
import { craftException, isCraftException } from './craft-exception';
import type { CraftExceptionComponentDescriptor } from './craft-route-exceptions';
import {
  craftLoadingFeature,
  type CraftLoadingFeature,
} from './craft-pending';

export const CRAFT_ROUTE_LOAD_ERROR_CODE = 'CRAFT_ROUTE_LOAD_ERROR' as const;
export const CRAFT_ROUTE_LOAD_ERROR_PATH = '__craft/route-load-error';

export type CraftRouteLoadPhase = 'component' | 'children';

export interface CraftRouteLoadErrorPayload {
  readonly phase: CraftRouteLoadPhase;
  readonly routePath: string;
  readonly targetUrl: string;
  readonly cause: unknown;
  readonly attempt: number;
}

export type CraftRouteLoadError = ReturnType<typeof createRouteLoadError>;

export interface CraftRouteLazyLoadHelpers {
  withRetry<T>(moduleImport: Promise<T>): Promise<T>;
}

export const CRAFT_ROUTE_DYNAMIC_IMPORT = new InjectionToken<
  (url: string) => Promise<unknown>
>('CRAFT_ROUTE_DYNAMIC_IMPORT', {
  providedIn: 'root',
  factory: () => (url) => import(/* @vite-ignore */ url),
});

export interface CraftRouteLoadRetryContext {
  readonly phase: CraftRouteLoadPhase;
  readonly routePath: string;
  readonly targetUrl: string;
  readonly attempt: number;
  readonly error: unknown;
}

export interface CraftRouteLoadRetry {
  execute<T>(
    loader: () => Promise<T>,
    context: CraftRouteLoadRetryContext,
  ): Promise<T>;
}

export interface CraftRouteLoadRetryOptions {
  readonly attempts?: number;
  readonly delayMs?:
    | number
    | ((error: unknown, context: CraftRouteLoadRetryContext) => number);
  readonly shouldRetry?: (
    error: unknown,
    context: CraftRouteLoadRetryContext,
  ) => boolean | Promise<boolean>;
}

export type CraftRouteLoadRetryConfig =
  | CraftRouteLoadRetry
  | Type<CraftRouteLoadRetry>
  | CraftRouteLoadRetryOptions;

const DEFAULT_ROUTE_LOAD_RETRY_OPTIONS = {
  attempts: 1,
  delayMs: 250,
} satisfies Required<
  Pick<CraftRouteLoadRetryOptions, 'attempts' | 'delayMs'>
>;

export const CRAFT_ROUTE_LOAD_RETRY =
  new InjectionToken<CraftRouteLoadRetry>('CRAFT_ROUTE_LOAD_RETRY', {
    providedIn: 'root',
    factory: () => createRouteLoadRetry(DEFAULT_ROUTE_LOAD_RETRY_OPTIONS),
  });

export const CRAFT_ROUTE_LOAD_ERROR_COMPONENT =
  new InjectionToken<CraftExceptionComponentDescriptor | null>(
    'CRAFT_ROUTE_LOAD_ERROR_COMPONENT',
    { providedIn: 'root', factory: () => null },
  );

interface ActiveRouteLoadError {
  readonly exception: CraftRouteLoadError;
  readonly injector: EnvironmentInjector;
}

const CRAFT_ACTIVE_ROUTE_LOAD_ERROR = new InjectionToken<
  WritableSignal<ActiveRouteLoadError | null>
>('CRAFT_ACTIVE_ROUTE_LOAD_ERROR', {
  providedIn: 'root',
  factory: () => signal<ActiveRouteLoadError | null>(null),
});

export const CRAFT_ROUTE_LOAD_ERROR = new InjectionToken<
  Signal<CraftRouteLoadError | null>
>('CRAFT_ROUTE_LOAD_ERROR', {
  providedIn: 'root',
  factory: () => {
    const active = inject(CRAFT_ACTIVE_ROUTE_LOAD_ERROR);
    return computed(() => active()?.exception ?? null);
  },
});

export interface CraftRouteLoadRecovery {
  retry(): Promise<boolean>;
  reload(): void;
}

export const CRAFT_ROUTE_LOAD_RECOVERY =
  new InjectionToken<CraftRouteLoadRecovery>('CRAFT_ROUTE_LOAD_RECOVERY', {
    providedIn: 'root',
    factory: () => {
      const router = inject(Router);
      const active = inject(CRAFT_ACTIVE_ROUTE_LOAD_ERROR);
      return {
        retry: async () => {
          const targetUrl = active()?.exception.payload.targetUrl;
          return targetUrl
            ? router.navigateByUrl(targetUrl, { onSameUrlNavigation: 'reload' })
            : false;
        },
        reload: () => globalThis.location?.reload(),
      };
    },
  });

export function injectCraftRouteLoadError(): Signal<CraftRouteLoadError | null> {
  return inject(CRAFT_ROUTE_LOAD_ERROR);
}

export function injectCraftRouteLoadRecovery(): CraftRouteLoadRecovery {
  return inject(CRAFT_ROUTE_LOAD_RECOVERY);
}

export function provideRouteLoadErrorComponent(
  component: CraftExceptionComponentDescriptor,
) {
  return { provide: CRAFT_ROUTE_LOAD_ERROR_COMPONENT, useValue: component };
}

export function provideRouteLoadRetry(
  retry: CraftRouteLoadRetryConfig,
) {
  return routeLoadRetryProvider(retry);
}

export function createRouteLoadRetry(
  options: CraftRouteLoadRetryOptions = DEFAULT_ROUTE_LOAD_RETRY_OPTIONS,
): CraftRouteLoadRetry {
  const attempts = Math.max(
    1,
    Math.floor(options.attempts ?? DEFAULT_ROUTE_LOAD_RETRY_OPTIONS.attempts),
  );
  const delayMs = options.delayMs ?? DEFAULT_ROUTE_LOAD_RETRY_OPTIONS.delayMs;

  return {
    async execute<T>(
      loader: () => Promise<T>,
      baseContext: CraftRouteLoadRetryContext,
    ): Promise<T> {
      let lastError: unknown;
      let previousError = baseContext.error;
      for (let index = 0; index < attempts; index++) {
        const context = {
          ...baseContext,
          attempt: baseContext.attempt + index + 1,
          error: previousError,
        };
        const shouldRetry =
          options.shouldRetry?.(previousError, context) ?? true;
        if (!(await shouldRetry)) throw previousError;

        const resolvedDelayMs = Math.max(
          0,
          typeof delayMs === 'function'
            ? delayMs(previousError, context)
            : delayMs,
        );
        if (resolvedDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, resolvedDelayMs));
        }

        try {
          return await loader();
        } catch (error) {
          lastError = error;
          previousError = error;
        }
      }
      throw lastError;
    },
  };
}

function routeLoadRetryProvider(
  retry: CraftRouteLoadRetryConfig,
):
  | ValueProvider
  | {
      provide: typeof CRAFT_ROUTE_LOAD_RETRY;
      useClass: Type<CraftRouteLoadRetry>;
    } {
  if (isRouteLoadRetryType(retry)) {
    return { provide: CRAFT_ROUTE_LOAD_RETRY, useClass: retry };
  }

  return {
    provide: CRAFT_ROUTE_LOAD_RETRY,
    useValue: isRouteLoadRetry(retry) ? retry : createRouteLoadRetry(retry),
  };
}

function isRouteLoadRetry(value: CraftRouteLoadRetryConfig): value is CraftRouteLoadRetry {
  return typeof (value as CraftRouteLoadRetry).execute === 'function';
}

function isRouteLoadRetryType(
  value: CraftRouteLoadRetryConfig,
): value is Type<CraftRouteLoadRetry> {
  return typeof value === 'function';
}

export interface RouteLoadErrorFeature extends CraftLoadingFeature {
  readonly routerFeatures: readonly RouterFeatures[];
  readonly recoveryRoute: {
    readonly path: string;
    readonly component: Type<unknown>;
  };
}

export type CraftRouteLoadErrorConfig = CraftExceptionComponentDescriptor & {
  readonly retry?: CraftRouteLoadRetryConfig;
};

export function withRouteLoadError(
  config: CraftRouteLoadErrorConfig,
): RouteLoadErrorFeature {
  const providers = [
    { provide: CRAFT_ROUTE_LOAD_ERROR_COMPONENT, useValue: config },
    ...(config.retry ? [routeLoadRetryProvider(config.retry)] : []),
  ];
  const feature = craftLoadingFeature(providers) as RouteLoadErrorFeature;

  Object.assign(feature, {
    routerFeatures: [
      withNavigationErrorHandler(handleRouteLoadNavigationError),
    ],
    recoveryRoute: {
      path: CRAFT_ROUTE_LOAD_ERROR_PATH,
      component: CraftRouteLoadErrorHostComponent,
    },
  });

  return feature;
}

export function createRouteLoadError(
  payload: CraftRouteLoadErrorPayload,
) {
  return craftException(
    { code: CRAFT_ROUTE_LOAD_ERROR_CODE, scope: 'router' },
    payload,
  );
}

export function isCraftRouteLoadError(
  value: unknown,
): value is CraftRouteLoadError {
  return (
    isCraftException(value) && value.code === CRAFT_ROUTE_LOAD_ERROR_CODE
  );
}

export function loadRouteWithRetry<T>(
  loader: (helpers: CraftRouteLazyLoadHelpers) => Promise<T>,
  phase: CraftRouteLoadPhase,
  routePath: string,
): Promise<T> {
  let dependencies:
    | {
        injector: EnvironmentInjector;
        router: Router;
        retry: CraftRouteLoadRetry;
        dynamicImport: (url: string) => Promise<unknown>;
      }
    | undefined;
  try {
    dependencies = {
      injector: inject(EnvironmentInjector),
      router: inject(Router),
      retry: inject(CRAFT_ROUTE_LOAD_RETRY),
      dynamicImport: inject(CRAFT_ROUTE_DYNAMIC_IMPORT),
    };
  } catch {
    // Some consumers invoke emitted loader callbacks directly in tests. Keep
    // the original loader semantics when no Angular injection context exists.
  }

  return (async () => {
    try {
      return await loader(INITIAL_ROUTE_LOAD_HELPERS);
    } catch (firstError) {
      if (!dependencies) throw firstError;

      const context: CraftRouteLoadRetryContext = {
        phase,
        routePath,
        attempt: 1,
        error: firstError,
        targetUrl:
          dependencies.router.getCurrentNavigation()?.extractedUrl.toString() ??
          dependencies.router.url,
      };

      let attempt = 1;
      try {
        const retryLoader = () => {
          attempt++;
          return loader(createRetryRouteLoadHelpers(dependencies.dynamicImport));
        };

        return await dependencies.retry.execute(retryLoader, context);
      } catch (cause) {
        const exception = createRouteLoadError({
          ...context,
          cause,
          attempt,
        });
        Object.defineProperty(exception, 'routeInjector', {
          value: dependencies.injector,
          enumerable: false,
        });
        throw exception;
      }
    }
  })();
}

const INITIAL_ROUTE_LOAD_HELPERS: CraftRouteLazyLoadHelpers = {
  withRetry: <T>(moduleImport: Promise<T>) => moduleImport,
};

const successfulRetriedImports = new Map<string, Promise<unknown>>();
const retryImportAttempts = new Map<string, number>();

function createRetryRouteLoadHelpers(
  dynamicImport: (url: string) => Promise<unknown>,
): CraftRouteLazyLoadHelpers {
  return {
    withRetry: <T>(moduleImport: Promise<T>) =>
      retryFailedDynamicImport(moduleImport, dynamicImport),
  };
}

async function retryFailedDynamicImport<T>(
  moduleImport: Promise<T>,
  dynamicImport: (url: string) => Promise<unknown>,
): Promise<T> {
  try {
    return await moduleImport;
  } catch (error) {
    const failedUrl = failedDynamicImportUrl(error);
    if (!failedUrl) throw error;

    const baseUrl = failedUrl.href;
    const cachedRetry = successfulRetriedImports.get(baseUrl);
    if (cachedRetry) return cachedRetry as Promise<T>;

    const attempt = (retryImportAttempts.get(baseUrl) ?? 0) + 1;
    retryImportAttempts.set(baseUrl, attempt);
    failedUrl.searchParams.set('__craft_route_retry', String(attempt));

    const retriedImport = dynamicImport(failedUrl.href) as Promise<T>;
    successfulRetriedImports.set(baseUrl, retriedImport);

    try {
      return await retriedImport;
    } catch (retryError) {
      successfulRetriedImports.delete(baseUrl);
      throw retryError;
    }
  }
}

function failedDynamicImportUrl(error: unknown): URL | undefined {
  if (!(error instanceof Error)) return undefined;

  const prefix = 'Failed to fetch dynamically imported module:';
  const prefixIndex = error.message.indexOf(prefix);
  if (prefixIndex === -1) return undefined;

  try {
    const url = new URL(error.message.slice(prefixIndex + prefix.length).trim());
    const currentOrigin = globalThis.location?.origin;
    if (currentOrigin && url.origin !== currentOrigin) return undefined;
    if (!url.pathname.endsWith('.js')) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

function handleRouteLoadNavigationError(
  navigationError: NavigationError,
): RedirectCommand | void {
  if (!isCraftRouteLoadError(navigationError.error)) return;

  const exception = navigationError.error;
  const injector = (
    exception as CraftRouteLoadError & {
      readonly routeInjector?: EnvironmentInjector;
    }
  ).routeInjector;
  if (!injector) return;

  inject(CRAFT_ACTIVE_ROUTE_LOAD_ERROR).set({ exception, injector });
  const router = inject(Router);
  const targetUrl = exception.payload.targetUrl;
  return new RedirectCommand(
    router.parseUrl(`/${CRAFT_ROUTE_LOAD_ERROR_PATH}`),
    { browserUrl: targetUrl, replaceUrl: true },
  );
}

@Component({
  standalone: true,
  imports: [NgComponentOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container
      [ngComponentOutlet]="component()"
      [ngComponentOutletInjector]="componentInjector()"
    />
  `,
})
export class CraftRouteLoadErrorHostComponent {
  private readonly active = inject(CRAFT_ACTIVE_ROUTE_LOAD_ERROR);
  readonly componentInjector = signal<EnvironmentInjector | undefined>(
    this.active()?.injector,
  );
  readonly component = signal<Type<unknown> | null>(
    resolveEagerComponent(
      this.active()?.injector.get(CRAFT_ROUTE_LOAD_ERROR_COMPONENT) ?? null,
    ),
  );
}

function resolveEagerComponent(
  descriptor: CraftExceptionComponentDescriptor | null,
): Type<unknown> | null {
  if (!descriptor) return null;
  if (descriptor.component) return descriptor.component;
  throw new Error(
    'withRouteLoadError requires an eager error component because lazy loading is unavailable after a route chunk failure.',
  );
}

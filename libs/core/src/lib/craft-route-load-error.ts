import {
  computed,
  EnvironmentInjector,
  inject,
  InjectionToken,
  signal,
  type Signal,
  type Type,
  type ValueProvider,
  type WritableSignal,
} from './host/craft-compat';
import { craftException, isCraftException } from './craft-exception';
import {
  CRAFT_DYNAMIC_IMPORT,
  createCraftLoadRetry,
  createRetryLazyLoadHelpers,
  INITIAL_LAZY_LOAD_HELPERS,
  isCraftLoadRetry,
  isCraftLoadRetryType,
  type CraftLazyLoadHelpers,
  type CraftLoadRetry,
  type CraftLoadRetryConfig,
  type CraftLoadRetryContextBase,
  type CraftLoadRetryOptions,
} from './craft-load-retry';
import { craftLoadingFeature, type CraftLoadingFeature } from './craft-pending';
import type { CraftExceptionComponentDescriptor } from './craft-route-exceptions';
import { CRAFT_ROUTER } from './craft-router-tokens';
import {
  ɵtoCraftService as toCraftService,
  type SERVICE_DEPENDENCY_ACCESS_MARKER,
  type SERVICE_EXPOSURE_TOKEN_MARKER,
  type SERVICE_HELPER_DEPENDENCIES,
  type SERVICE_META_DATA_TYPE,
  type SERVICE_RUNTIME_META,
  type SERVICE_YIELD_METADATA,
  type SERVICE_YIELD_REQUEST_MARKER,
} from './craft-service';

const CRAFT_ROUTE_DYNAMIC_IMPORT_RETRY_PARAM = '__craft_route_retry';

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

/**
 * The route lazy-load helpers. Structurally identical to the generic
 * {@link CraftLazyLoadHelpers}; kept as a named alias for the public route API.
 */
export type CraftRouteLazyLoadHelpers = CraftLazyLoadHelpers;

/**
 * The route flavour of {@link CRAFT_DYNAMIC_IMPORT}. It is the **same** token
 * instance, re-exported under the historical name so existing providers keep
 * working; provisioning either overrides the dynamic import for both.
 */
export const CRAFT_ROUTE_DYNAMIC_IMPORT = CRAFT_DYNAMIC_IMPORT;

export interface CraftRouteLoadRetryContext extends CraftLoadRetryContextBase {
  readonly phase: CraftRouteLoadPhase;
  readonly routePath: string;
  readonly targetUrl: string;
}

export type CraftRouteLoadRetry = CraftLoadRetry<CraftRouteLoadRetryContext>;

export type CraftRouteLoadRetryOptions =
  CraftLoadRetryOptions<CraftRouteLoadRetryContext>;

export type CraftRouteLoadRetryConfig =
  CraftLoadRetryConfig<CraftRouteLoadRetryContext>;

export const CRAFT_ROUTE_LOAD_RETRY = new InjectionToken<CraftRouteLoadRetry>(
  'CRAFT_ROUTE_LOAD_RETRY',
  {
    providedIn: 'root',
    factory: () => createRouteLoadRetry(),
  },
);

export const CRAFT_ROUTE_LOAD_ERROR_COMPONENT =
  new InjectionToken<CraftExceptionComponentDescriptor | null>(
    'CRAFT_ROUTE_LOAD_ERROR_COMPONENT',
    { providedIn: 'root', factory: () => null },
  );

interface ActiveRouteLoadError {
  readonly exception: CraftRouteLoadError;
  readonly injector: EnvironmentInjector;
}

export const CRAFT_ACTIVE_ROUTE_LOAD_ERROR = new InjectionToken<
  WritableSignal<ActiveRouteLoadError | null>
>('CRAFT_ACTIVE_ROUTE_LOAD_ERROR', {
  providedIn: 'root',
  factory: () => signal<ActiveRouteLoadError | null>(null),
});

let craftRouteLoadErrorHostComponent: Type<unknown> | undefined;

/**
 * Installs the recovery host. `@craft-ts/component` calls this on import —
 * mounting the recovery UI needs the renderer that only it owns.
 */
export function ɵregisterCraftRouteLoadErrorHostComponent(
  component: Type<unknown>,
): void {
  craftRouteLoadErrorHostComponent = component;
}

/**
 * Without `@craft-ts/component` there is nothing that can render the recovery
 * UI, so the host is null and the outlet simply shows nothing. The error is
 * still reported through `CRAFT_ROUTE_LOAD_ERROR`.
 */
function getCraftRouteLoadErrorHostComponent(): Type<unknown> | null {
  return craftRouteLoadErrorHostComponent ?? null;
}

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
      const router = inject(CRAFT_ROUTER);
      const active = inject(CRAFT_ACTIVE_ROUTE_LOAD_ERROR);
      return {
        retry: async () => {
          const targetUrl = active()?.exception.payload.targetUrl ?? router.url;
          return targetUrl ? router.navigateByUrl(targetUrl) : false;
        },
        reload: () => globalThis.location?.reload(),
      };
    },
  });

export function setActiveCraftRouteLoadError(
  exception: CraftRouteLoadError,
  injector: EnvironmentInjector,
): void {
  injector.get(CRAFT_ACTIVE_ROUTE_LOAD_ERROR).set({ exception, injector });
}

export function injectCraftRouteLoadError(): Signal<CraftRouteLoadError | null> {
  return inject(CRAFT_ROUTE_LOAD_ERROR);
}

export function injectCraftRouteLoadRecovery(): CraftRouteLoadRecovery {
  return inject(CRAFT_ROUTE_LOAD_RECOVERY);
}

const craftRouteLoadErrorService = toCraftService({
  name: 'CraftRouteLoadError',
  scope: 'global',
  inject: injectCraftRouteLoadError,
});

const craftRouteLoadRecoveryService = toCraftService({
  name: 'CraftRouteLoadRecovery',
  scope: 'global',
  inject: injectCraftRouteLoadRecovery,
});

export const CraftRouteLoadError =
  craftRouteLoadErrorService.CraftRouteLoadError;
export const CraftRouteLoadRecovery =
  craftRouteLoadRecoveryService.CraftRouteLoadRecovery;

export function provideRouteLoadErrorComponent(
  component: CraftExceptionComponentDescriptor,
) {
  return { provide: CRAFT_ROUTE_LOAD_ERROR_COMPONENT, useValue: component };
}

export function provideRouteLoadRetry(retry: CraftRouteLoadRetryConfig) {
  return routeLoadRetryProvider(retry);
}

export function createRouteLoadRetry(
  options: CraftRouteLoadRetryOptions = {},
): CraftRouteLoadRetry {
  return createCraftLoadRetry<CraftRouteLoadRetryContext>(options);
}

function routeLoadRetryProvider(retry: CraftRouteLoadRetryConfig):
  | ValueProvider
  | {
      provide: typeof CRAFT_ROUTE_LOAD_RETRY;
      useClass: Type<CraftRouteLoadRetry>;
    } {
  if (isCraftLoadRetryType(retry)) {
    return { provide: CRAFT_ROUTE_LOAD_RETRY, useClass: retry };
  }

  return {
    provide: CRAFT_ROUTE_LOAD_RETRY,
    useValue: isCraftLoadRetry(retry) ? retry : createRouteLoadRetry(retry),
  };
}

export interface RouteLoadErrorFeature extends CraftLoadingFeature {
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
    recoveryRoute: {
      path: CRAFT_ROUTE_LOAD_ERROR_PATH,
      component: getCraftRouteLoadErrorHostComponent(),
    },
  });

  return feature;
}

export function createRouteLoadError(payload: CraftRouteLoadErrorPayload) {
  return craftException(
    { code: CRAFT_ROUTE_LOAD_ERROR_CODE, scope: 'router' },
    payload,
  );
}

export function isCraftRouteLoadError(
  value: unknown,
): value is CraftRouteLoadError {
  return isCraftException(value) && value.code === CRAFT_ROUTE_LOAD_ERROR_CODE;
}

export function loadRouteWithRetry<T>(
  loader: (helpers: CraftRouteLazyLoadHelpers) => Promise<T>,
  phase: CraftRouteLoadPhase,
  routePath: string,
): Promise<T> {
  let dependencies:
    | {
        injector: EnvironmentInjector;
        router: { readonly url: string };
        retry: CraftRouteLoadRetry;
        dynamicImport: (url: string) => Promise<unknown>;
      }
    | undefined;
  try {
    dependencies = {
      injector: inject(EnvironmentInjector),
      router: inject(CRAFT_ROUTER),
      retry: inject(CRAFT_ROUTE_LOAD_RETRY),
      dynamicImport: inject(CRAFT_DYNAMIC_IMPORT),
    };
  } catch {
    // Some consumers invoke emitted loader callbacks directly in tests. Keep
    // the original loader semantics when no Angular injection context exists.
  }

  return (async () => {
    try {
      return await loader(INITIAL_LAZY_LOAD_HELPERS);
    } catch (firstError) {
      if (!dependencies) throw firstError;

      const context: CraftRouteLoadRetryContext = {
        phase,
        routePath,
        attempt: 1,
        error: firstError,
        targetUrl: dependencies.router.url,
      };

      let attempt = 1;
      try {
        const retryHelpers = createRetryLazyLoadHelpers(
          dependencies.dynamicImport,
          CRAFT_ROUTE_DYNAMIC_IMPORT_RETRY_PARAM,
        );
        const retryLoader = () => {
          attempt++;
          return loader(retryHelpers);
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

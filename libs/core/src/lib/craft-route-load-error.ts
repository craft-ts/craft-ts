import {
  computed,
  EnvironmentInjector,
  inject,
  runInInjectionContext,
  signal,
  type Signal,
  type Type,
  type WritableSignal,
} from './host/craft-compat';
import { craftService, type CraftServiceProvider } from './craft-service';
import { craftException, isCraftException } from './craft-exception';
import {
  ɵinjectCraftDynamicImport,
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
import { ɵinjectCraftRouterRuntime } from './craft-router-tokens';

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
 * The route flavour of {@link CraftDynamicImport}; route loading uses the same
 * private service identity as imperative lazy loading.
 */
export const CraftRouteDynamicImport = ɵinjectCraftDynamicImport;

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

const craftRouteLoadRetryService = craftService(
  { name: 'CraftRouteLoadRetry', providedIn: 'toProvide' },
  (inputs: { $provided?: CraftRouteLoadRetry }) =>
    inputs.$provided ?? createRouteLoadRetry(),
) as unknown as {
  CraftRouteLoadRetry: () => Generator<unknown, CraftRouteLoadRetry, unknown>;
  provideCraftRouteLoadRetry: (value: CraftRouteLoadRetry) => CraftServiceProvider;
  CRAFT_ROUTE_LOAD_RETRY_META_DATA: { inject(): CraftRouteLoadRetry };
};
export const CraftRouteLoadRetry = craftRouteLoadRetryService.CraftRouteLoadRetry;
export const provideCraftRouteLoadRetry = (value: CraftRouteLoadRetry): CraftServiceProvider =>
  craftRouteLoadRetryService.provideCraftRouteLoadRetry(value);
export const ɵinjectCraftRouteLoadRetry = (): CraftRouteLoadRetry =>
  craftRouteLoadRetryService.CRAFT_ROUTE_LOAD_RETRY_META_DATA.inject();

const craftRouteLoadErrorComponentService = craftService(
  { name: 'CraftRouteLoadErrorConfig', providedIn: 'toProvide' },
  (inputs: { $provided?: CraftExceptionComponentDescriptor | null }) =>
    inputs.$provided ?? null,
) as unknown as {
  provideCraftRouteLoadErrorConfig: (
    value: CraftExceptionComponentDescriptor,
  ) => CraftServiceProvider;
  CRAFT_ROUTE_LOAD_ERROR_CONFIG_META_DATA: {
    inject(): CraftExceptionComponentDescriptor | null;
  };
};
export const provideCraftRouteLoadErrorConfig = (
  value: CraftExceptionComponentDescriptor,
): CraftServiceProvider => craftRouteLoadErrorComponentService.provideCraftRouteLoadErrorConfig(value);
export const ɵinjectCraftRouteLoadErrorConfig = (): CraftExceptionComponentDescriptor | null =>
  craftRouteLoadErrorComponentService.CRAFT_ROUTE_LOAD_ERROR_CONFIG_META_DATA.inject();

interface ActiveRouteLoadError {
  readonly exception: CraftRouteLoadError;
  readonly injector: EnvironmentInjector;
}

const craftActiveRouteLoadErrorService = craftService(
  { name: 'CraftActiveRouteLoadError', providedIn: 'global' },
  () => signal<ActiveRouteLoadError | null>(null),
) as unknown as {
  CRAFT_ACTIVE_ROUTE_LOAD_ERROR_META_DATA: {
    inject(): WritableSignal<ActiveRouteLoadError | null>;
  };
};
export const ɵinjectActiveCraftRouteLoadError = (): WritableSignal<ActiveRouteLoadError | null> =>
  craftActiveRouteLoadErrorService.CRAFT_ACTIVE_ROUTE_LOAD_ERROR_META_DATA.inject();

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
 * still reported through `CraftRouteLoadError`.
 */
function getCraftRouteLoadErrorHostComponent(): Type<unknown> | null {
  return craftRouteLoadErrorHostComponent ?? null;
}

const craftRouteLoadErrorService = craftService(
  { name: 'CraftRouteLoadError', providedIn: 'global' },
  () => computed(() => ɵinjectActiveCraftRouteLoadError()()?.exception ?? null),
) as unknown as {
  CraftRouteLoadError: () => Generator<unknown, Signal<CraftRouteLoadError | null>, unknown>;
  CRAFT_ROUTE_LOAD_ERROR_META_DATA: { inject(): Signal<CraftRouteLoadError | null> };
};
export const CraftRouteLoadError = craftRouteLoadErrorService.CraftRouteLoadError;
export const ɵinjectCraftRouteLoadError = (): Signal<CraftRouteLoadError | null> =>
  craftRouteLoadErrorService.CRAFT_ROUTE_LOAD_ERROR_META_DATA.inject();

export interface CraftRouteLoadRecovery {
  retry(): Promise<boolean>;
  reload(): void;
}

const craftRouteLoadRecoveryService = craftService(
  { name: 'CraftRouteLoadRecovery', providedIn: 'global' },
  () => {
    const router = ɵinjectCraftRouterRuntime();
    return {
      retry: async () => {
        const targetUrl = ɵinjectActiveCraftRouteLoadError()()?.exception.payload.targetUrl ?? router?.url;
        return targetUrl && router ? router.navigateByUrl(targetUrl) : false;
      },
      reload: () => globalThis.location?.reload(),
    } satisfies CraftRouteLoadRecovery;
  },
) as unknown as {
  CraftRouteLoadRecovery: () => Generator<unknown, CraftRouteLoadRecovery, unknown>;
  CRAFT_ROUTE_LOAD_RECOVERY_META_DATA: { inject(): CraftRouteLoadRecovery };
};
export const CraftRouteLoadRecovery = craftRouteLoadRecoveryService.CraftRouteLoadRecovery;
export const ɵinjectCraftRouteLoadRecovery = (): CraftRouteLoadRecovery =>
  craftRouteLoadRecoveryService.CRAFT_ROUTE_LOAD_RECOVERY_META_DATA.inject();

export function setActiveCraftRouteLoadError(
  exception: CraftRouteLoadError,
  injector: EnvironmentInjector,
): void {
  runInInjectionContext(injector, () =>
    ɵinjectActiveCraftRouteLoadError().set({ exception, injector }),
  );
}

export function injectCraftRouteLoadError(): Signal<CraftRouteLoadError | null> {
  return ɵinjectCraftRouteLoadError();
}

export function injectCraftRouteLoadRecovery(): CraftRouteLoadRecovery {
  return ɵinjectCraftRouteLoadRecovery();
}

export function provideRouteLoadErrorComponent(
  component: CraftExceptionComponentDescriptor,
) {
  return provideCraftRouteLoadErrorConfig(component);
}

export function provideRouteLoadRetry(retry: CraftRouteLoadRetryConfig) {
  return routeLoadRetryProvider(retry);
}

export function createRouteLoadRetry(
  options: CraftRouteLoadRetryOptions = {},
): CraftRouteLoadRetry {
  return createCraftLoadRetry<CraftRouteLoadRetryContext>(options);
}

function routeLoadRetryProvider(retry: CraftRouteLoadRetryConfig): CraftServiceProvider {
  if (isCraftLoadRetryType(retry)) {
    return provideCraftRouteLoadRetry(new retry());
  }

  return provideCraftRouteLoadRetry(
    isCraftLoadRetry(retry) ? retry : createRouteLoadRetry(retry),
  );
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
    provideCraftRouteLoadErrorConfig(config),
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
    { _tag: CRAFT_ROUTE_LOAD_ERROR_CODE, scope: 'router' },
    payload,
  );
}

export function isCraftRouteLoadError(
  value: unknown,
): value is CraftRouteLoadError {
  return isCraftException(value) && value._tag === CRAFT_ROUTE_LOAD_ERROR_CODE;
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
      router: ɵinjectCraftRouterRuntime() ?? { url: '' },
      retry: ɵinjectCraftRouteLoadRetry(),
      dynamicImport: ɵinjectCraftDynamicImport(),
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

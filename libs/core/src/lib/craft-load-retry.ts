import { inject, InjectionToken, type Type } from '@angular/core';
import {
  CRAFT_TEMPORAL_RUNTIME,
  RealCraftTemporalRuntime,
  type CraftTemporalRuntime,
} from './temporal-runtime';

// ---------------------------------------------------------------------------
// Generic lazy-load retry engine.
//
// Powers both route lazy loading (`loadComponent`/`loadChildren`, see
// craft-route-load-error.ts) and imperative service lazy loading (`craftLazy`,
// see craft-lazy.ts). It provides:
//
// - `CRAFT_DYNAMIC_IMPORT` — the injectable `import(url)` used for cache-busting
//   a chunk whose first fetch failed (a stale hashed URL after a redeploy).
// - `retryFailedDynamicImport` — re-imports a failed chunk with a cache-busting
//   query param, deduplicating concurrent retries of the same URL.
// - `createCraftLoadRetry` — the attempts/delay/shouldRetry loop, generic over
//   the retry context the caller threads through its callbacks.
// - `CraftLazyLoadHelpers` — the `{ withRetry }` object handed to a loader
//   callback, plus the identity/retry-flavoured factories that build it.
// ---------------------------------------------------------------------------

/**
 * The `{ withRetry }` helpers handed to a lazy loader callback. `withRetry`
 * wraps a dynamic `import(...)` so a chunk whose hashed URL went stale after a
 * redeploy is re-fetched with a cache-busting query param. On the very first
 * attempt it is the identity function; the retry engine swaps in the
 * cache-busting variant for subsequent attempts.
 */
export interface CraftLazyLoadHelpers {
  withRetry<T>(moduleImport: Promise<T>): Promise<T>;
}

/**
 * The injectable dynamic `import(url)`. Overridable in tests to observe the
 * cache-busting URL {@link retryFailedDynamicImport} computes.
 */
export const CRAFT_DYNAMIC_IMPORT = new InjectionToken<
  (url: string) => Promise<unknown>
>('CRAFT_DYNAMIC_IMPORT', {
  providedIn: 'root',
  factory: () => (url) => import(/* @vite-ignore */ url),
});

/** The base fields the retry loop itself reads and advances on every attempt. */
export interface CraftLoadRetryContextBase {
  readonly attempt: number;
  readonly error: unknown;
}

export interface CraftLoadRetry<
  Context extends CraftLoadRetryContextBase = CraftLoadRetryContextBase,
> {
  execute<T>(loader: () => Promise<T>, context: Context): Promise<T>;
}

export interface CraftLoadRetryOptions<
  Context extends CraftLoadRetryContextBase = CraftLoadRetryContextBase,
> {
  readonly attempts?: number;
  readonly delayMs?: number | ((error: unknown, context: Context) => number);
  readonly shouldRetry?: (
    error: unknown,
    context: Context,
  ) => boolean | Promise<boolean>;
  /** Optional clock seam, primarily useful for deterministic tests. */
  readonly temporalRuntime?: CraftTemporalRuntime;
}

export type CraftLoadRetryConfig<
  Context extends CraftLoadRetryContextBase = CraftLoadRetryContextBase,
> =
  | CraftLoadRetry<Context>
  | Type<CraftLoadRetry<Context>>
  | CraftLoadRetryOptions<Context>;

export const DEFAULT_CRAFT_LOAD_RETRY_OPTIONS = {
  attempts: 1,
  delayMs: 250,
} satisfies Required<Pick<CraftLoadRetryOptions, 'attempts' | 'delayMs'>>;

/**
 * Builds the attempts/delay/shouldRetry loop shared by every craft lazy load.
 * `execute` re-invokes `loader` up to `attempts` times, threading the caller's
 * `Context` (only `attempt` and `error` are advanced by the engine — the rest is
 * spread through unchanged) into the `delayMs`/`shouldRetry` callbacks. On final
 * exhaustion it rethrows the last raw failure (callers wrap it into a domain
 * `craftException` — a route load error or a `craftLazy` load error).
 */
export function createCraftLoadRetry<
  Context extends CraftLoadRetryContextBase = CraftLoadRetryContextBase,
>(options: CraftLoadRetryOptions<Context> = {}): CraftLoadRetry<Context> {
  const attempts = Math.max(
    1,
    Math.floor(options.attempts ?? DEFAULT_CRAFT_LOAD_RETRY_OPTIONS.attempts),
  );
  const delayMs = options.delayMs ?? DEFAULT_CRAFT_LOAD_RETRY_OPTIONS.delayMs;
  const temporalRuntime =
    options.temporalRuntime ??
    tryInjectTemporalRuntime() ??
    new RealCraftTemporalRuntime();

  return {
    async execute<T>(
      loader: () => Promise<T>,
      baseContext: Context,
    ): Promise<T> {
      let lastError: unknown;
      let previousError = baseContext.error;
      for (let index = 0; index < attempts; index++) {
        const context = {
          ...baseContext,
          attempt: baseContext.attempt + index + 1,
          error: previousError,
        } as Context;
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
          await temporalRuntime.sleep(resolvedDelayMs, {
            kind: 'retry',
            owner: 'craft-load-retry',
          });
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

function tryInjectTemporalRuntime(): CraftTemporalRuntime | undefined {
  try {
    return inject(CRAFT_TEMPORAL_RUNTIME, { optional: true }) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * The retry policy `craftLazy` applies to an imperative lazy import. Defaults to
 * the shared attempts/delay loop; override it to tune attempts, back-off, or
 * `shouldRetry` for `craftLazy` loads specifically.
 */
export const CRAFT_LAZY_LOAD_RETRY = new InjectionToken<CraftLoadRetry>(
  'CRAFT_LAZY_LOAD_RETRY',
  { providedIn: 'root', factory: () => createCraftLoadRetry() },
);

export function provideCraftLazyLoadRetry(
  retry: CraftLoadRetryConfig,
):
  | { provide: typeof CRAFT_LAZY_LOAD_RETRY; useValue: CraftLoadRetry }
  | { provide: typeof CRAFT_LAZY_LOAD_RETRY; useClass: Type<CraftLoadRetry> } {
  if (isCraftLoadRetryType(retry)) {
    return { provide: CRAFT_LAZY_LOAD_RETRY, useClass: retry };
  }
  return {
    provide: CRAFT_LAZY_LOAD_RETRY,
    useValue: isCraftLoadRetry(retry) ? retry : createCraftLoadRetry(retry),
  };
}

export function isCraftLoadRetry<Context extends CraftLoadRetryContextBase>(
  value: CraftLoadRetryConfig<Context>,
): value is CraftLoadRetry<Context> {
  return typeof (value as CraftLoadRetry<Context>).execute === 'function';
}

export function isCraftLoadRetryType<Context extends CraftLoadRetryContextBase>(
  value: CraftLoadRetryConfig<Context>,
): value is Type<CraftLoadRetry<Context>> {
  return typeof value === 'function';
}

/** The identity helpers used for the first (un-busted) load attempt. */
export const INITIAL_LAZY_LOAD_HELPERS: CraftLazyLoadHelpers = {
  withRetry: <T>(moduleImport: Promise<T>) => moduleImport,
};

/**
 * Helpers whose `withRetry` re-fetches a failed chunk with a cache-busting
 * query param, used for every attempt after the first.
 */
export function createRetryLazyLoadHelpers(
  dynamicImport: (url: string) => Promise<unknown>,
  retryParam = DEFAULT_RETRY_PARAM,
): CraftLazyLoadHelpers {
  return {
    withRetry: <T>(moduleImport: Promise<T>) =>
      retryFailedDynamicImport(moduleImport, dynamicImport, retryParam),
  };
}

const DEFAULT_RETRY_PARAM = '__craft_retry';

const successfulRetriedImports = new Map<string, Promise<unknown>>();
const retryImportAttempts = new Map<string, number>();

/**
 * Awaits `moduleImport`; if it fails because a dynamically-imported chunk could
 * not be fetched (a stale hashed URL after a redeploy), re-imports the same URL
 * with an incrementing cache-busting query param. Concurrent retries of the same
 * URL share a single in-flight import.
 */
export async function retryFailedDynamicImport<T>(
  moduleImport: Promise<T>,
  dynamicImport: (url: string) => Promise<unknown>,
  retryParam = DEFAULT_RETRY_PARAM,
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
    failedUrl.searchParams.set(retryParam, String(attempt));

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
    const url = new URL(
      error.message.slice(prefixIndex + prefix.length).trim(),
    );
    const currentOrigin = globalThis.location?.origin;
    if (currentOrigin && url.origin !== currentOrigin) return undefined;
    if (!url.pathname.endsWith('.js')) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

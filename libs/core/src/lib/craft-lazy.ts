import { inject } from './host/craft-compat';
import { craftException } from './craft-exception';
import { craftGen, type CraftGenInvocation } from './craft-gen';
import {
  GUARD_AWAIT_REQUEST_MARKER,
  type RuntimeGuardAwaitRequest,
} from './craft-generator-runtime';
import {
  createRetryLazyLoadHelpers,
  CRAFT_DYNAMIC_IMPORT,
  CRAFT_LAZY_LOAD_RETRY,
  INITIAL_LAZY_LOAD_HELPERS,
  type CraftLazyLoadHelpers,
  type CraftLoadRetry,
} from './craft-load-retry';

export const CRAFT_LAZY_LOAD_ERROR_CODE = 'CRAFT_LAZY_LOAD_ERROR' as const;

export interface CraftLazyLoadErrorPayload {
  readonly cause: unknown;
}

/** Builds the `craftException` `craftLazy` returns when an import finally fails. */
export function createCraftLazyLoadError(cause: unknown) {
  return craftException(
    { _tag: CRAFT_LAZY_LOAD_ERROR_CODE, scope: 'CraftLazy' },
    { cause } satisfies CraftLazyLoadErrorPayload,
  );
}

export type CraftLazyLoadError = ReturnType<typeof createCraftLazyLoadError>;

function guardAwaitPromise(value: PromiseLike<unknown>): RuntimeGuardAwaitRequest {
  return {
    [GUARD_AWAIT_REQUEST_MARKER]: true,
    kind: 'promise',
    value,
  } as RuntimeGuardAwaitRequest;
}

/**
 * Runs a lazy import with the shared retry engine. The first attempt uses the
 * identity helpers; on failure it re-invokes the loader up to the configured
 * attempts with cache-busting helpers. Outside an Angular injection context
 * (e.g. a hand-driven test) it degrades to a single attempt and rethrows.
 */
function injectLazyLoad(): <T>(
  load: (helpers: CraftLazyLoadHelpers) => Promise<T>,
) => Promise<T> {
  let deps:
    | { retry: CraftLoadRetry; dynamicImport: (url: string) => Promise<unknown> }
    | undefined;
  try {
    deps = {
      retry: inject(CRAFT_LAZY_LOAD_RETRY),
      dynamicImport: inject(CRAFT_DYNAMIC_IMPORT),
    };
  } catch {
    // No injection context — keep the loader's original single-attempt semantics.
  }

  return async <T>(load: (helpers: CraftLazyLoadHelpers) => Promise<T>) => {
    try {
      return await load(INITIAL_LAZY_LOAD_HELPERS);
    } catch (firstError) {
      if (!deps) throw firstError;

      const retryHelpers = createRetryLazyLoadHelpers(deps.dynamicImport);
      return deps.retry.execute(() => load(retryHelpers), {
        attempt: 1,
        error: firstError,
      });
    }
  };
}

/**
 * Lazily imports a module from inside an `asyncProcess` loader, reusing the same
 * retry/cache-busting engine as route lazy loading (`loadComponent`).
 *
 * `craftLazy(load)` is a `craftGen`-built program: `yield*`-composable inside an
 * async craft loader, `.pipe(...)`-able (so `catchTag('CRAFT_LAZY_LOAD_ERROR', …)`
 * applies directly), and it awaits the import through the async program pump. On
 * a final import failure it returns a {@link CraftLazyLoadError} `craftException`,
 * which `craftGen` surfaces as a short-circuit → the enclosing resource's
 * `status()` becomes `'exception'`.
 *
 * It must run in an async driver (an `asyncProcess` loader); it cannot be
 * `yield*`-ed from a synchronous `craftMethod`, whose driver throws on the
 * await-request. A `craftMethod` may only *trigger* the enclosing `asyncProcess`.
 *
 * @example
 * ```ts
 * const searchProcess = craftUse(asyncProcess({
 *   method: on$(prefetch$, () => undefined),
 *   loader: function* () {
 *     return yield* craftLazy(({ withRetry }) => withRetry(import('./search')));
 *   },
 * }));
 * ```
 */
export function craftLazy<T>(
  load: (helpers: CraftLazyLoadHelpers) => Promise<T>,
): CraftGenInvocation<never, T | CraftLazyLoadError> {
  const invoke = craftGen(function* (): Generator<
    RuntimeGuardAwaitRequest,
    T | CraftLazyLoadError,
    unknown
  > {
    const runLoad = injectLazyLoad();
    const settled: Promise<T | CraftLazyLoadError> = runLoad(load).then(
      (value) => value,
      (cause) => createCraftLazyLoadError(cause),
    );

    return (yield guardAwaitPromise(settled)) as T | CraftLazyLoadError;
  });

  return invoke() as unknown as CraftGenInvocation<never, T | CraftLazyLoadError>;
}

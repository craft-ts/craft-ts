import type { Injector } from '@angular/core';
import { SERVICE_TRACKED_DEPS_REQUEST_MARKER } from './craft-generator-runtime';
import type { ConcreteServiceScope } from './craft-service.shared';
import type { SERVICE_HELPER_DEPENDENCIES } from './craft-service';

/**
 * Dependency map carried by a primitive (`mutation`, `query`, `asyncProcess`,
 * `state`, `craftMethod`, `craftEffect`, …) on its phantom
 * `[SERVICE_HELPER_DEPENDENCIES]` property.
 */
export type HelperDependencyMap<Helper> = Helper extends {
  readonly [SERVICE_HELPER_DEPENDENCIES]?: infer Map extends object;
}
  ? Map
  : {};

/**
 * Request yielded by {@link track}. Type-level only: it carries the tracked
 * primitive's dependency map so the enclosing `craftService` folds it into its
 * own dependency tree. At runtime it is a no-op (see `runCraftGenerator`).
 */
export type ServiceTrackedDepsRequest<DepMap extends object = object> = Readonly<{
  [SERVICE_TRACKED_DEPS_REQUEST_MARKER]: true;
  /** Phantom carrier — never read at runtime. */
  readonly depMap?: DepMap;
  scope: ConcreteServiceScope;
  resolve: (injector: Injector, hostScope: ConcreteServiceScope) => unknown;
}>;

/**
 * Yields a primitive that carries dependencies so they are tracked by the
 * enclosing `craftService`, then returns the primitive ref unchanged.
 *
 * Any primitive used inside a `craftService` whose loaders/effects depend on
 * other services must be yielded through `track`, otherwise those dependencies
 * are invisible to `setupCraftServiceTest` and the DI checks:
 *
 * ```ts
 * const register = yield* track(
 *   mutation({
 *     method: ({ email, password }) => ({ email, password }),
 *     loader: function* ({ params }) {
 *       return yield* CraftHttpClient.post(({ response }) => ({
 *         url: '/api/auth/register',
 *         payload: params,
 *         success: response<User>(),
 *       }));
 *     },
 *   }),
 * );
 * ```
 */
export function* track<
  const T extends { readonly [SERVICE_HELPER_DEPENDENCIES]?: object },
>(
  primitive: T,
): Generator<ServiceTrackedDepsRequest<HelperDependencyMap<T>>, T, unknown> {
  yield {
    [SERVICE_TRACKED_DEPS_REQUEST_MARKER]: true,
    scope: 'global',
    resolve: () => undefined,
  } as ServiceTrackedDepsRequest<HelperDependencyMap<T>>;
  return primitive;
}

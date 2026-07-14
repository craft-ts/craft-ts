import type { Injector } from '@angular/core';
import { SERVICE_TRACKED_DEPS_REQUEST_MARKER } from './craft-generator-runtime';
import type { ConcreteServiceScope } from './craft-service.shared';
import type { SERVICE_HELPER_DEPENDENCIES } from './craft-service';

/**
 * Dependency map carried by a primitive (`mutation`, `query`, `asyncProcess`,
 * `state`, `queryParam`, …) on its phantom
 * `[SERVICE_HELPER_DEPENDENCIES]` property.
 */
export type HelperDependencyMap<Helper> = Helper extends {
  readonly [SERVICE_HELPER_DEPENDENCIES]?: infer Map extends object;
}
  ? Map
  : {};

/**
 * Request yielded by a primitive generator (see {@link CraftPrimitiveGen}).
 * Type-level only: it carries the primitive's dependency map so the enclosing
 * `craftService` folds it into its own dependency tree. At runtime it is a
 * no-op (see `runCraftGenerator`).
 */
export type ServiceTrackedDepsRequest<DepMap extends object = object> = Readonly<{
  [SERVICE_TRACKED_DEPS_REQUEST_MARKER]: true;
  /** Phantom carrier — never read at runtime. */
  readonly depMap?: DepMap;
  scope: ConcreteServiceScope;
  resolve: (injector: Injector, hostScope: ConcreteServiceScope) => unknown;
}>;

/**
 * The generator returned by the craft primitives (`state`, `query`, `mutation`,
 * `asyncProcess`, `queryParam`). Consume it with `yield*` inside a generator
 * host (a `craftService` factory, `craftGen`, …) or with `craftUse(...)` in a
 * component field:
 *
 * ```ts
 * // inside a craftService factory
 * const users = yield* query({ ... });
 *
 * // in a component field
 * readonly users = craftUse(query({ ... }));
 * ```
 *
 * Yields a single {@link ServiceTrackedDepsRequest} carrying the primitive's
 * dependency map (type-level only, no-op at runtime), then resolves to the
 * primitive ref. Like any generator it is single-use: driving it a second time
 * yields nothing and returns `undefined`.
 */
export type CraftPrimitiveGen<Ref> = Generator<
  ServiceTrackedDepsRequest<HelperDependencyMap<Ref>>,
  Ref,
  unknown
>;

const CRAFT_PRIMITIVE_GEN_MARKER = Symbol('craft-primitive-gen-marker');

/**
 * Wraps an already-created primitive ref into a {@link CraftPrimitiveGen}. The
 * ref is created eagerly by the primitive (injector captures included); the
 * generator only surfaces the dependency map to the enclosing host and hands
 * the ref back.
 */
export function createPrimitiveGen<Ref>(ref: Ref): CraftPrimitiveGen<Ref> {
  const gen = (function* () {
    yield {
      [SERVICE_TRACKED_DEPS_REQUEST_MARKER]: true,
      scope: 'global',
      resolve: () => undefined,
    } as ServiceTrackedDepsRequest<HelperDependencyMap<Ref>>;
    return ref;
  })();

  return Object.assign(gen, {
    [CRAFT_PRIMITIVE_GEN_MARKER]: true,
  }) as CraftPrimitiveGen<Ref>;
}

/**
 * `true` for a generator produced by a craft primitive (`state(...)`,
 * `query(...)`, …) that has not been consumed through `yield*` / `craftUse`.
 */
export function isCraftPrimitiveGen(
  value: unknown,
): value is CraftPrimitiveGen<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    CRAFT_PRIMITIVE_GEN_MARKER in value
  );
}

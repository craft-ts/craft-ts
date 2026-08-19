import { isSignal, type Injector, type Signal } from './host/craft-compat';
import {
  isGenerator,
  SERVICE_TRACKED_DEPS_REQUEST_MARKER,
} from './craft-generator-runtime';
import type { ConcreteServiceScope } from './craft-service.shared';
import type { SERVICE_HELPER_DEPENDENCIES } from './craft-service';
import type { CraftGenExceptionMarker } from './craft-gen';
import {
  markNamedReactiveProperties,
  markYieldableValue,
  YIELDABLE_VALUE,
} from './yieldable';
import {
  DEEP_YIELDABLE,
  type YieldableReactiveValue,
} from './reactive-read';

/**
 * Dependency map carried by a primitive (`mutation`, `query`, `asyncProcess`,
 * `state`, `queryParams`, …) on its phantom
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
export type ServiceTrackedDepsRequest<DepMap extends object = object> =
  Readonly<{
    [SERVICE_TRACKED_DEPS_REQUEST_MARKER]: true;
    /** Phantom carrier — never read at runtime. */
    readonly depMap?: DepMap;
    providedIn: ConcreteServiceScope;
    resolve: (injector: Injector, hostScope: ConcreteServiceScope) => unknown;
  }>;

/**
 * The generator returned by the craft primitives (`state`, `query`, `mutation`,
 * `asyncProcess`, `queryParams`). Consume it with `yield*` inside a generator
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
type PrimitiveExceptionUnion<Ref> = Ref extends {
  readonly exception: Signal<infer Exception>;
}
  ? Extract<Exception, { readonly _tag: string }>
  : never;

type PrimitiveExceptionMarker<Ref> = [PrimitiveExceptionUnion<Ref>] extends [
  never,
]
  ? never
  : CraftGenExceptionMarker<PrimitiveExceptionUnion<Ref>>;

/**
 * A generator's `Yielded` is an INFERRED union, and TypeScript subtype-reduces
 * those: `ServiceTrackedDepsRequest<{}>` is a supertype of every other tracked
 * request, so a primitive with no dependency would swallow the requests of every
 * primitive yielded beside it. Collapsing an empty map to `never` flips the
 * relation — the dependency-free request is now the subtype, and it is the one
 * that disappears.
 */
type EmptyDepMapToNever<DepMap> = [keyof DepMap] extends [never]
  ? never
  : DepMap;

export type CraftPrimitiveGen<Ref, ExceptionRef = Ref> = Generator<
  | ServiceTrackedDepsRequest<EmptyDepMapToNever<HelperDependencyMap<Ref>>>
  | PrimitiveExceptionMarker<ExceptionRef>,
  Ref,
  unknown
>;

/**
 * The value a named craft primitive resolves to: the primitive reference itself.
 * The name remains available for host tagging and reactive template branding,
 * but it is no longer required as an object key at the call site.
 *
 * ```ts
 * const counter = yield* state('counter', 0);
 * const userQuery = yield* query('userQuery', { ... });
 * ```
 *
 */
export type NamedPrimitive<Name extends string, Ref> = Ref extends {
  type: string;
  kind: string;
}
  ? Ref
  : Ref extends { readonly [DEEP_YIELDABLE]: true }
    ? Ref
  : Ref extends YieldableReactiveValue<infer State, any>
    ? Omit<Ref, keyof YieldableReactiveValue<State, any>> &
        YieldableReactiveValue<State, Name>
    : Ref extends Signal<any>
      ? Ref & { readonly [YIELDABLE_VALUE]: Name }
      : Ref;

/**
 * Return type of the named craft primitives: a {@link CraftPrimitiveGen}
 * resolving to the primitive reference itself (see {@link NamedPrimitive}).
 */
export type NamedCraftPrimitiveGen<
  Name extends string,
  Ref,
> = CraftPrimitiveGen<NamedPrimitive<Name, Ref>, Ref>;

type YieldRecordValue<Value> =
  Value extends Generator<any, infer Output, any> ? Output : Value;

type YieldRecordOutput<Record extends object> = {
  [Key in keyof Record]: YieldRecordValue<Record[Key]>;
};

type YieldRecordYielded<Record extends object> =
  Record[keyof Record] extends infer Value
    ? Value extends Generator<infer Yielded, any, any>
      ? Yielded
      : never
    : never;

/**
 * Resolves a record of generator-compatible values while preserving its keys.
 *
 * This is useful when a craft service exposes several primitives without
 * writing a generator only to delegate each one:
 *
 * ```ts
 * const { UserStore } = craftService(
 *   { name: 'UserStore', providedIn: 'global' },
 *   () =>
 *     craftYieldRecord({
 *       userQuery: query('userQuery', { ... }),
 *       refresh: state('refresh', 0),
 *     }),
 * );
 * ```
 *
 * Plain values are passed through unchanged. Generator values are consumed in
 * insertion order, so their tracked dependencies are visible to the enclosing
 * craft generator.
 */
export function craftYieldRecord<Record extends object>(
  record: Record,
): Generator<YieldRecordYielded<Record>, YieldRecordOutput<Record>, unknown> {
  return (function* () {
    const output = {} as YieldRecordOutput<Record>;

    for (const key of Reflect.ownKeys(record) as (keyof Record)[]) {
      const value = record[key];
      output[key] = (
        isGenerator(value) ? yield* value : value
      ) as YieldRecordValue<Record[typeof key]>;
    }

    return output;
  })() as Generator<
    YieldRecordYielded<Record>,
    YieldRecordOutput<Record>,
    unknown
  >;
}

/**
 * Surfaces a primitive ref as a {@link CraftPrimitiveGen} while retaining its
 * declared `name` for runtime tagging. Counterpart of
 * {@link createPrimitiveGen} for the named primitives (`state`, `query`,
 * `mutation`, `asyncProcess`, `queryParams`).
 */
export function createNamedPrimitiveGen<Name extends string, Ref>(
  name: Name,
  ref: Ref,
): CraftPrimitiveGen<NamedPrimitive<Name, Ref>, Ref> {
  markNamedReactiveProperties(ref);
  const namedRef = isSignal(ref) ? markYieldableValue(ref, name) : ref;
  return createPrimitiveGen(namedRef) as CraftPrimitiveGen<
    NamedPrimitive<Name, Ref>,
    Ref
  >;
}

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
      providedIn: 'global',
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

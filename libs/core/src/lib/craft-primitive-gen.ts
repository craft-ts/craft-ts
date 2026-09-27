import { isSignal, type Injector, type Signal } from './host/craft-compat';
import {
  CRAFT_EXPOSE_MARKER,
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
import { DEEP_YIELDABLE, type YieldableReactiveValue } from './reactive-read';

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
 * Request yielded by a NAMED primitive generator, beside its tracked
 * dependencies: it carries the primitive's `name` and `ref` so the enclosing
 * `craftService` exposes the ref under that name. At runtime it is the SAME
 * object as the tracked-deps request, so every driver that does not collect
 * exposures treats it as the usual no-op.
 *
 * The literal `Name` keeps two requests apart in an inferred `Yielded` union,
 * so none of them is subtype-reduced away (see `EmptyDepMapToNever`).
 */
export type CraftExposeRequest<Name extends string, Ref> = Readonly<{
  [CRAFT_EXPOSE_MARKER]: true;
  name: Name;
  ref: Ref;
}>;

/**
 * Return type of the named craft primitives: a {@link CraftPrimitiveGen}
 * resolving to the primitive reference itself (see {@link NamedPrimitive}) that
 * also yields a {@link CraftExposeRequest} — inside a `craftService`, the
 * primitive is exposed under its name unless wrapped in {@link craftPrivate}.
 */
export type NamedCraftPrimitiveGen<
  Name extends string,
  Ref,
  ExceptionRef = Ref,
> = Generator<
  | ServiceTrackedDepsRequest<
      EmptyDepMapToNever<HelperDependencyMap<NamedPrimitive<Name, Ref>>>
    >
  | PrimitiveExceptionMarker<ExceptionRef>
  | CraftExposeRequest<Name, NamedPrimitive<Name, Ref>>,
  NamedPrimitive<Name, Ref>,
  unknown
>;

/** A generator's `Yielded` union without its exposure requests. */
export type WithoutExposeRequests<Yielded> = Exclude<
  Yielded,
  CraftExposeRequest<any, any>
>;

/**
 * Keeps the primitives created by `generator` internal to the enclosing
 * `craftService`: they are still created and tracked, only not exposed.
 *
 * ```ts
 * const draft = yield* craftPrivate(state('draft', ''));
 * ```
 *
 * Works on any generator — a single primitive, or a `craftGen` helper creating
 * several of them. The generator is relayed as is (values sent back through
 * `next(...)` included); only the exposure part of each request is removed.
 */
export function craftPrivate<Yielded, Result>(
  generator: Generator<Yielded, Result, any>,
): Generator<WithoutExposeRequests<Yielded>, Result, unknown> {
  return (function* () {
    let current = generator.next();
    while (!current.done) {
      const sent: unknown = yield stripExposeRequest(
        current.value,
      ) as WithoutExposeRequests<Yielded>;
      current = generator.next(sent);
    }
    return current.value;
  })();
}

function stripExposeRequest(value: unknown): unknown {
  if (!isCraftExposeRequest(value)) return value;
  // Object rest copies own enumerable symbol keys too, so the tracked-deps
  // marker (and anything else the request carries) survives.
  const {
    [CRAFT_EXPOSE_MARKER]: _marker,
    name: _name,
    ref: _ref,
    ...rest
  } = value as CraftExposeRequest<string, unknown> &
    Record<PropertyKey, unknown>;
  return rest;
}

/** `true` for a request carrying a primitive exposure (see {@link CraftExposeRequest}). */
export function isCraftExposeRequest(
  value: unknown,
): value is CraftExposeRequest<string, unknown> {
  return (
    typeof value === 'object' && value !== null && CRAFT_EXPOSE_MARKER in value
  );
}

/**
 * Surfaces a primitive ref as a {@link NamedCraftPrimitiveGen} while retaining
 * its declared `name` for runtime tagging and service exposure. Counterpart of
 * {@link createPrimitiveGen} for the named primitives (`state`, `query`,
 * `mutation`, `asyncProcess`, `queryParams`, `craftComputed`, `craftMethod`,
 * `craftEffect`, …).
 */
export function createNamedPrimitiveGen<Name extends string, Ref>(
  name: Name,
  ref: Ref,
): NamedCraftPrimitiveGen<Name, Ref> {
  markNamedReactiveProperties(ref);
  const namedRef = isSignal(ref) ? markYieldableValue(ref, name) : ref;
  const gen = (function* () {
    // One object, two roles: the tracked-deps no-op every driver knows, and
    // the exposure a `craftService` collects.
    yield {
      [SERVICE_TRACKED_DEPS_REQUEST_MARKER]: true,
      [CRAFT_EXPOSE_MARKER]: true,
      providedIn: 'global',
      resolve: () => undefined,
      name,
      ref: namedRef,
    } as never;
    return namedRef;
  })();

  return Object.assign(gen, {
    [CRAFT_PRIMITIVE_GEN_MARKER]: true,
  }) as unknown as NamedCraftPrimitiveGen<Name, Ref>;
}

/**
 * Exposes any value on the enclosing `craftService` under `name` — for what is
 * not a named primitive: a function, a constant, a member of an injected
 * service, a primitive's insertion method.
 *
 * ```ts
 * const api = yield* UsersApi();
 * yield* craftExpose('getUsers', getUsers);
 * yield* craftExpose('setLocale', language.setLocale);
 * ```
 *
 * The value is exposed as is (no signal branding, no wrapping) and resolved
 * back, so `const x = yield* craftExpose('x', value)` keeps using it. Like any
 * named primitive, `craftPrivate(craftExpose(...))` hides it again.
 */
export function craftExpose<const Name extends string, Value>(
  name: Name,
  value: Value,
): Generator<CraftExposeRequest<Name, Value>, Value, unknown> {
  const gen = (function* () {
    yield {
      [SERVICE_TRACKED_DEPS_REQUEST_MARKER]: true,
      [CRAFT_EXPOSE_MARKER]: true,
      providedIn: 'global',
      resolve: () => undefined,
      name,
      ref: value,
    } as never;
    return value;
  })();

  return Object.assign(gen, {
    [CRAFT_PRIMITIVE_GEN_MARKER]: true,
  }) as unknown as Generator<CraftExposeRequest<Name, Value>, Value, unknown>;
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

type ExposeRequestsOf<Yielded> = Extract<
  Yielded,
  CraftExposeRequest<string, any>
>;

// A request whose name widened to `string` (a primitive named from a
// non-literal) cannot become a key: it would turn the whole API into an index
// signature. It stays exposed at runtime, just untyped.
type LiteralExposeName<Request> = Request extends CraftExposeRequest<
  infer Name,
  any
>
  ? string extends Name
    ? never
    : Name
  : never;

/**
 * The public API of a `craftService`: every named primitive its factory
 * yields, keyed by name (see {@link CraftExposeRequest}). Primitives wrapped in
 * {@link craftPrivate}, and injected services, are not part of it.
 */
export type ExposedFromYielded<Yielded> = {
  [Name in LiteralExposeName<ExposeRequestsOf<Yielded>>]: Extract<
    ExposeRequestsOf<Yielded>,
    { readonly name: Name }
  >['ref'];
};

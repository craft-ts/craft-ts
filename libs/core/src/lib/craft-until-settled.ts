import type { Signal } from './host/craft-compat';
import {
  isCraftException,
  type AnyCraftException,
  type ExtractCraftException,
} from './craft-exception';
import {
  CraftGenShortCircuit,
  ɵcreateCraftProgram,
  type CraftGenExceptionMarker,
  type CraftPipeableProgram,
} from './craft-gen';
import {
  GUARD_AWAIT_REQUEST_MARKER,
  isGenerator,
  type GuardAwaitResourceLike,
  type RuntimeGuardAwaitRequest,
} from './craft-generator-runtime';
import type { CraftHttpClientError } from './craft-http-client';
import {
  isYieldableReactiveValue,
  rawReactiveValue,
  type YieldableReactiveValue,
} from './reactive-read';

type ReactiveResourceValue<T> = Signal<T> | YieldableReactiveValue<T>;

/**
 * The minimal shape a craft resource (`query` / `mutation` / `asyncProcess`)
 * exposes that {@link craftUntilSettled} relies on: the `status`/`value` signals to
 * read the settled outcome, and the `hasException`/`exceptions` signals to surface
 * a loader `craftException`.
 *
 * `error` is the internal Angular channel: it is no longer part of the public craft
 * façade type, but the raw signal remains on the ref at runtime (spread by the
 * primitive's `Object.assign`). It is kept optional here so `craftUntilSettled` can
 * re-throw a residual technical failure while public refs still match this shape.
 */
export type ResourceLike = {
  status: ReactiveResourceValue<string>;
  value: ReactiveResourceValue<unknown>;
  error?: Signal<Error | undefined>;
  hasException: ReactiveResourceValue<boolean>;
  exceptions: ReactiveResourceValue<{ list: readonly AnyCraftException[] }>;
};

/** The union of `craftException`s a resource may carry (its loader/params exceptions). */
export type ResourceExceptionUnion<R> = R extends {
  exceptions: YieldableReactiveValue<{ list: (infer Exception)[] }>;
}
  ? Extract<Exception, AnyCraftException>
  : R extends { exceptions: Signal<{ list: (infer Exception)[] }> }
    ? Extract<Exception, AnyCraftException>
    : never;

/** The settled (non-undefined) value a resource resolves to. */
export type ResourceResolvedValue<R> = R extends {
  value: YieldableReactiveValue<infer Value>;
}
  ? Exclude<Value, undefined>
  : R extends { value: Signal<infer Value> }
    ? Exclude<Value, undefined>
    : unknown;

/** The descriptor a `CraftHttpClient.*` call generator returns. */
type HttpCallDescriptor<G> =
  G extends Generator<any, infer Descriptor, any> ? Descriptor : never;

/** The yields relayed by a `CraftHttpClient.*` call generator (its tracked request). */
type HttpCallYielded<G> =
  G extends Generator<infer Yielded, any, any> ? Yielded : never;

/** What the HTTP descriptor resolves to: `Success | CustomException | CraftHttpClientError`. */
type HttpResolved<G> = Awaited<HttpCallDescriptor<G>>;

/**
 * The business `craftException`s an HTTP call may produce, excluding the generic
 * {@link CraftHttpClientError} (which `craftUntilSettled` rethrows rather than routing
 * through the guard resolvers).
 */
type HttpCallException<G> = Exclude<
  ExtractCraftException<HttpResolved<G>>,
  CraftHttpClientError
>;

/** The success value of an HTTP call (its resolved value with every exception stripped). */
type HttpCallSuccess<G> = Exclude<HttpResolved<G>, AnyCraftException>;

function guardAwaitRequest(
  request:
    | { kind: 'settle'; resource: GuardAwaitResourceLike }
    | { kind: 'promise'; value: PromiseLike<unknown> },
): RuntimeGuardAwaitRequest {
  return {
    [GUARD_AWAIT_REQUEST_MARKER]: true,
    ...request,
  } as RuntimeGuardAwaitRequest;
}

function* craftUntilSettledResource(
  resource: ResourceLike,
): Generator<unknown, unknown, unknown> {
  const adapter = {
    status: () => readResourceValue(resource.status),
    value: () => readResourceValue(resource.value),
    error: () => resource.error?.(),
    hasException: () => readResourceValue(resource.hasException),
    exceptions: () => readResourceValue(resource.exceptions),
  } satisfies GuardAwaitResourceLike;
  yield guardAwaitRequest({
    kind: 'settle',
    resource: adapter,
  });

  if (adapter.hasException()) {
    throw new CraftGenShortCircuit(adapter.exceptions().list[0]);
  }

  if (adapter.status() === 'exception') {
    // No business `craftException` present but the status is `'exception'` — a
    // residual technical failure. Rethrow the raw Angular error (internal channel).
    throw resource.error?.();
  }

  return adapter.value();
}

function readResourceValue<T>(value: ReactiveResourceValue<T>): T {
  return isYieldableReactiveValue(value) ? rawReactiveValue(value)() : value();
}

function* craftUntilSettledHttp(
  call: Generator<unknown, unknown, unknown>,
): Generator<unknown, unknown, unknown> {
  const descriptor = yield* call;
  const resolved = yield guardAwaitRequest({
    kind: 'promise',
    value: descriptor as PromiseLike<unknown>,
  });

  if (isCraftException(resolved)) {
    if (resolved.code === 'HttpError' && resolved.scope === 'HttpClient') {
      // Generic network/transport failure — rethrow so it surfaces as a
      // navigation error rather than a resolvable business case.
      throw resolved;
    }

    // A declared business exception — route it through the guard's resolvers.
    throw new CraftGenShortCircuit(resolved);
  }

  return resolved;
}

/**
 * Suspends a composing route guard until a craft async operation settles, then
 * returns its success value. The operation's `craftException`s flow into the
 * guard's exhaustive resolvers (compiler-enforced via the yielded
 * {@link CraftGenExceptionMarker}).
 *
 * Two forms, both `yield*`-composable across the suspension:
 *
 * - **Resource** — a `query` / `mutation` / `asyncProcess` ref. Settles when its
 *   `status` reaches `'resolved'` or `'exception'`. A loader `craftException`
 *   short-circuits to the resolvers; a residual technical failure rethrows;
 *   otherwise the resolved value is returned.
 *
 *   ```ts
 *   const user = yield* craftUntilSettled(
 *     query({ params: () => true, loader: async () => fetchUser() }),
 *   );
 *   ```
 *
 * - **HTTP call** — a `CraftHttpClient.*` call generator, awaited directly (no
 *   resource needed). Its declared `exceptions` flow into the resolvers; the
 *   generic `HttpError` is rethrown.
 *
 *   ```ts
 *   const user = yield* craftUntilSettled(
 *     CraftHttpClient.get(({ response }) => ({
 *       url: `/api/users/${userId}`,
 *       success: response<User>(),
 *       exceptions: [...],
 *     })),
 *   );
 *   ```
 */
export function craftUntilSettled<R extends ResourceLike>(
  resource: R,
): CraftPipeableProgram<
  CraftGenExceptionMarker<ResourceExceptionUnion<R>>,
  ResourceResolvedValue<R>
>;
export function craftUntilSettled<G extends Generator<any, any, any>>(
  call: G,
): CraftPipeableProgram<
  HttpCallYielded<G> | CraftGenExceptionMarker<HttpCallException<G>>,
  HttpCallSuccess<G>
>;
export function craftUntilSettled(
  source: ResourceLike | Generator<unknown, unknown, unknown>,
): CraftPipeableProgram<unknown, unknown> {
  return ɵcreateCraftProgram(() =>
    isGenerator(source)
      ? craftUntilSettledHttp(source)
      : craftUntilSettledResource(source),
  ) as CraftPipeableProgram<unknown, unknown>;
}

function signalSettleAdapter<T>(signal: Signal<T>): GuardAwaitResourceLike {
  return {
    status: () => (signal() !== undefined ? 'resolved' : 'loading'),
    value: () => signal(),
    error: () => undefined,
    hasException: () => false,
    exceptions: () => ({ list: [] }),
  };
}

/**
 * Suspends a composing route guard until `signal()` is no longer `undefined`,
 * then returns its (non-nullable) value. Unlike {@link craftUntilSettled} there is no
 * exception channel — use it to wait on a plain readiness signal.
 */
export function craftUntilDefined<T>(
  signal: Signal<T>,
): CraftPipeableProgram<never, NonNullable<T>> {
  return ɵcreateCraftProgram(function* () {
    yield guardAwaitRequest({
      kind: 'settle',
      resource: signalSettleAdapter(signal),
    });

    return signal();
  }) as unknown as CraftPipeableProgram<never, NonNullable<T>>;
}

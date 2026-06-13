import type { Signal } from '@angular/core';
import {
  isCraftException,
  type AnyCraftException,
  type ExtractCraftException,
} from './craft-exception';
import {
  CraftGenShortCircuit,
  type CraftGenExceptionMarker,
} from './craft-gen';
import {
  GUARD_AWAIT_REQUEST_MARKER,
  isGenerator,
  type GuardAwaitResourceLike,
  type RuntimeGuardAwaitRequest,
} from './craft-generator-runtime';
import type { CraftHttpClientError } from './craft-http-client';

/**
 * The minimal shape a craft resource (`query` / `mutation` / `asyncProcess`)
 * exposes that {@link untilSettled} relies on: the `status`/`safeValue`/`error`
 * signals to read the settled outcome, and the `hasException`/`exceptions`
 * signals to surface a loader `craftException`.
 */
export type ResourceLike = {
  status: Signal<string>;
  safeValue: Signal<unknown>;
  error: Signal<Error | undefined>;
  hasException: Signal<boolean>;
  exceptions: Signal<{ list: readonly AnyCraftException[] }>;
};

/** The union of `craftException`s a resource may carry (its loader/params exceptions). */
export type ResourceExceptionUnion<R> = R extends {
  exceptions: Signal<{ list: (infer Exception)[] }>;
}
  ? Extract<Exception, AnyCraftException>
  : never;

/** The settled (non-undefined) value a resource resolves to. */
export type ResourceResolvedValue<R> = R extends {
  safeValue: Signal<infer Value>;
}
  ? Exclude<Value, undefined>
  : unknown;

/** The descriptor a `CraftHttpClient.*` call generator returns. */
type HttpCallDescriptor<G> = G extends Generator<any, infer Descriptor, any>
  ? Descriptor
  : never;

/** The yields relayed by a `CraftHttpClient.*` call generator (its tracked request). */
type HttpCallYielded<G> = G extends Generator<infer Yielded, any, any>
  ? Yielded
  : never;

/** What the HTTP descriptor resolves to: `Success | CustomException | CraftHttpClientError`. */
type HttpResolved<G> = Awaited<HttpCallDescriptor<G>>;

/**
 * The business `craftException`s an HTTP call may produce, excluding the generic
 * {@link CraftHttpClientError} (which `untilSettled` rethrows rather than routing
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
  return { [GUARD_AWAIT_REQUEST_MARKER]: true, ...request } as RuntimeGuardAwaitRequest;
}

function* untilSettledResource(
  resource: ResourceLike,
): Generator<unknown, unknown, unknown> {
  yield guardAwaitRequest({
    kind: 'settle',
    resource: resource as unknown as GuardAwaitResourceLike,
  });

  if (resource.hasException()) {
    throw new CraftGenShortCircuit(resource.exceptions().list[0]);
  }

  if (resource.status() === 'error') {
    throw resource.error();
  }

  return resource.safeValue();
}

function* untilSettledHttp(
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
 *   `status` reaches `'resolved'` or `'error'`. A loader `craftException`
 *   short-circuits to the resolvers; a thrown loader error rethrows; otherwise
 *   the resolved value is returned.
 *
 *   ```ts
 *   const user = yield* untilSettled(
 *     query({ params: () => true, loader: async () => fetchUser() }),
 *   );
 *   ```
 *
 * - **HTTP call** — a `CraftHttpClient.*` call generator, awaited directly (no
 *   resource needed). Its declared `exceptions` flow into the resolvers; the
 *   generic `HttpError` is rethrown.
 *
 *   ```ts
 *   const user = yield* untilSettled(
 *     CraftHttpClient.get(({ response }) => ({
 *       url: `/api/users/${userId}`,
 *       success: response<User>(),
 *       exceptions: [...],
 *     })),
 *   );
 *   ```
 */
export function untilSettled<R extends ResourceLike>(
  resource: R,
): Generator<
  CraftGenExceptionMarker<ResourceExceptionUnion<R>>,
  ResourceResolvedValue<R>,
  unknown
>;
export function untilSettled<G extends Generator<any, any, any>>(
  call: G,
): Generator<
  HttpCallYielded<G> | CraftGenExceptionMarker<HttpCallException<G>>,
  HttpCallSuccess<G>,
  unknown
>;
export function untilSettled(
  source: ResourceLike | Generator<unknown, unknown, unknown>,
): Generator<unknown, unknown, unknown> {
  return isGenerator(source)
    ? untilSettledHttp(source)
    : untilSettledResource(source);
}

function signalSettleAdapter<T>(signal: Signal<T>): GuardAwaitResourceLike {
  return {
    status: () => (signal() !== undefined ? 'resolved' : 'loading'),
    safeValue: () => signal(),
    error: () => undefined,
    hasException: () => false,
    exceptions: () => ({ list: [] }),
  };
}

/**
 * Suspends a composing route guard until `signal()` is no longer `undefined`,
 * then returns its (non-nullable) value. Unlike {@link untilSettled} there is no
 * exception channel — use it to wait on a plain readiness signal.
 */
export function untilDefined<T>(
  signal: Signal<T>,
): Generator<never, NonNullable<T>, unknown> {
  return (function* () {
    yield guardAwaitRequest({
      kind: 'settle',
      resource: signalSettleAdapter(signal),
    });

    return signal();
  })() as Generator<never, NonNullable<T>, unknown>;
}

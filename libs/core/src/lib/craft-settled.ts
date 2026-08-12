import { computed, type Signal } from '@angular/core';
import {
  CraftGenShortCircuit,
  type CraftGenExceptionMarker,
} from './craft-gen';
import type { AnyCraftException } from './craft-exception';
import type { ResourceLike } from './craft-until-settled';
import type { CraftResourceStatus } from './util/craft-resource-status';

const CRAFT_NOT_SETTLED = Symbol('craft-not-settled');

/**
 * Thrown by a {@link CraftSettledSignal} read while its source has not settled
 * yet (`status` still `'idle'` or `'loading'`).
 *
 * It is the pending twin of {@link CraftGenShortCircuit}: both are native
 * `throw`s raised during a render pass and caught by the nearest boundary — a
 * `catchBlock` for the exception, a `pendingBlock` for this one. The dependency
 * on the source's `status` signal is established *before* the throw, so the
 * reading computation re-runs on its own once the source settles.
 */
export class CraftNotSettled extends Error {
  readonly [CRAFT_NOT_SETTLED] = true;
  /** Name of the async source that is not settled yet (`query` name, …). */
  readonly source: string;

  constructor(source: string) {
    super(
      `Craft async source "${source}" is not settled yet. Wrap the reading template in a pendingBlock(...).`,
    );
    this.name = 'CraftNotSettled';
    this.source = source;
  }
}

export function isCraftNotSettled(value: unknown): value is CraftNotSettled {
  return (
    typeof value === 'object' && value !== null && CRAFT_NOT_SETTLED in value
  );
}

declare const CRAFT_SETTLED_BRAND: unique symbol;

/**
 * Type-only brand carried by a {@link CraftSettledSignal}. It records **which**
 * async source the reader depends on and **which** exception codes that source
 * may raise, so both requirements can be enforced by the template type-checker:
 *
 * - `Source` must be covered by a `pendingBlock` boundary;
 * - `Codes` must be covered by a `catchBlock` boundary.
 *
 * The brand survives passing the signal by reference (`span(users.settledValue)`)
 * and travels through `craftComputed` via the marker yielded by {@link settled}.
 * It is lost inside a lambda (`() => users.settledValue().name`) — that case is
 * a lint concern, not a type one.
 */
export interface CraftSettledBrand<
  Source extends string = string,
  Exceptions = never,
> {
  // Required (never present at runtime) so that extraction is exact: an
  // unbranded signal simply does not match, instead of matching with the
  // parameters falling back to their constraint.
  readonly [CRAFT_SETTLED_BRAND]: {
    readonly source: Source;
    readonly exceptions: Exceptions;
  };
}

/**
 * A `Signal<Value>` that never returns `undefined` and never returns a value
 * while its source carries an exception — it throws instead (see
 * {@link CraftNotSettled}). Its brand makes both obligations visible to the
 * template type-checker.
 */
export type CraftSettledSignal<
  Value,
  Source extends string = string,
  Exceptions = never,
> = Signal<Value> & CraftSettledBrand<Source, Exceptions>;

/** The async source names a value depends on (`never` when it depends on none). */
export type CraftSettledSourcesOf<Value> =
  Value extends CraftSettledBrand<infer Source, any>
    ? string extends Source
      ? never
      : Source
    : never;

/** The `craftException`s a settled read may surface. */
export type CraftSettledExceptionsOf<Value> =
  Value extends CraftSettledBrand<any, infer Exceptions> ? Exceptions : never;

/** The exception codes a settled read may surface. */
export type CraftSettledCodesOf<Value> = Extract<
  CraftSettledExceptionsOf<Value>,
  { readonly code: string }
>['code'];

/**
 * Type-level marker surfaced by a {@link settled} call's `Yielded`, carrying the
 * name of the async source the enclosing computation now depends on.
 *
 * Like {@link CraftGenExceptionMarker} it is **never** yielded at runtime, and is
 * intentionally not a `ServiceYieldRequest` so dependency-map extraction ignores
 * it.
 */
export interface CraftPendingMarker<Source extends string> {
  readonly __craftPendingSource__: Source;
}

/** Extracts the union of async source names advertised by the markers in `Yielded`. */
export type ExtractCraftPendingSources<Yielded> = [
  Extract<Yielded, CraftPendingMarker<any>>,
] extends [never]
  ? never
  : Extract<
        Yielded,
        CraftPendingMarker<any>
      > extends CraftPendingMarker<infer Source>
    ? Source
    : never;

/**
 * What a settled read reports about its source to whoever is listening — today
 * a `pendingBlock` boundary, which needs a handle on the source's liveness to
 * render a reload indicator.
 *
 * A suspension is announced by a `throw`, but a **reload** is not: the stale
 * value is returned and nothing is thrown. Without this channel a boundary
 * would never learn that a source it covers is refetching.
 */
export interface CraftSettledReadNotice {
  readonly source: string;
  readonly status: Signal<CraftResourceStatus | string>;
  readonly value: Signal<unknown>;
}

export type CraftSettledReadObserver = (notice: CraftSettledReadNotice) => void;

let activeSettledReadObserver: CraftSettledReadObserver | undefined;

/**
 * Runs `work` with `observer` notified of every settled read it performs. The
 * observer is registered for the synchronous extent of the call — settled reads
 * are computations, so they evaluate inside the reader's own effect.
 */
export function ɵwithSettledReadObserver<T>(
  observer: CraftSettledReadObserver | undefined,
  work: () => T,
): T {
  const previous = activeSettledReadObserver;
  activeSettledReadObserver = observer ?? previous;
  try {
    return work();
  } finally {
    activeSettledReadObserver = previous;
  }
}

/** The minimal shape {@link craftSettledValue} needs to build a settled read. */
export type SettleableResource = ResourceLike & {
  status: Signal<CraftResourceStatus | string>;
};

/**
 * Builds the `settledValue` signal of a craft primitive. Reading it:
 *
 * - throws {@link CraftGenShortCircuit} when the source carries a business
 *   exception — routed to the nearest `catchBlock`;
 * - throws {@link CraftNotSettled} while the source has no value to show yet —
 *   routed to the nearest `pendingBlock`;
 * - otherwise returns the resolved value, never `undefined`.
 *
 * A reload that preserves its previous value does **not** suspend: the stale
 * value is returned while the new one is in flight (stale-while-revalidate), so
 * a refetch never blanks a screen that already has data. Only a source with
 * nothing to show suspends.
 *
 * A residual technical failure (status `'exception'` with no business exception)
 * is rethrown through the internal Angular `error` channel, mirroring
 * `craftUntilSettled`.
 */
export function craftSettledValue<Value>(
  source: string,
  resource: SettleableResource,
): CraftSettledSignal<Value> {
  return computed(() => {
    const status = resource.status();

    activeSettledReadObserver?.({
      source,
      status: resource.status,
      value: resource.value,
    });

    if (resource.hasException()) {
      throw new CraftGenShortCircuit(
        resource.exceptions().list[0] as AnyCraftException,
      );
    }

    if (status === 'exception') {
      throw resource.error?.();
    }

    const value = resource.value();

    if (value === undefined) {
      throw new CraftNotSettled(source);
    }

    return value as Value;
  }) as CraftSettledSignal<Value>;
}

type SettledSignalOf<Ref> = Ref extends {
  settledValue: CraftSettledSignal<infer Value, infer Source, infer Exceptions>;
}
  ? CraftSettledSignal<Value, Source, Exceptions>
  : never;

/**
 * Reads the settled value of a craft primitive from inside a generator-based
 * computation, and records the dependency in its type:
 *
 * ```ts
 * readonly activeUserName = craftComputed('activeUserName', function* () {
 *   const users = yield* settled(this.users);
 *   // `users()` is `User[]` here — never undefined, never in exception
 *   return () => users().filter((user) => user.active).length;
 * });
 * ```
 *
 * The returned signal is the primitive's own `settledValue`: nothing is awaited
 * and nothing is yielded at runtime. The yielded markers are type-only and make
 * the enclosing `craftComputed`:
 *
 * - depend on the source's pending state — a `pendingBlock` becomes mandatory in
 *   any template rendering it;
 * - carry the source's exceptions — a `catchBlock` becomes mandatory too.
 */
export function* settled<
  const Ref extends { readonly settledValue: CraftSettledSignal<any, any, any> },
>(
  resource: Ref,
): Generator<
  | CraftPendingMarker<
      SettledSignalOf<Ref> extends CraftSettledSignal<any, infer Source, any>
        ? Source
        : never
    >
  | CraftGenExceptionMarker<CraftSettledExceptionsOf<SettledSignalOf<Ref>>>,
  SettledSignalOf<Ref>,
  unknown
> {
  return resource.settledValue as SettledSignalOf<Ref>;
}

/**
 * Installs the lazily-created `settledValue` read on a resource-like primitive
 * ref (`query`, `mutation`, `asyncProcess`).
 *
 * It is a getter — the computation is only built on first read — and it is
 * **enumerable**: a template context is rebuilt by copying the ref's own
 * enumerable members, so a hidden property would not survive the trip into the
 * template.
 */
export function attachCraftSettledValue(name: string, ref: object): void {
  if ('settledValue' in ref) return;

  let cached: CraftSettledSignal<unknown> | undefined;
  Object.defineProperty(ref, 'settledValue', {
    get: () =>
      (cached ??= craftSettledValue(name, ref as unknown as SettleableResource)),
    enumerable: true,
    configurable: true,
  });
}

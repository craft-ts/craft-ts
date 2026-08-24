import {
  computed,
  effect,
  endBatch,
  setActiveSub,
  signal,
  startBatch,
} from 'alien-signals';
import { RAW_REACTIVE_VALUE } from '../reactive-read';

// alien-signals v3 flushes effects synchronously. Outlet view-transition
// swaps also run CRAFT_SYNC_TEMPLATE_FLUSH inside startViewTransition.
export const CRAFT_SIGNAL = Symbol('craft-signal');

export type CraftSignal<T> = (() => T) & {
  readonly [CRAFT_SIGNAL]: true;
};

export type CraftWritableSignal<T> = CraftSignal<T> & {
  set(value: T): void;
  update(fn: (value: T) => T): void;
  asReadonly(): CraftSignal<T>;
};

type CraftSignalOptions<T> = {
  readonly equal?: (a: T, b: T) => boolean;
  readonly debugName?: string;
};

type CraftWatchOptions = {
  readonly debugName?: string;
  readonly injector?: unknown;
  readonly manualCleanup?: boolean;
};

export function ɵbrandAsCraftSignal<T>(value: () => T): CraftSignal<T> {
  return brand(value) as CraftSignal<T>;
}

function brand<T, SignalType extends () => T>(value: SignalType): SignalType {
  Object.defineProperties(value, {
    [CRAFT_SIGNAL]: {
      value: true,
      enumerable: false,
    },
    [RAW_REACTIVE_VALUE]: {
      value,
      enumerable: false,
    },
  });
  return value;
}

function withAsReadonly<T>(
  value: CraftWritableSignal<T> | CraftSignal<T>,
): typeof value {
  const writable = value as CraftWritableSignal<T>;
  if (typeof writable.asReadonly !== 'function') {
    writable.asReadonly = () => value;
  }
  return value;
}

export function craftSignal<T>(
  initial: T,
  options?: CraftSignalOptions<T>,
): CraftWritableSignal<T> {
  // The value travels in a fresh box on every accepted write. alien-signals
  // compares the stored value by identity and drops a write that does not
  // change it — which would silently override `equal`, the very option callers
  // use to publish an in-place mutation (`map.set(k, v); return map`). Boxing
  // makes `equal` the only thing that decides whether a write propagates.
  const raw = signal<{ value: T }>({ value: initial });
  const equal = options?.equal ?? Object.is;
  const read = () => raw().value;
  const value = (() => read()) as CraftWritableSignal<T>;
  value.set = (next) => {
    if (
      !equal(
        untracked(read),
        next,
      )
    ) {
      raw({ value: next });
    }
  };
  value.update = (update) => value.set(update(untracked(read)));
  const branded = brand(value);
  branded.asReadonly = () => craftComputed(() => branded());
  return branded;
}

/**
 * A computation's outcome, value or throw. Craft signals suspension
 * (`CraftNotSettled`) and business exceptions (`CraftGenShortCircuit`) by
 * throwing out of a computation, and alien-signals leaves a getter that threw
 * marked CLEAN with its value never assigned — every later read would then hand
 * back a stale value (or `undefined`) instead of raising again. Settling the
 * throw into a value keeps the node honest: it is cached, re-raised on read,
 * and invalidated by the same dependencies as a normal result.
 */
type CraftSettlement<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: unknown };

export function craftComputed<T>(compute: () => T): CraftSignal<T>;
export function craftComputed<T>(
  compute: () => T,
  options: CraftSignalOptions<T>,
): CraftSignal<T>;
export function craftComputed<T>(
  compute: () => T,
  options?: CraftSignalOptions<T>,
): CraftSignal<T> {
  const equal = options?.equal ?? Object.is;
  let hasPrevious = false;
  const derived = computed<CraftSettlement<T>>((previous) => {
    let next: CraftSettlement<T>;
    try {
      next = { ok: true, value: compute() };
    } catch (error) {
      next = { ok: false, error };
    }
    // Identity is preserved only between two equal VALUES: a throw is never
    // equal to anything, so a recovering computation always notifies.
    const result =
      hasPrevious && previous?.ok && next.ok && equal(previous.value, next.value)
        ? previous
        : next;
    hasPrevious = true;
    return result;
  });
  const value = (() => {
    const settlement = derived();
    // A computed read from inside its own first evaluation has nothing settled
    // yet, and alien-signals hands back the node's still-unassigned value. That
    // is a cycle in the graph, and it stays the caller's to resolve — but it
    // reads as `undefined`, exactly as it did before outcomes were boxed, and
    // not as a TypeError raised in here about a wrapper the caller never saw.
    if (settlement === undefined) return undefined as T;
    if (!settlement.ok) throw settlement.error;
    return settlement.value;
  }) as CraftSignal<T>;
  return withAsReadonly(brand(value)) as CraftSignal<T>;
}

export function craftLinkedSignal<T>(options: {
  source: () => unknown;
  computation: () => T;
  equal?: (a: T, b: T) => boolean;
  debugName?: string;
}): CraftWritableSignal<T> {
  const revision = signal(0);
  const equal = options.equal ?? Object.is;
  let hasSource = false;
  let previousSource: unknown;
  let hasComputedValue = false;
  let localOverride = false;
  let localValue!: T;

  const derived = computed<T>((previous) => {
    revision();
    const source = options.source();
    if (!hasSource || !Object.is(previousSource, source)) {
      hasSource = true;
      previousSource = source;
      localOverride = false;
    }
    if (localOverride) {
      return localValue;
    }
    const next = options.computation();
    const result =
      hasComputedValue && equal(previous as T, next) ? (previous as T) : next;
    hasComputedValue = true;
    return result;
  });
  const value = (() => derived()) as CraftWritableSignal<T>;
  value.set = (next) => {
    if (!hasSource) {
      previousSource = untracked(options.source);
      hasSource = true;
    }
    localValue = next;
    localOverride = true;
    revision(untracked(() => revision()) + 1);
  };
  value.update = (update) => value.set(update(untracked(() => derived())));
  const branded = brand(value);
  branded.asReadonly = () => craftComputed(() => branded());
  return branded;
}

export function craftWatch(
  fn: () => void | (() => void),
  _options?: CraftWatchOptions,
): { destroy(): void } {
  // alien-signals has no injector ownership. The overload preserves the Task 2
  // call shape; boundary helpers remain responsible for injector teardown.
  // Detach watches from the currently active Alien subscriber so an
  // independently-owned watch is not disposed with a transient parent effect.
  const destroy = untracked(() => effect(fn));
  return { destroy };
}

/**
 * Publishes every write made inside `fn` as ONE update: readers and effects run
 * after the last write, never between two of them.
 *
 * Craft effects run synchronously, so two writes that only make sense together
 * — a nonce and the params it tags, a value and the status that describes it —
 * have to say so, or a reader woken by the first one observes the half-written
 * state and acts on it.
 */
export function craftBatch<T>(fn: () => T): T {
  startBatch();
  try {
    return fn();
  } finally {
    endBatch();
  }
}

export function untracked<T>(fn: () => T): T {
  const previous = setActiveSub();
  try {
    return fn();
  } finally {
    setActiveSub(previous);
  }
}

export function isCraftSignal(value: unknown): value is CraftSignal<unknown> {
  return (
    typeof value === 'function' &&
    (value as Partial<CraftSignal<unknown>>)[CRAFT_SIGNAL] === true
  );
}

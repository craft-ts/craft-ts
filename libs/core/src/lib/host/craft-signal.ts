import {
  computed,
  effect,
  endBatch,
  getActiveSub,
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
    if (!equal(untracked(read), next)) {
      raw({ value: next });
    }
  };
  value.update = (update) => value.set(update(untracked(read)));
  const branded = brand(value);
  branded.asReadonly = () => craftComputed(() => branded());
  return branded;
}

/**
 * A renderer-private reactive cell: read, `set`, `update` — nothing else.
 *
 * Same kernel and same write semantics as {@link craftSignal} with its default
 * equality: `Object.is` decides, the value travels in a fresh box on every
 * accepted write, the comparison read inside `set`/`update` is untracked, and
 * writes join the ambient `craftBatch`. What it leaves out is what only a
 * value handed to application code needs: the Craft signal brand, the raw
 * reactive marker, the extra read wrapper and `asReadonly`.
 *
 * Never hand one to application code or store one where a public signal is
 * expected: it is not recognized as a signal (`isSignal` is false).
 */
export type ɵCraftPrivateCell<T> = (() => T) & {
  set(value: T): void;
  update(fn: (value: T) => T): void;
};

type PrivateCell<T> = ɵCraftPrivateCell<T> & {
  ɵraw: (box: { value: T }) => void;
};

// Shared by every cell: a cell is called as `cell.set(...)`, never detached.
function setPrivateCell<T>(this: PrivateCell<T>, next: T): void {
  if (!Object.is(untracked(this), next)) this.ɵraw({ value: next });
}

function updatePrivateCell<T>(
  this: ɵCraftPrivateCell<T>,
  update: (value: T) => T,
): void {
  this.set(update(untracked(this)));
}

export function ɵcraftPrivateCell<T>(initial: T): ɵCraftPrivateCell<T> {
  const raw = signal<{ value: T }>({ value: initial });
  const cell = (() => raw().value) as PrivateCell<T>;
  cell.ɵraw = raw;
  cell.set = setPrivateCell;
  cell.update = updatePrivateCell;
  return cell;
}

type LazyPrivateCell<T> = ɵCraftPrivateCell<T> & {
  ɵraw:
    | {
        (): { value: T };
        (box: { value: T }): void;
      }
    | undefined;
  ɵinitial: T | undefined;
};

function setLazyPrivateCell<T>(this: LazyPrivateCell<T>, next: T): void {
  const raw = this.ɵraw;
  if (raw === undefined) this.ɵinitial = next;
  else if (!Object.is(untracked(this), next)) raw({ value: next });
}

/**
 * A private cell whose kernel node and value box are created on its first read.
 * set() before a read keeps only the current value; update() reads it untracked,
 * like an ordinary private cell. Once read, the normal write methods apply.
 * Useful for optional inputs such as a list index. This stays in the renderer.
 */
export function ɵcraftLazyPrivateCell<T>(initial: T): ɵCraftPrivateCell<T> {
  const cell = (() => {
    let raw = cell.ɵraw;
    if (raw === undefined) {
      raw = cell.ɵraw = signal<{ value: T }>({ value: cell.ɵinitial as T });
      cell.ɵinitial = undefined;
      cell.set = setPrivateCell;
    }
    return raw().value;
  }) as LazyPrivateCell<T>;
  cell.ɵraw = undefined;
  cell.ɵinitial = initial;
  cell.set = setLazyPrivateCell;
  cell.update = updatePrivateCell;
  return cell;
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
      hasPrevious &&
      previous?.ok &&
      next.ok &&
      equal(previous.value, next.value)
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
 * A kernel effect for a host that owns it and needs no cleanup registration:
 * `fn` runs now and after each change, detached from the active subscriber
 * like {@link craftWatch}. Returns what stops it.
 */
export function ɵcraftDetachedEffect(fn: () => void): () => void {
  const previous = setActiveSub();
  try {
    return effect(fn);
  } finally {
    setActiveSub(previous);
  }
}

/**
 * {@link ɵcraftDetachedEffect} for a renderer binding: when its first run
 * read no reactive source, nothing can ever run it again, so it is stopped at
 * once and `undefined` is returned — the binding keeps no subscriber.
 */
export function ɵcraftBindingEffect(fn: () => void): (() => void) | undefined {
  let node: { deps?: unknown } | undefined;
  let first = true;
  const previous = setActiveSub();
  try {
    const stop = effect(() => {
      if (first) {
        first = false;
        node = getActiveSub() as { deps?: unknown } | undefined;
      }
      fn();
    });
    if (node !== undefined && node.deps === undefined) {
      stop();
      return undefined;
    }
    return stop;
  } finally {
    setActiveSub(previous);
  }
}

let closingBatch = false;
let pendingBatchEnds = 0;

// Alien's endBatch() publishes synchronously at depth zero. A renderer effect
// may itself finish a batch while that queue is being drained: calling
// endBatch() there would recursively drain all the remaining sibling effects.
// Keep those inner batches open until the current drain returns, then balance
// every startBatch(), even if an effect failed. No work crosses an async turn.
function closeCraftBatch(): void {
  pendingBatchEnds++;
  if (closingBatch) return;
  closingBatch = true;
  let failed = false;
  let failure: unknown;
  try {
    while (pendingBatchEnds) {
      pendingBatchEnds--;
      try {
        endBatch();
      } catch (error) {
        if (!failed) {
          failed = true;
          failure = error;
        }
      }
    }
  } finally {
    closingBatch = false;
  }
  if (failed) throw failure;
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
    closeCraftBatch();
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

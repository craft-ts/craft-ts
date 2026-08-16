import { computed, effect, setActiveSub, signal } from 'alien-signals';
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

let activeCraftReadCollector: Set<CraftSignal<unknown>> | undefined;

function trackCraftRead(value: CraftSignal<unknown>): void {
  activeCraftReadCollector?.add(value);
}

export function captureCraftSignalReads<T>(
  fn: () => T,
  onReads?: (reads: readonly CraftSignal<unknown>[]) => void,
): {
  readonly value: T;
  readonly reads: readonly CraftSignal<unknown>[];
} {
  const previous = activeCraftReadCollector;
  const reads = new Set<CraftSignal<unknown>>();
  activeCraftReadCollector = reads;
  try {
    return { value: fn(), reads: [...reads] };
  } finally {
    activeCraftReadCollector = previous;
    onReads?.([...reads]);
  }
}

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
  const raw = signal(initial);
  const equal = options?.equal ?? Object.is;
  const value = (() => {
    trackCraftRead(value);
    return raw();
  }) as CraftWritableSignal<T>;
  value.set = (next) => {
    if (
      !equal(
        untracked(() => raw()),
        next,
      )
    ) {
      raw(next);
    }
  };
  value.update = (update) => value.set(update(untracked(() => raw())));
  const branded = brand(value);
  branded.asReadonly = () => craftComputed(() => branded());
  return branded;
}

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
  const derived = computed<T>((previous) => {
    const next = compute();
    const result =
      hasPrevious && equal(previous as T, next) ? (previous as T) : next;
    hasPrevious = true;
    return result;
  });
  const value = (() => {
    trackCraftRead(value);
    return derived();
  }) as CraftSignal<T>;
  return withAsReadonly(brand(value)) as CraftSignal<T>;
}

export function craftLinkedSignal<T>(options: {
  source: () => unknown;
  computation: () => T;
}): CraftWritableSignal<T>;
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
  const value = (() => {
    trackCraftRead(value);
    return derived();
  }) as CraftWritableSignal<T>;
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

export function craftWatch(fn: () => void | (() => void)): { destroy(): void };
export function craftWatch(
  fn: () => void | (() => void),
  options: CraftWatchOptions,
): { destroy(): void };
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

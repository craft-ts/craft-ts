import { computed, effect, setActiveSub, signal } from 'alien-signals';
import { RAW_REACTIVE_VALUE } from '../reactive-read';

export const CRAFT_SIGNAL = Symbol('craft-signal');

export type CraftSignal<T> = (() => T) & {
  readonly [CRAFT_SIGNAL]: true;
};

export type CraftWritableSignal<T> = CraftSignal<T> & {
  set(value: T): void;
  update(fn: (value: T) => T): void;
};

type CraftSignalOptions<T> = {
  readonly equal?: (a: T, b: T) => boolean;
  readonly debugName?: string;
};

type CraftWatchOptions = {
  readonly debugName?: string;
};

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

export function craftSignal<T>(
  initial: T,
  options?: CraftSignalOptions<T>,
): CraftWritableSignal<T> {
  const raw = signal(initial);
  const equal = options?.equal ?? Object.is;
  const value = (() => raw()) as CraftWritableSignal<T>;
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
  return brand(value);
}

export function craftComputed<T>(compute: () => T): CraftSignal<T>;
export function craftComputed<T>(
  compute: () => T,
  options?: CraftSignalOptions<T>,
): CraftSignal<T> {
  const equal = options?.equal ?? Object.is;
  const value = computed<T>((previous) => {
    const next = compute();
    return previous !== undefined && equal(previous, next) ? previous : next;
  });
  return brand(value) as CraftSignal<T>;
}

/**
 * Compatibility reader for computations that can still mix Angular and Craft
 * signals during the Angular-v1 extraction. It deliberately evaluates on every
 * read so each active reactive host can collect its own dependencies.
 */
export function ɵcraftDerived<T>(compute: () => T): CraftSignal<T> {
  return brand(compute) as CraftSignal<T>;
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
  const value = craftSignal(options.computation(), options);
  let initialized = false;
  effect(() => {
    options.source();
    const next = options.computation();
    if (initialized) {
      value.set(next);
    } else {
      initialized = true;
    }
  });
  return value;
}

export function craftWatch(fn: () => void | (() => void)): { destroy(): void };
export function craftWatch(
  fn: () => void | (() => void),
  _options?: CraftWatchOptions,
): { destroy(): void } {
  const destroy = effect(fn);
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

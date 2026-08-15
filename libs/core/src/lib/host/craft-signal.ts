import {
  computed,
  effect,
  isSignal,
  linkedSignal,
  signal,
  untracked as ngUntracked,
  type CreateComputedOptions,
  type CreateEffectOptions,
} from '@angular/core';
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
  return brand(signal(initial, options)) as unknown as CraftWritableSignal<T>;
}

export function craftComputed<T>(compute: () => T): CraftSignal<T>;
export function craftComputed<T>(
  compute: () => T,
  options?: CreateComputedOptions<T>,
): CraftSignal<T> {
  return brand(computed(compute, options)) as unknown as CraftSignal<T>;
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
  return brand(linkedSignal(options)) as unknown as CraftWritableSignal<T>;
}

export function craftWatch(fn: () => void | (() => void)): { destroy(): void };
export function craftWatch(
  fn: () => void | (() => void),
  options?: CreateEffectOptions,
): { destroy(): void } {
  return effect((onCleanup) => {
    const cleanup = fn();
    if (cleanup) {
      onCleanup(cleanup);
    }
  }, options);
}

export function untracked<T>(fn: () => T): T {
  return ngUntracked(fn);
}

export function isCraftSignal(value: unknown): value is CraftSignal<unknown> {
  return isSignal(value);
}

import {
  DestroyRef,
  inject,
  Injector,
  linkedSignal,
  signal,
  untracked,
  type ValueEqualityFn,
  type WritableSignal,
} from './craft-compat';
import { craftWatch } from './craft-signal';

type PreviousValue<Source, Value> = {
  readonly source: Source;
  readonly value: Value;
};

/**
 * A linked signal bridged to Craft-native dependencies.
 *
 * The synchronous Craft watch increments a revision when the source reads a
 * Craft signal, allowing the linked signal to recompute from both systems.
 */
function optionalDestroyRef(injector?: Injector): DestroyRef | null {
  if (injector) {
    return injector.get(DestroyRef, null, { optional: true });
  }
  try {
    return inject(DestroyRef, { optional: true });
  } catch {
    return null;
  }
}

export type CraftLinkedSignal<T> = WritableSignal<T> & {
  destroy(): void;
};

export function craftLinkedSignal<Source, Value>(options: {
  readonly source: () => Source;
  readonly computation: (
    source: Source,
    previous?: PreviousValue<Source, Value>,
  ) => Value;
  readonly equal?: ValueEqualityFn<Value>;
  readonly debugName?: string;
  readonly injector?: Injector;
}): CraftLinkedSignal<Value> {
  const destroyRef = optionalDestroyRef(options.injector);
  const revision = signal(0);
  let initialized = false;
  let destroyed = false;
  let watch: { destroy(): void } | undefined;
  const ensureWatch = () => {
    if (watch || destroyed) return;
    watch = craftWatch(() => {
      options.source();
      if (initialized) {
        revision.update((current) => current + 1);
      } else {
        initialized = true;
      }
    });
  };
  let previousSource: Source | undefined;
  let frozen: Value | undefined;
  let hasFrozen = false;

  const linked = linkedSignal<Source, Value>({
    source: () => {
      if (hasFrozen) {
        return previousSource as Source;
      }
      ensureWatch();
      revision();
      previousSource = options.source();
      return previousSource;
    },
    computation: (source, previous) => {
      if (hasFrozen) {
        return frozen as Value;
      }
      return options.computation(source, previous);
    },
    ...(options.equal && { equal: options.equal }),
    ...(options.debugName && { debugName: options.debugName }),
  });
  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    watch?.destroy();
    watch = undefined;
    frozen = untracked(() => linked());
    hasFrozen = true;
  };
  destroyRef?.onDestroy(destroy);
  const value = (() => (hasFrozen ? (frozen as Value) : linked())) as WritableSignal<Value>;
  value.set = (next) => {
    if (hasFrozen) {
      return;
    }
    linked.set(next);
  };
  value.update = (updateFn) => {
    if (hasFrozen) {
      return;
    }
    linked.update(updateFn);
  };
  return Object.assign(value, { destroy });
}

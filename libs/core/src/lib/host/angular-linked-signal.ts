import {
  linkedSignal,
  signal,
  type ValueEqualityFn,
  type WritableSignal,
} from '@angular/core';
import { craftWatch } from './craft-signal';

type PreviousValue<Source, Value> = {
  readonly source: Source;
  readonly value: Value;
};

/**
 * Angular linkedSignal bridged to Craft-native dependencies.
 *
 * The Angular source remains responsible for Angular dependency tracking. The
 * synchronous Craft watch only increments an Angular revision when the source
 * reads an alien-signals value.
 */
export function angularLinkedSignal<Source, Value>(options: {
  readonly source: () => Source;
  readonly computation: (
    source: Source,
    previous?: PreviousValue<Source, Value>,
  ) => Value;
  readonly equal?: ValueEqualityFn<Value>;
  readonly debugName?: string;
}): WritableSignal<Value> {
  const revision = signal(0);
  let initialized = false;
  let watch: { destroy(): void } | undefined;
  const ensureWatch = () => {
    if (watch) return;
    watch = craftWatch(() => {
      options.source();
      if (initialized) {
        revision.update((current) => current + 1);
      } else {
        initialized = true;
      }
    });
  };

  return linkedSignal<Source, Value>({
    source: () => {
      ensureWatch();
      revision();
      return options.source();
    },
    computation: options.computation,
    ...(options.equal && { equal: options.equal }),
    ...(options.debugName && { debugName: options.debugName }),
  });
}

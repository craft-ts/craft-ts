import { ResourceOptions, Signal } from '@angular/core';
import { CraftResourceRef } from './util/craft-resource-ref';
import { craftResource } from './craft-resource';
import { craftComputed, craftSignal, craftWatch } from './host/craft-signal';

export function preservedResource<T, R>(
  config: ResourceOptions<T, R>,
): CraftResourceRef<T | undefined, R> {
  const original = craftResource(config);
  const raw = original as unknown as {
    __craftRawValue: Signal<T | undefined>;
    __craftRawStatus: Signal<string>;
  };
  const preserved = craftSignal<T | undefined>(config.defaultValue);
  const preserveWatch = craftWatch(() => {
    const status = raw.__craftRawStatus();
    if (status !== 'loading' && status !== 'reloading') {
      preserved.set(status === 'error' ? undefined : raw.__craftRawValue());
    }
  });
  const state = craftComputed(() => preserved());
  const hasValue = (() =>
    original.hasValue() || preserved() !== undefined) as CraftResourceRef<
    T | undefined,
    R
  >['hasValue'];
  const destroy = () => {
    preserveWatch.destroy();
    original.destroy();
  };
  const resourceRef = {
    value: preserved,
    // `resource.hasValue()` becomes false as soon as a reload starts, even
    // though `preserved` still exposes the last resolved value to consumers.
    // Reflect the public value here so guards such as `ifBlock(hasValue)` do
    // not hide preserved content during a reload.
    hasValue,
    snapshot: original.snapshot,
    status: original.status,
    // Internal channel only: not part of the CraftResourceRef surface, kept at
    // runtime for `craftUntilSettled` (see craft-resource.ts).
    error: (
      original as unknown as {
        error: Signal<Error | undefined>;
      }
    ).error,
    isLoading: original.isLoading,
    reload: original.reload.bind(original),
    destroy,
    update: original.update.bind(original),
    set: original.set.bind(original),
    asReadonly: () => resourceRef,
    paramSrc: config.params as Signal<R | undefined>,
    state,
  };
  return resourceRef as unknown as CraftResourceRef<T | undefined, R>;
}

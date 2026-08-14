import {
  resource,
  linkedSignal,
  ResourceOptions,
  computed,
  Signal,
} from '@angular/core';
import {
  CraftResourceRef,
  CraftResourceRefSpecificState,
} from './util/craft-resource-ref';

export function preservedResource<T, R>(
  config: ResourceOptions<T, R>,
): CraftResourceRef<T | undefined, R> {
  const original = resource(config);
  const originalCopy = { ...original };
  const preserved = linkedSignal({
    source: () => ({
      value:
        originalCopy.status() === 'error' ? undefined : originalCopy.value(),
      status: originalCopy.status(),
      isLoading: originalCopy.isLoading(),
    }),
    computation: (current, previous) => {
      if (current.isLoading) {
        if (previous) {
          return previous.value;
        } else {
          return config.defaultValue;
        }
      }
      return current.value;
    },
    debugName: 'preservedResource_preserved',
  });
  const state = computed(
    () => {
      return preserved();
    },
    {
      debugName: 'preservedResource_state',
    },
  ) as CraftResourceRefSpecificState<T | undefined, R>['state'];

  if (config.defaultValue) {
    original.set(config.defaultValue);
  }
  const hasValue = (() =>
    original.hasValue() || preserved() !== undefined) as CraftResourceRef<
    T | undefined,
    R
  >['hasValue'];
  return {
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
    error: original.error,
    isLoading: original.isLoading,
    reload: original.reload.bind(original),
    destroy: original.destroy.bind(original),
    update: original.update.bind(original),
    set: original.set.bind(original),
    asReadonly: original.asReadonly.bind(original),
    paramSrc: config.params as Signal<R | undefined>,
    state,
  } as unknown as CraftResourceRef<T | undefined, R>;
}

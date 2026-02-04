import {
  resource,
  linkedSignal,
  ResourceOptions,
  computed,
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
      //@ts-expect-error originalCopy can access to isError
      value: originalCopy.isError() ? undefined : originalCopy.value(),
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
  ) as CraftResourceRefSpecificState<T | undefined, R>['safeValue'];

  if (config.defaultValue) {
    original.set(config.defaultValue);
  }
  return {
    value: preserved,
    hasValue: original.hasValue.bind(original),
    status: original.status,
    error: original.error,
    isLoading: original.isLoading,
    reload: original.reload.bind(original),
    destroy: original.destroy.bind(original),
    update: original.update.bind(original),
    set: original.set.bind(original),
    asReadonly: original.asReadonly.bind(original),
    safeValue: state,
    paramSrc: config.params,
    state,
  } as CraftResourceRef<T | undefined, R>;
}

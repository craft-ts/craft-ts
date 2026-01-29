import { resource, linkedSignal, ResourceOptions } from '@angular/core';
import { CraftResourceRef } from './util/craft-resource-ref';

export function preservedResource<T, R>(
  config: ResourceOptions<T, R>,
): CraftResourceRef<T | undefined, R> {
  const original = resource(config);
  const originalCopy = { ...original };
  const preserved = linkedSignal({
    source: () => ({
      value: originalCopy.value(),
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
  });
  Object.assign(original, {
    value: preserved,
    paramSrc: config.params,
  });
  if (config.defaultValue) {
    original.set(config.defaultValue);
  }
  return original as CraftResourceRef<T | undefined, R>;
}

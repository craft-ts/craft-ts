import {
  resource,
  linkedSignal,
  ResourceRef,
  ResourceOptions,
} from '@angular/core';

export function preservedResource<T, R>(
  config: ResourceOptions<T, R>
): ResourceRef<T | undefined> {
  const original = resource(config);
  const originalCopy = { ...original };
  //@ts-ignore
      if(`${config.params().page}-${config.params().pageSize}` === '2-4') debugger
  const preserved = linkedSignal({
    source: () => ({
      value: originalCopy.value(),
      status: originalCopy.status(),
      isLoading: originalCopy.isLoading(),
    }),
    computation: (current, previous) => {
      //@ts-ignore
      if(`${config.params().page}-${config.params().pageSize}` === '2-4') debugger
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
  });
  if (config.defaultValue) {
    original.set(config.defaultValue);
  }
  return original;
}

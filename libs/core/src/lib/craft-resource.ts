import { computed, resource, ResourceOptions, Signal } from '@angular/core';
import { CraftResourceRef } from './util/craft-resource-ref';

export function craftResource<Value, Params>(
  options: ResourceOptions<Value, Params>,
): CraftResourceRef<Value, Params> {
  const resourceRef = resource(options);
  // do not use Object.assign, it will cause a cyclic dependency error
  return {
    value: resourceRef.value,
    hasValue: resourceRef.hasValue.bind(resourceRef),
    status: resourceRef.status,
    error: resourceRef.error,
    isLoading: resourceRef.isLoading,
    reload: resourceRef.reload.bind(resourceRef),
    destroy: resourceRef.destroy.bind(resourceRef),
    update: resourceRef.update.bind(resourceRef),
    set: resourceRef.set.bind(resourceRef),
    asReadonly: resourceRef.asReadonly.bind(resourceRef),
    safeValue: computed(
      () => (resourceRef.hasValue() ? resourceRef.value() : undefined),
      {
        debugName: 'craftResourceSafeValue',
      },
    ),
    paramSrc: options.params as Signal<Params>,
    state: computed(
      () => (resourceRef.hasValue() ? resourceRef.value() : undefined),
      {
        debugName: 'craftResourceState',
      },
    ),
  } as CraftResourceRef<Value, Params>;
}

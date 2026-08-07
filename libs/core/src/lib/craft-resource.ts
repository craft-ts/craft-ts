import { computed, resource, ResourceOptions, Signal } from '@angular/core';
import { CraftResourceRef } from './util/craft-resource-ref';

export function craftResource<Value, Params>(
  options: ResourceOptions<Value, Params>,
): CraftResourceRef<Value, Params> {
  const resourceRef = resource(options);
  const value = computed(
    () => (resourceRef.hasValue() ? resourceRef.value() : undefined),
    {
      debugName: 'craftResourceValue',
    },
  );
  // do not use Object.assign, it will cause a cyclic dependency error
  return {
    value,
    hasValue: resourceRef.hasValue.bind(resourceRef),
    snapshot: resourceRef.snapshot,
    status: resourceRef.status,
    // Internal channel only: `error` is not part of the CraftResourceRef surface
    // (replaced by the exceptions API) but stays on the object at runtime so
    // `craftUntilSettled` can rethrow a residual technical failure.
    error: resourceRef.error,
    isLoading: resourceRef.isLoading,
    reload: resourceRef.reload.bind(resourceRef),
    destroy: resourceRef.destroy.bind(resourceRef),
    update: resourceRef.update.bind(resourceRef),
    set: resourceRef.set.bind(resourceRef),
    asReadonly: resourceRef.asReadonly.bind(resourceRef),
    paramSrc: options.params as Signal<Params>,
    state: computed(
      () => (resourceRef.hasValue() ? resourceRef.value() : undefined),
      {
        debugName: 'craftResourceState',
      },
    ),
  } as CraftResourceRef<Value, Params>;
}

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
import { AsyncStateManager, StateWithParams } from './util/persister.type';

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

  const asyncStateManager: AsyncStateManager<unknown, T | undefined, R> = {
    hasIdentifier: false,
    isStable: linkedSignal(() => !original.isLoading() && !original.error()),
    stateWithParams: computed(() => {
      const state = original.hasValue() ? original.value() : undefined;
      const params = config.params?.();
      return { state, params };
    }) as Signal<StateWithParams<T, R>>,
    setAsyncState: (stateWithParams) => {
      preserved.set(stateWithParams.state);
    },
  };

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
    asyncStateManager,
  } as CraftResourceRef<T | undefined, R>;
}

import { Signal } from '@angular/core';
import { localStoragePersisterV2 } from './local-storage-persister-v2';
import { CommonStateInsertionsFactory } from './query.core';

export function insertLocalStoragePersister<
  State,
  Identifier,
  Params,
  PreviousInsertionsOutputs,
  const CacheTime = 300000, // Default cache time in milliseconds (5 minutes)
>(config: {
  /** Name of your current store, it is mainly used as a prefix for localStorage keys */
  storeName: string;
  /** Key used to identify the specific data within the store */
  key: string;
  /** Whether to wait for the params source to be equal to its previous value before persisting.
   * Mainly useful when params can be undefined at the beginning. (And for single resource).
   * Default is true.
   */
  waitForParamsSrcToBeEqualToPreviousValue?: boolean;
  /**
   * Default cache time in milliseconds.
   * This is the time after which the cached data will be considered stale and eligible for garbage collection.
   * If not specified, the default is 5 minutes (300000 ms).
   */
  cacheTime?: CacheTime;
  /**
   * Whether the current state is stable enough to be persisted.
   * If it becomes false, the cache is removed.
   * Default is a signal(true).
   */
  isStable?: Signal<boolean>;
}) {
  return (
    context: CommonStateInsertionsFactory<
      State,
      PreviousInsertionsOutputs,
      Params,
      Identifier
    >,
  ) => {
    const persister = localStoragePersisterV2({
      prefix: config.storeName,
      key: config.key,
      state: context.state,
      asyncStateManager: context.asyncStateManager,
      set: (state) => context.set(state),
      waitForParamsSrcToBeEqualToPreviousValue:
        config.waitForParamsSrcToBeEqualToPreviousValue ?? false,
      cacheTime: (config?.cacheTime as number | undefined) ?? 300000,
    });

    return {
      persister,
    };
  };
}

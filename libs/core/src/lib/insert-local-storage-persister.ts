import { localStoragePersister } from './local-storage-persister';
import {
  InsertionByIdParams,
  InsertionResourceFactoryContext,
  InsertionParams,
  InsertionStateFactoryContext,
} from './query.core';
import { ResourceByIdRef } from './resource-by-id';
import { ResourceRef } from '@angular/core';

export function insertLocalStoragePersister<
  GroupIdentifier extends string,
  ResourceState extends object | undefined,
  ResourceParams,
  PreviousInsertionsOutputs,
  StateType,
  const CacheTime = 300000 // Default cache time in milliseconds (5 minutes)
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
}) {
  return (
    context:
      | InsertionResourceFactoryContext<
          GroupIdentifier,
          ResourceState,
          ResourceParams,
          PreviousInsertionsOutputs
        >
      | InsertionStateFactoryContext<StateType, PreviousInsertionsOutputs>
  ) => {
    type ResourceByIdContext = InsertionByIdParams<
      GroupIdentifier,
      ResourceState,
      ResourceParams,
      PreviousInsertionsOutputs
    >;
    type ResourceContext = InsertionParams<
      ResourceState,
      ResourceParams,
      PreviousInsertionsOutputs
    >;
    const persister = localStoragePersister(config.storeName);
    const hasResourceById = 'resourceById' in context;
    const isUsingIdentifier =
      hasResourceById ||
      ('identifier' in context &&
        typeof (context as unknown as ResourceByIdContext).identifier ===
          'function');
    const resourceTarget =
      'resourceById' in context
        ? context.resourceById
        : 'state' in context
        ? (context as any).state
        : (context as ResourceContext).resource;

    if (isUsingIdentifier) {
      persister.addQueryByIdToPersist({
        key: 'userQuery',
        cacheTime: (config?.cacheTime as number | undefined) ?? 300000,
        queryByIdResource: resourceTarget as unknown as ResourceByIdRef<
          string,
          unknown,
          unknown
        >,
        queryResourceParamsSrc: (
          context as ResourceByIdContext | ResourceContext
        ).resourceParamsSrc,
      });
    } else {
      persister.addQueryToPersist({
        key: 'userQuery',
        cacheTime: (config?.cacheTime as number | undefined) ?? 300000,
        queryResource: resourceTarget as unknown as ResourceRef<unknown>,
        queryResourceParamsSrc: (
          context as unknown as ResourceByIdContext | ResourceContext
        ).resourceParamsSrc,
        waitForParamsSrcToBeEqualToPreviousValue: true,
      });
    }

    return {
      persister,
    };
  };
}

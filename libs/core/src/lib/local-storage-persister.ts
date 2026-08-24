import {
  effect,
  inject,
  Injector,
  linkedSignal,
  signal,
  untracked,
} from './host/craft-compat';

import type { StorageServiceApi } from './browser-boundaries';
import { isEqual } from './util/persister.util';
import {
  PersistedQuery,
  PersistedQueryById,
  QueriesPersister,
} from './util/persister.type';
import {
  nestedEffect,
  selfStoppingNestedEffect,
} from './util/types/util';
import { ResourceByIdRef } from './resource-by-id';

/**
 * The keys registered since the last time, plus the full key set they were
 * diffed against.
 *
 * Carrying `allKeys` is what makes the diff correct: the registration maps are
 * mutated in place and re-published (`equal: () => false`), so the previous
 * SOURCE is the very same Map instance as the current one and diffing against
 * it always yields nothing. Diffing against the previous RESULT — a snapshot
 * this computation owns — holds whether the computation runs eagerly or is
 * deferred to a later flush.
 */
type NewKeys = { newKeys: string[]; allKeys: string[] } | undefined;

function diffNewKeys(currentKeys: readonly string[], previous: NewKeys): NewKeys {
  if (currentKeys.length === 0) {
    return undefined;
  }
  const previousKeys = previous?.allKeys ?? [];
  const newKeys = currentKeys.filter((key) => !previousKeys.includes(key));
  return newKeys.length > 0
    ? { newKeys, allKeys: [...currentKeys] }
    : previous;
}

export function createStoragePersister(
  prefix: string,
  storage: StorageServiceApi,
): QueriesPersister {
  const _injector = inject(Injector);
  const queriesMap = signal(
    new Map<string, PersistedQuery & { storageKey: string }>(),
    {
      equal: () => false,
    }
  );

  const queriesByIdMap = signal(
    new Map<string, PersistedQueryById & { storageKey: string }>(),
    {
      equal: () => false,
    }
  );

  const newQueryKeysForNestedEffect = linkedSignal<any, NewKeys>({
    source: queriesMap,
    computation: (currentSource, previous) =>
      diffNewKeys(Array.from(currentSource?.keys() ?? []), previous?.value),
  });

  effect(() => {
    if (!newQueryKeysForNestedEffect()?.newKeys) {
      return;
    }

    newQueryKeysForNestedEffect()?.newKeys.forEach((newKey) => {
      const data = untracked(() => queriesMap().get(newKey));
      nestedEffect(_injector, () => {
        if (!data) {
          return;
        }
        const { queryResource, queryResourceParamsSrc, storageKey } = data;
        const queryStatus = queryResource.status();
        const queryValue = queryResource.value(); // also track the query value, because the status can stayed local but the value may change

        if (queryStatus !== 'resolved' && queryStatus !== 'local') {
          return;
        }
        untracked(() => {
          const queryParams = queryResourceParamsSrc();
          storage.setItem(
            storageKey,
            JSON.stringify({
              queryParams,
              queryValue,
              timestamp: Date.now(),
            })
          );
        });
      });

      if (data?.waitForParamsSrcToBeEqualToPreviousValue) {
        selfStoppingNestedEffect(
          _injector,
          (stop) => {
            const { queryResourceParamsSrc, storageKey, queryResource, staleTime, validate } = data;
            const params = queryResourceParamsSrc();
            if (params === undefined) {
              return;
            }
            const storedValue = storage.getItem(storageKey);
            if (!storedValue) {
              stop();
              return;
            }
            try {
              const { queryValue, queryParams, timestamp } =
                JSON.parse(storedValue);

              if (validate && !validate(queryValue)) {
                storage.removeItem(storageKey);
                stop();
                return;
              }

              // Check if cache is expired
              if (
                timestamp &&
                data.cacheTime > 0 &&
                isValueExpired(timestamp, data.cacheTime)
              ) {
                storage.removeItem(storageKey);
                stop();
                return;
              }

              const isEqualParams = isEqual(params, queryParams);
              if (!isEqualParams) {
                storage.removeItem(storageKey);
                stop();
                return;
              }
              if (isEqualParams) {
                queryResource.set(queryValue);
                if (staleTime !== undefined && timestamp && isValueExpired(timestamp, staleTime)) {
                  queryResource.reload();
                }
              }
              stop();
            } catch (e) {
              console.error('Error parsing stored value from localStorage', e);
              stop();
              return;
            }
          }
        );
      }
    });
  });

  const newQueryByIdKeysForNestedEffect = linkedSignal<any, NewKeys>({
    source: queriesByIdMap,
    computation: (currentSource, previous) =>
      diffNewKeys(Array.from(currentSource?.keys() ?? []), previous?.value),
  });

  effect(() => {
    if (!newQueryByIdKeysForNestedEffect()?.newKeys) {
      return;
    }

    // Each time their is a status change in the queryById resource it will save the query with only the resource that are 'resolved' or 'local' (it may be improved)
    newQueryByIdKeysForNestedEffect()?.newKeys.forEach((newKey) => {
      const data = untracked(() => queriesByIdMap().get(newKey));
      nestedEffect(_injector, () => {
        if (!data) {
          return;
        }

        const { queryByIdResource, queryResourceParamsSrc, storageKey } = data;

        const newRecordInQueryByIdForNestedEffect = linkedSignal<any, NewKeys>({
          source: queryByIdResource,
          computation: (
            currentSource: ReturnType<
              ResourceByIdRef<string, unknown, unknown>
            >,
            previous,
          ) => diffNewKeys(Object.keys(currentSource ?? {}), previous?.value),
        });
        newRecordInQueryByIdForNestedEffect()?.newKeys.forEach((newRecord) => {
          const data = untracked(() => queryByIdResource()[newRecord]);
          nestedEffect(_injector, () => {
            if (!data) {
              return;
            }

            let storedValue: QueryByIdStored | undefined;
            try {
              storedValue = JSON.parse(
                storage.getItem(storageKey) || 'null'
              );
            } catch (e) {
              console.error('Error parsing stored value from localStorage', e);
              storage.removeItem(storageKey);
            }
            storedValue = storedValue ?? {
              queryParams: queryResourceParamsSrc(),
              queryByIdValue: {},
              timestamp: Date.now(),
            };

            const isStable =
              data.status() === 'resolved' || data.status() === 'local';
            const dataValue = data.hasValue() ? data.value() : undefined;
            untracked(() => {
              storedValue = {
                queryParams: queryResourceParamsSrc(),
                queryByIdValue: {
                  ...storedValue?.queryByIdValue,
                  [newRecord]: {
                    params:
                      storedValue?.queryByIdValue[newRecord]?.params ??
                      queryResourceParamsSrc(),
                    value: dataValue,
                    reloadOnMount: !isStable,
                    timestamp: Date.now(),
                  },
                },
                timestamp: Date.now(),
              };
              storage.setItem(storageKey, JSON.stringify(storedValue));
            });
          });
        });
      });
    });
  });

  return {
    addQueryToPersist(data: PersistedQuery): void {
      const {
        key,
        storeName,
        queryResource,
        queryResourceParamsSrc,
        waitForParamsSrcToBeEqualToPreviousValue,
        cacheTime,
        staleTime,
        validate,
      } = data;

      const storageKey = getStorageKey(storeName ?? prefix, key, 'resource');
      const storedValue = storage.getItem(storageKey);
      if (storedValue && !waitForParamsSrcToBeEqualToPreviousValue) {
        try {
          const { queryValue, timestamp } = JSON.parse(storedValue);
          if (validate && !validate(queryValue)) {
            storage.removeItem(storageKey);
          } else if (
            timestamp &&
            cacheTime > 0 &&
            isValueExpired(timestamp, cacheTime)
          ) {
            storage.removeItem(storageKey);
          } else {
            queryResource.set(queryValue);
            if (staleTime !== undefined && timestamp && isValueExpired(timestamp, staleTime)) {
              queryResource.reload();
            }
          }
        } catch (e) {
          console.error('Error parsing stored value from localStorage', e);
          storage.removeItem(storageKey);
        }
      }
      queriesMap.update((map) => {
        map.set(getPersisterMapKey(storeName ?? prefix, key), {
          queryResource,
          queryResourceParamsSrc,
          storageKey,
          waitForParamsSrcToBeEqualToPreviousValue,
          cacheTime,
          staleTime,
          validate,
          key,
        });
        return map;
      });
    },

    addQueryByIdToPersist(data: PersistedQueryById): void {
      const { key, storeName, queryByIdResource, queryResourceParamsSrc, cacheTime, staleTime, validate } =
        data;

      const storageKey = getStorageKey(storeName ?? prefix, key, 'resourceById');
      let storedValue: QueryByIdStored | undefined;
        try {
        storedValue = JSON.parse(storage.getItem(storageKey) || 'null');
      } catch (e) {
        console.error('Error parsing stored value from localStorage', e);
        storage.removeItem(storageKey);
      }

      const storedValueWithValidCacheTime =
        removeNotValidRecordsWithValidCacheTime(
          storageKey,
          storedValue,
          cacheTime,
          storage,
        );
      if (storedValueWithValidCacheTime) {
        const { queryByIdValue } = storedValueWithValidCacheTime;

        if (queryByIdValue && typeof queryByIdValue === 'object') {
          Object.entries(queryByIdValue).forEach(
            ([resourceKey, resourceValue]) => {
              const isValueValid = !validate || resourceValue.value === undefined || validate(resourceValue.value);
              const resourceRef = queryByIdResource.addById(resourceKey, {
                defaultParam: resourceValue.params,
                defaultValue: isValueValid ? resourceValue.value : undefined,
              });
              const isStale = staleTime !== undefined && resourceValue.timestamp && isValueExpired(resourceValue.timestamp, staleTime);
              // The reload strategy can be improved to prioritize the current displayed resource
              if (resourceValue.reloadOnMount || (isValueValid && isStale)) {
                resourceRef.reload();
              }
            }
          );
        }
      }
      queriesByIdMap.update((map) => {
        map.set(getPersisterMapKey(storeName ?? prefix, key), {
          queryByIdResource,
          queryResourceParamsSrc,
          storageKey,
          cacheTime,
          staleTime,
          validate,
          key,
        });
        return map;
      });
    },

    clearQuery(queryKey: string): void {
      queriesMap.update((map) => {
        for (const [mapKey, query] of map) {
          if (query.key !== queryKey) continue;
          map.delete(mapKey);
          storage.removeItem(query.storageKey);
        }
        return map;
      });
    },

    clearQueryBy(queryByIdKey: string): void {
      queriesByIdMap.update((map) => {
        for (const [mapKey, query] of map) {
          if (query.key !== queryByIdKey) continue;
          map.delete(mapKey);
          storage.removeItem(query.storageKey);
        }
        return map;
      });
    },

    clearAllQueries(): void {
      queriesMap().forEach((query) => {
        storage.removeItem(query.storageKey);
      });
      queriesMap.update((map) => {
        map.clear();
        return map;
      });
    },

    clearAllQueriesById(): void {
      queriesByIdMap().forEach((query) => {
        storage.removeItem(query.storageKey);
      });
      queriesByIdMap.update((map) => {
        map.clear();
        return map;
      });
    },
    clearAllCache(): void {
      this.clearAllQueriesById();
      this.clearAllQueries();

      // Also remove entries restored from a previous application lifetime.
      // The global handler delegates here so cleanup follows the selected
      // storage backend instead of reaching for browser storage directly.
      const keysToRemove: string[] = [];
      const storageLength = storage.length();

      for (let index = 0; index < storageLength; index++) {
        const keyName = storage.key(index);
        if (keyName?.startsWith('craft-ts-')) {
          keysToRemove.push(keyName);
        }
      }

      keysToRemove.forEach((keyName) => storage.removeItem(keyName));
    },
  };
}

type QueryByIdStored = {
  queryParams: any;
  queryByIdValue: Record<
    string,
    {
      params: any;
      value: any;
      /**
       * Use it when the resource was loading and didn't finish before the app was closed
       */
      reloadOnMount: boolean;
      timestamp: number;
    }
  >;
  /**
   * Newest timestamp of the stored value
   */
  timestamp: number;
};

function getStorageKey(prefix: string, key: string, type: string) {
  return `craft-ts-${prefix}-${type}-${key}`;
}

function getPersisterMapKey(prefix: string, key: string): string {
  return `${prefix}\u0000${key}`;
}

function isValueExpired(timestamp: number, cacheTime: number): boolean {
  return Date.now() - timestamp > cacheTime;
}

function removeNotValidRecordsWithValidCacheTime(
  storageKey: string,
  storedValue: QueryByIdStored | undefined,
  cacheTime: number,
  storage: StorageServiceApi,
): QueryByIdStored | undefined {
  if (!storedValue) {
    return undefined;
  }
  const { queryByIdValue, timestamp } = storedValue;

  if (timestamp && cacheTime > 0 && isValueExpired(timestamp, cacheTime)) {
    // remove from storage
    storage.removeItem(storageKey);
    return undefined;
  }

  const validQueryByIdValue = Object.entries(queryByIdValue).reduce(
    (acc, [key, value]) => {
      const isValueExpiredResult = isValueExpired(value.timestamp, cacheTime);
      if (!isValueExpiredResult) {
        acc[key] = value;
      }
      return acc;
    },
    {} as QueryByIdStored['queryByIdValue']
  );

  // update local storage
  storage.setItem(
    storageKey,
    JSON.stringify({
      ...storedValue,
      queryByIdValue: validQueryByIdValue,
    })
  );

  return {
    ...storedValue,
    queryByIdValue: validQueryByIdValue,
  };
}

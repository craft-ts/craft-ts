import {
  effect,
  inject,
  Injector,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';

import type { StorageServiceApi } from './browser-boundaries';
import { isEqual } from './util/persister.util';
import {
  PersistedQuery,
  PersistedQueryById,
  QueriesPersister,
} from './util/persister.type';
import { nestedEffect } from './util/types/util';
import { ResourceByIdRef } from './resource-by-id';

function globalStorageAdapter(): StorageServiceApi {
  return {
    getItem: (key) => globalThis.localStorage.getItem(key),
    setItem: (key, value) => globalThis.localStorage.setItem(key, value),
    removeItem: (key) => globalThis.localStorage.removeItem(key),
    clear: () => globalThis.localStorage.clear(),
    key: (index) => globalThis.localStorage.key(index),
    length: () => globalThis.localStorage.length,
  };
}

export function localStoragePersister(
  prefix: string,
  storage: StorageServiceApi = globalStorageAdapter(),
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

  const newQueryKeysForNestedEffect = linkedSignal<
    any,
    { newKeys: string[] } | undefined
  >({
    source: queriesMap,
    computation: (currentSource, previous) => {
      if (!currentSource || !Array.from(currentSource.keys()).length) {
        return undefined;
      }

      const currentKeys = Array.from(currentSource.keys());
      const previousKeys = Array.from(previous?.source?.keys() || []);
      // Find keys that exist in current but not in previous
      const newKeys = currentKeys.filter(
        (key) => !previousKeys.includes(key)
      ) as string[];
      return newKeys.length > 0 ? { newKeys } : previous?.value;
    },
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
        const waitForParamsSrcToBeEqualToPreviousValueEffect = nestedEffect(
          _injector,
          () => {
            const { queryResourceParamsSrc, storageKey, queryResource, staleTime, validate } = data;
            const params = queryResourceParamsSrc();
            if (params === undefined) {
              return;
            }
            const storedValue = storage.getItem(storageKey);
            if (!storedValue) {
              waitForParamsSrcToBeEqualToPreviousValueEffect.destroy();
              return;
            }
            try {
              const { queryValue, queryParams, timestamp } =
                JSON.parse(storedValue);

              if (validate && !validate(queryValue)) {
                storage.removeItem(storageKey);
                waitForParamsSrcToBeEqualToPreviousValueEffect.destroy();
                return;
              }

              // Check if cache is expired
              if (
                timestamp &&
                data.cacheTime > 0 &&
                isValueExpired(timestamp, data.cacheTime)
              ) {
                storage.removeItem(storageKey);
                waitForParamsSrcToBeEqualToPreviousValueEffect.destroy();
                return;
              }

              const isEqualParams = isEqual(params, queryParams);
              if (!isEqualParams) {
                storage.removeItem(storageKey);
                waitForParamsSrcToBeEqualToPreviousValueEffect.destroy();
                return;
              }
              if (isEqualParams) {
                queryResource.set(queryValue);
                if (staleTime !== undefined && timestamp && isValueExpired(timestamp, staleTime)) {
                  queryResource.reload();
                }
              }
              waitForParamsSrcToBeEqualToPreviousValueEffect.destroy();
            } catch (e) {
              console.error('Error parsing stored value from localStorage', e);
              waitForParamsSrcToBeEqualToPreviousValueEffect.destroy();
              return;
            }
          }
        );
      }
    });
  });

  const newQueryByIdKeysForNestedEffect = linkedSignal<
    any,
    { newKeys: string[] } | undefined
  >({
    source: queriesByIdMap,
    computation: (currentSource, previous) => {
      if (!currentSource || !Array.from(currentSource.keys()).length) {
        return undefined;
      }

      const currentKeys = Array.from(currentSource.keys());
      const previousKeys = Array.from(previous?.source?.keys() || []);
      const newKeys = currentKeys.filter(
        (key) => !previousKeys.includes(key)
      ) as string[];
      return newKeys.length > 0 ? { newKeys } : previous?.value;
    },
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

        const newRecordInQueryByIdForNestedEffect = linkedSignal<
          any,
          { newKeys: string[] } | undefined
        >({
          source: queryByIdResource,
          computation: (
            currentSource: ReturnType<
              ResourceByIdRef<string, unknown, unknown>
            >,
            previous
          ) => {
            if (!currentSource || !Object.keys(currentSource).length) {
              return undefined;
            }

            const currentKeys = Object.keys(currentSource);
            const previousKeys = Array.from(previous?.source?.keys() || []);
            const newKeys = currentKeys.filter(
              (key) => !previousKeys.includes(key)
            ) as string[];
            return newKeys.length > 0 ? { newKeys } : previous?.value;
          },
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
        queryResource,
        queryResourceParamsSrc,
        waitForParamsSrcToBeEqualToPreviousValue,
        cacheTime,
        staleTime,
        validate,
      } = data;

      const storageKey = getStorageKey(prefix, key, 'resource');
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
        map.set(key, {
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
      const { key, queryByIdResource, queryResourceParamsSrc, cacheTime, staleTime, validate } =
        data;

      const storageKey = getStorageKey(prefix, key, 'resourceById');
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
        map.set(key, {
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
        map.delete(queryKey);
        storage.removeItem(getStorageKey(prefix, queryKey, 'resource'));
        return map;
      });
    },

    clearQueryBy(queryByIdKey: string): void {
      queriesByIdMap.update((map) => {
        map.delete(queryByIdKey);
        storage.removeItem(
          getStorageKey(prefix, queryByIdKey, 'resourceById')
        );
        return map;
      });
    },

    clearAllQueries(): void {
      queriesMap().forEach((_, key) => {
        storage.removeItem(getStorageKey(prefix, key, 'resource'));
      });
      queriesMap.update((map) => {
        map.clear();
        return map;
      });
    },

    clearAllQueriesById(): void {
      queriesByIdMap().forEach((_, key) => {
        storage.removeItem(getStorageKey(prefix, key, 'resourceById'));
      });
      queriesByIdMap.update((map) => {
        map.clear();
        return map;
      });
    },
    clearAllCache(): void {
      this.clearAllQueriesById();
      this.clearAllQueries();
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
  return `ng-craft-${prefix}-${type}-${key}`;
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

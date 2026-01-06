import { ResourceRef, Signal } from '@angular/core';
import { ResourceByIdRef } from '../resource-by-id';

export interface PersistedQuery {
  key: string;
  queryResource: ResourceRef<any>;
  queryResourceParamsSrc: Signal<unknown>;
  waitForParamsSrcToBeEqualToPreviousValue: boolean;
  cacheTime: number;
}

export interface PersistedQueryById {
  key: string;
  queryByIdResource: ResourceByIdRef<string, unknown, unknown>;
  queryResourceParamsSrc: Signal<unknown>;
  cacheTime: number;
}

export interface QueriesPersister {
  addQueryToPersist(data: PersistedQuery): void;
  addQueryByIdToPersist(data: PersistedQueryById): void;
  clearQuery(queryKey: string): void;
  clearQueryBy(queryKey: string): void;
  clearAllQueries(): void;
  clearAllQueriesById(): void;
  clearAllCache(): void;
}

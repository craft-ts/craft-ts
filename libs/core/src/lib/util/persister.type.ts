import { ResourceRef, Signal } from '@angular/core';
import { ResourceByIdRef } from '../resource-by-id';

export interface PersistedQuery {
  key: string;
  queryResource: ResourceRef<any>;
  queryResourceParamsSrc: Signal<unknown>;
  waitForParamsSrcToBeEqualToPreviousValue: boolean;
  cacheTime: number;
  /** Time in ms after which cached data is restored but a reload() is triggered in background (SWR pattern). Must be less than cacheTime. */
  staleTime?: number;
  /** Called on the deserialized value before restoring it. Return false to discard and reload fresh. */
  validate?: (value: unknown) => boolean;
}

export interface PersistedQueryById {
  key: string;
  queryByIdResource: ResourceByIdRef<string, unknown, unknown>;
  queryResourceParamsSrc: Signal<unknown>;
  cacheTime: number;
  /** Time in ms after which cached data is restored but a reload() is triggered in background (SWR pattern). Must be less than cacheTime. */
  staleTime?: number;
  /** Called on the deserialized value before restoring it. Return false to discard and reload fresh. */
  validate?: (value: unknown) => boolean;
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

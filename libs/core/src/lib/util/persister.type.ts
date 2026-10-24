import { ResourceStatus, Signal } from '../host/craft-compat';
import { ResourceByIdRef } from '../resource-by-id';
import type { PersistedStorageSnapshotEntry } from '../persisted-storage-snapshot';

/**
 * The resource surface the persister actually drives: it reads `status` and
 * `value`, restores a cached value with `set`, and can trigger a background
 * reload. The `CraftResourceRef` produced by `craftResource(...)` and `query(...)` — what
 * `craftResource(...)`/`query(...)` produce — satisfy it.
 */
export interface PersistedQueryResource {
  value: Signal<unknown>;
  status: Signal<ResourceStatus>;
  set(value: any): void;
  reload(): boolean;
}

export interface PersistedQuery {
  key: string;
  /** Optional per-insertion namespace; defaults to the persister namespace. */
  storeName?: string;
  queryResource: PersistedQueryResource;
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
  /** Optional per-insertion namespace; defaults to the persister namespace. */
  storeName?: string;
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
  /** Captures the registered persisted query values without scanning the backend. */
  capturePersistedValues?():
    | readonly PersistedStorageSnapshotEntry[]
    | Promise<readonly PersistedStorageSnapshotEntry[]>;
  restorePersistedValues?(
    entries: readonly PersistedStorageSnapshotEntry[],
  ): void | Promise<void>;
}

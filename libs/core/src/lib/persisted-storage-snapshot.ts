import { ɵcraftValueService } from './craft-service';
import type { QueriesPersister } from './util/persister.type';

/** A value that a Craft persister can expose to a debug-session snapshot. */
export type PersistedStorageSnapshotEntry = Readonly<{
  backend: string;
  storeName: string;
  key: string;
  kind: 'query' | 'queryById';
  resourceId?: string;
  queryParams?: unknown;
  value: unknown;
  timestamp?: number;
}>;

export type PersistedStorageSnapshotReader = Readonly<{
  capturePersistedValues?():
    | readonly PersistedStorageSnapshotEntry[]
    | Promise<readonly PersistedStorageSnapshotEntry[]>;
  restorePersistedValues?(
    entries: readonly PersistedStorageSnapshotEntry[],
  ): void | Promise<void>;
}>;

class PersistedStorageSnapshotRegistryState {
  private readonly readers = new Set<PersistedStorageSnapshotReader>();
  private readonly readListeners = new Set<
    (entry: PersistedStorageSnapshotEntry) => void
  >();

  register(persister: QueriesPersister): void {
    this.readers.add(persister);
  }

  onRead(listener: (entry: PersistedStorageSnapshotEntry) => void): () => void {
    this.readListeners.add(listener);
    return () => this.readListeners.delete(listener);
  }

  recordRead(entry: PersistedStorageSnapshotEntry): void {
    for (const listener of this.readListeners) {
      try {
        listener(entry);
      } catch {
        // Diagnostics must never change application behavior.
      }
    }
  }

  async capture(): Promise<readonly PersistedStorageSnapshotEntry[]> {
    const snapshots = await Promise.all(
      [...this.readers].map(async (reader) => {
        try {
          return (await reader.capturePersistedValues?.()) ?? [];
        } catch {
          return [];
        }
      }),
    );
    return snapshots.flat();
  }

  async restore(
    entries: readonly PersistedStorageSnapshotEntry[],
  ): Promise<void> {
    await Promise.all(
      [...this.readers].map((reader) =>
        reader.restorePersistedValues?.(entries),
      ),
    );
  }
}

const persistedStorageSnapshotRegistryService = ɵcraftValueService(
  { name: 'PersistedStorageSnapshotRegistry', providedIn: 'global' },
  () => new PersistedStorageSnapshotRegistryState(),
) as unknown as {
  PersistedStorageSnapshotRegistry: () => Generator<
    never,
    PersistedStorageSnapshotRegistryState,
    unknown
  >;
  PERSISTED_STORAGE_SNAPSHOT_REGISTRY_META_DATA: {
    inject(): PersistedStorageSnapshotRegistryState;
  };
};

export const PersistedStorageSnapshotRegistry =
  persistedStorageSnapshotRegistryService.PersistedStorageSnapshotRegistry;

export const ɵinjectPersistedStorageSnapshotRegistry =
  (): PersistedStorageSnapshotRegistryState =>
    persistedStorageSnapshotRegistryService.PERSISTED_STORAGE_SNAPSHOT_REGISTRY_META_DATA.inject();

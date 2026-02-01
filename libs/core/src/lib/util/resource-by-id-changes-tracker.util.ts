import { computed, linkedSignal, Signal } from '@angular/core';
import { CraftResourceRef } from './craft-resource-ref';

export type ResourceStatus =
  | 'resolved'
  | 'error'
  | 'loading'
  | 'reloading'
  | 'idle'
  | 'local';

type FullResourceStatusSnapshot<GroupIdentifier extends string> = Map<
  GroupIdentifier,
  { status: ResourceStatus; value: unknown }
>;

export type resourceByIdChangesTrackerResult<GroupIdentifier extends string> = {
  hasChange: Signal<boolean>;
  ids: Signal<GroupIdentifier[]>;
  resolved: Signal<GroupIdentifier[]>;
  loading: Signal<GroupIdentifier[]>;
  reloading: Signal<GroupIdentifier[]>;
  error: Signal<GroupIdentifier[]>;
  onlyValueChange: Signal<GroupIdentifier[]>;
};

type ChangesByStatus<GroupIdentifier extends string> = {
  ids: GroupIdentifier[];
  resolved: GroupIdentifier[];
  loading: GroupIdentifier[];
  reloading: GroupIdentifier[];
  error: GroupIdentifier[];
  onlyValueChange: GroupIdentifier[];
};

/**
 * Tracks the status and value changes of resources in a ResourceByIdRef.
 * Returns an object with signals for:
 * - hasChange: true when any ID has changed status or value
 * - ids: all IDs that changed (status or value)
 * - resolved: IDs that transitioned to 'resolved' status
 * - loading: IDs that transitioned to 'loading' status
 * - reloading: IDs that transitioned to 'reloading' status
 * - error: IDs that transitioned to 'error' status
 * - onlyValueChange: IDs where only the value changed (status stayed the same)
 *
 * @param resourceByIdSignal - The signal containing the resource map to track
 * @returns An object with signals for different change types
 */
export function resourceByIdChangesTracker<
  GroupIdentifier extends string,
  State,
  ResourceParams,
>(
  resourceByIdSignal: Signal<
    Partial<Record<GroupIdentifier, CraftResourceRef<State, ResourceParams>>>
  >,
): resourceByIdChangesTrackerResult<GroupIdentifier> {
  const changes = linkedSignal<
    FullResourceStatusSnapshot<GroupIdentifier>,
    ChangesByStatus<GroupIdentifier>
  >({
    source: () => getFullStatusSnapshot(resourceByIdSignal()),
    computation: (currentSnapshot, previous) => {
      const emptyChanges: ChangesByStatus<GroupIdentifier> = {
        ids: [],
        resolved: [],
        loading: [],
        reloading: [],
        error: [],
        onlyValueChange: [],
      };

      if (!previous) {
        // First read - return empty arrays
        return emptyChanges;
      }

      const previousSnapshot = previous.source;
      const result: ChangesByStatus<GroupIdentifier> = {
        ids: [],
        resolved: [],
        loading: [],
        reloading: [],
        error: [],
        onlyValueChange: [],
      };

      // Find IDs that changed status or value
      for (const [id, current] of currentSnapshot.entries()) {
        const prev = previousSnapshot.get(id);
        const statusChanged = prev?.status !== current.status;
        const valueChanged = prev?.value !== current.value;

        if (statusChanged || valueChanged) {
          result.ids.push(id);

          if (statusChanged) {
            // Add to the appropriate status array
            if (current.status === 'resolved' || current.status === 'local') {
              result.resolved.push(id);
            } else if (current.status === 'loading') {
              result.loading.push(id);
            } else if (current.status === 'reloading') {
              result.reloading.push(id);
            } else if (current.status === 'error') {
              result.error.push(id);
            }
          } else if (valueChanged) {
            // Only value changed, not status
            result.onlyValueChange.push(id);
          }
        }
      }

      return result;
    },
  });

  return {
    hasChange: computed(() => changes().ids.length > 0),
    ids: computed(() => changes().ids),
    resolved: computed(() => changes().resolved),
    loading: computed(() => changes().loading),
    reloading: computed(() => changes().reloading),
    error: computed(() => changes().error),
    onlyValueChange: computed(() => changes().onlyValueChange),
  };
}

function getFullStatusSnapshot<
  GroupIdentifier extends string,
  State,
  ResourceParams,
>(
  resources: Partial<
    Record<GroupIdentifier, CraftResourceRef<State, ResourceParams>>
  >,
): FullResourceStatusSnapshot<GroupIdentifier> {
  const snapshot = new Map<
    GroupIdentifier,
    { status: ResourceStatus; value: unknown }
  >();

  for (const [id, resourceRef] of Object.entries(resources) as [
    GroupIdentifier,
    CraftResourceRef<State, ResourceParams> | undefined,
  ][]) {
    if (!resourceRef) continue;
    snapshot.set(id, {
      status: resourceRef.status(),
      value: resourceRef.hasValue() ? resourceRef.value() : undefined,
    });
  }

  return snapshot;
}

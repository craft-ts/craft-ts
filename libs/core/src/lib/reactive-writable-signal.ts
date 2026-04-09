import { linkedSignal, untracked, WritableSignal } from '@angular/core';

/**
 * Options to control when a sync reaction callback is executed.
 */
type SyncOptions = {
  /**
   * If `true`, the callback is executed only during initialization
   * and will be ignored on subsequent source changes.
   */
  onInitOnly?: boolean;
  /**
   * If `true`, the callback is executed during initialization
   * AND on subsequent source changes.
   */
  onInitToo?: boolean;
};

/**
 * Creates a writable signal that reacts to changes in other signals (sources).
 *
 * Built on top of Angular's `linkedSignal`, it compares source references to determine
 * if a reaction callback should be called. When a source's reference changes (`!==`),
 * the associated callback is executed with the new value and the current state.
 *
 * **Important:** During the same reactive cycle, multiple callbacks can be triggered.
 * The order of reactions in the object matters - callbacks are executed in declaration order.
 * Place reactions that should run first at the top.
 *
 * @param initialValue - The initial value of the signal
 * @param reactionBuilder - A function that receives a `sync` helper and returns an object
 *   of named reactions. Each reaction defines a source signal and a computation callback.
 *
 * @returns A `WritableSignal` that can be read, set, or updated manually, while also
 *   reacting to source changes.
 *
 * @example
 * ```typescript
 * const selectedRows = reactiveWritableSignal([] as string[], (sync) => ({
 *   resetOnPageResolved: sync(
 *     pageStatus, // Signal<ResourceStatus>
 *     ({ params, current }) => (params === 'resolved' ? [] : current),
 *   ),
 *   removeDeleted: sync(
 *     deletedIds, // Signal<string[]>
 *     ({ params, current }) => current.filter(id => !params.includes(id)),
 *   ),
 * }));
 * ```
 *
 * @see SyncOptions for `onInitOnly` and `onInitToo` options
 */
type ReactionEntry<State, Params> = {
  source: () => Params;
  computation: (payload: {
    params: NoInfer<Params>;
    current: NoInfer<State>;
  }) => NoInfer<State>;
  options?: SyncOptions;
};

type SourcesSnapshot = Map<string, unknown>;

export function reactiveWritableSignal<State>(
  initialValue: State,
  reactionBuilder: (
    sync: <Params>(
      source: () => Params,
      computation: (payload: {
        params: NoInfer<Params>;
        current: NoInfer<State>;
      }) => NoInfer<State>,
      options?: SyncOptions,
    ) => ReactionEntry<NoInfer<State>, NoInfer<Params>>,
  ) => Record<string, ReactionEntry<NoInfer<State>, any>>,
): WritableSignal<State> {
  // Helper function to create reaction entries
  const sync = <Params>(
    source: () => Params,
    computation: (payload: {
      params: NoInfer<Params>;
      current: NoInfer<State>;
    }) => NoInfer<State>,
    options?: SyncOptions,
  ): ReactionEntry<State, Params> => ({
    source,
    computation,
    options,
  });

  // Build all reactions
  const reactions = reactionBuilder(sync);

  // Create a snapshot of all source values
  const getSourcesSnapshot = (): SourcesSnapshot => {
    const snapshot = new Map<string, unknown>();
    for (const [name, reaction] of Object.entries(reactions)) {
      snapshot.set(name, reaction.source());
    }
    return snapshot;
  };

  // Use linkedSignal to track source changes
  const sig = linkedSignal<SourcesSnapshot, State>({
    source: getSourcesSnapshot,
    computation: (currentSnapshot, previous) => {
      const isInitialization = !previous;
      let currentState = isInitialization ? initialValue : previous.value;
      const previousSnapshot = previous?.source;

      untracked(() => {
        // Check which sources changed (by reference) and run their computations
        for (const [name, reaction] of Object.entries(reactions)) {
          const currentValue = currentSnapshot.get(name);
          const previousValue = previousSnapshot?.get(name);
          const options = reaction.options;

          const hasSourceChanged = currentValue !== previousValue;

          // Determine if we should run the computation
          let shouldRun = false;

          if (isInitialization) {
            // During initialization: run if onInitOnly or onInitToo
            if (options?.onInitOnly || options?.onInitToo) {
              shouldRun = true;
            }
          } else {
            // After initialization: run if source changed AND not onInitOnly
            if (hasSourceChanged && !options?.onInitOnly) {
              shouldRun = true;
            }
          }

          if (shouldRun) {
            currentState = reaction.computation({
              params: currentValue,
              current: currentState,
            });
          }
        }
      });

      return currentState;
    },
  });

  return sig;
}

import { craftComputed, craftService, state } from '@craft-ts/core';

/**
 * Which sessions the list shows: the ones a person recorded, the ones the
 * resume tooling recorded (guided resumes, recipe runs), or all of them. Kept
 * here so the choice survives the list's refreshes.
 */
export type SessionListView = 'recordings' | 'derived' | 'all';

/** The recordings first: the list a person comes for. */
function defaultView(): SessionListView {
  return 'recordings';
}

export const { SessionResumeFilter } = craftService(
  { name: 'sessionResumeFilter', providedIn: 'global' },
  function* () {
    yield* state('filter', defaultView(), function* ({ state: read, set }) {
      const view = yield* craftComputed('view', function* () {
        return yield* read();
      });
      return {
        view,
        show: function* (next: SessionListView) {
          yield* set(next);
        },
      };
    });
  },
);

import {
  craftComputed,
  craftExpose,
  craftService,
  state,
} from '@craft-ts/core';

/** Keeps the session-list filter while the page refreshes its archive data. */
export const { SessionResumeFilter } = craftService(
  { name: 'sessionResumeFilter', providedIn: 'global' },
  function* () {
    const filter = yield* state(
      'onlySessionsWithResumes',
      false,
      function* ({ state: read, set }) {
        const enabled = yield* craftComputed('enabled', function* () {
          return yield* read();
        });
        return {
          enabled,
          toggle: function* () {
            yield* set(!(yield* read()));
          },
        };
      },
    );

    yield* craftExpose('enabled', filter.enabled);
    yield* craftExpose('toggle', filter.toggle);
  },
);

import {
  CraftHttpClient,
  craftService,
  query,
  rawReactiveValue,
  // Query insertion helpers return a host computed signal.
  // eslint-disable-next-line craft-ts/no-direct-craft-reactivity
  ɵcomputed as computed,
} from '@craft-ts/core';
import { behaviorCoverageDecoder } from '../util/behavior-coverage';

const SESSION_ARCHIVE_URL =
  import.meta.env['VITE_CRAFT_SESSION_ARCHIVE_URL'] ?? 'http://127.0.0.1:4319';

/**
 * The coverage of the apps the archive was started for
 * (`CRAFT_BEHAVIOR_APPS`): read when the coverage page opens, not on a timer —
 * the archive looks through every recorded session to answer.
 */
export const { BehaviorCoverageArchive } = craftService(
  { name: 'behaviorCoverageArchive', providedIn: 'global' },
  function* () {
    yield* query(
      'coverage',
      {
        method: (requested: number) => requested,
        loader: function* () {
          return yield* CraftHttpClient.get(({ response }) => ({
            url: `${SESSION_ARCHIVE_URL}/sessions/behavior-coverage`,
            success: response(behaviorCoverageDecoder),
          }));
        },
      },
      ({ state, resource, hasException }) => ({
        coverageApps: computed(() => rawReactiveValue(state)() ?? []),
        coverageLoading: computed(
          () => rawReactiveValue(resource.isLoading)(),
        ),
        coverageUnreachable: computed(() => rawReactiveValue(hasException)()),
      }),
    );
  },
);

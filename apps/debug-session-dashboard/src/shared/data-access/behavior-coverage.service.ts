import { CraftHttpClient, craftComputed, craftService, query } from '@craft-ts/core';
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
    const coverage = yield* query(
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
      () => ({}),
    );
    yield* craftComputed('coverageApps', function* () {
      return (yield* coverage.value()) ?? [];
    });
    yield* craftComputed('coverageLoading', function* () {
      return yield* coverage.isLoading();
    });
    yield* craftComputed('coverageUnreachable', function* () {
      return yield* coverage.hasException();
    });
  },
);

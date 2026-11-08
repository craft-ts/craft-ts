import {
  CraftHttpClient,
  craftComputed,
  craftService,
  query,
  rawReactiveValue,
  state,
} from '@craft-ts/core';
import {
  goldenSuiteDecoder,
  suiteOrigins,
  suiteRunDecoder,
} from '../util/golden-suite';
import { SessionArchive } from './session-archive.service';

const SESSION_ARCHIVE_URL =
  import.meta.env['VITE_CRAFT_SESSION_ARCHIVE_URL'] ?? 'http://127.0.0.1:4319';

/**
 * An app's regression suite as the archive proposes it, and the replay of one
 * of its sessions as the suite runs it. Read when the suite page opens (the
 * archive looks through every recorded session), for the app chosen there or,
 * by default, the one recorded last.
 */
export const { GoldenSuiteArchive } = craftService(
  { name: 'goldenSuiteArchive', providedIn: 'global' },
  function* () {
    const archive = yield* SessionArchive();
    const savedSessions = rawReactiveValue(archive.sessions.savedSessions);
    const suiteOriginList = yield* craftComputed('suiteOriginList', () =>
      suiteOrigins(savedSessions()),
    );

    // Each opening of the page asks again; 0 until it is opened once.
    const suiteOpenings = yield* state('suiteOpenings', 0, function* ({ state: read, update }) {
      return {
        openings: yield* craftComputed('openings', function* () {
          return yield* read();
        }),
        open: function* () {
          yield* update((count) => count + 1);
        },
      };
    });
    // The app chosen on the page, or by default the one recorded last.
    const chosenOrigin = yield* state('chosenOrigin', '', function* ({ state: read, set }) {
      return {
        effective: yield* craftComputed('effective', function* () {
          const chosen = yield* read();
          const origins = yield* suiteOriginList();
          return chosen && origins.includes(chosen) ? chosen : (origins[0] ?? '');
        }),
        choose: function* (origin: string) {
          yield* set(origin);
        },
      };
    });

    yield* query(
      'suite',
      {
        params: function* () {
          const opened = yield* suiteOpenings.openings();
          const origin = yield* chosenOrigin.effective();
          return opened > 0 && origin ? { origin, opened } : undefined;
        },
        loader: function* ({ params }) {
          return yield* CraftHttpClient.post(({ response }) => ({
            url: `${SESSION_ARCHIVE_URL}/sessions/golden-set`,
            payload: { origin: params?.origin ?? '' },
            success: response(goldenSuiteDecoder),
          }));
        },
      },
      function* ({ resource, hasException }) {
        return {
          goldenSuite: yield* craftComputed('goldenSuite', function* () {
            return yield* resource.value();
          }),
          suiteLoading: yield* craftComputed('suiteLoading', function* () {
            return yield* resource.isLoading();
          }),
          suiteUnreachable: yield* craftComputed('suiteUnreachable', function* () {
            return yield* hasException();
          }),
          origins: suiteOriginList,
        };
      },
    );

    // A replay changes nothing the archive keeps: asked for, not written.
    // One request for one session or the whole suite: the archive replays
    // them one after the other and answers once they are all done.
    yield* query(
      'suiteRun',
      {
        method: (sessionIds: readonly string[]) => sessionIds,
        loader: function* ({ params: sessionIds }) {
          return yield* CraftHttpClient.post(({ response }) => ({
            url: `${SESSION_ARCHIVE_URL}/sessions/suite-replay`,
            payload: { sessionIds },
            success: response(suiteRunDecoder),
          }));
        },
      },
      function* ({ resource, hasException }) {
        return {
          lastRun: yield* craftComputed('lastRun', function* () {
            return yield* resource.value();
          }),
          replaying: yield* craftComputed('replaying', function* () {
            return yield* resource.isLoading();
          }),
          replayUnreachable: yield* craftComputed('replayUnreachable', function* () {
            return yield* hasException();
          }),
        };
      },
    );
  },
);


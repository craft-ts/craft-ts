import {
  CraftHttpClient,
  craftComputed,
  craftExpose,
  craftService,
  insertQueryPipe,
  insertReactOnMutation,
  mutation,
  query,
  rawReactiveValue,
  state,
} from '@craft-ts/core';
import {
  goldenSuiteDecoder,
  sessionsCheckApprovalDecoder,
  sessionsCheckDecoder,
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

    // A person approves the change the last check found in a session: the
    // archive has the check's own command write it to the register.
    const approveChange = yield* mutation(
      'approveChange',
      {
        method: (request: Readonly<{ origin: string; sessionId: string }>) => request,
        loader: function* ({ params }) {
          return yield* CraftHttpClient.post(({ response }) => ({
            url: `${SESSION_ARCHIVE_URL}/sessions/check/approve`,
            payload: { origin: params.origin, sessionId: params.sessionId },
            success: response(sessionsCheckApprovalDecoder),
          }));
        },
      },
      function* ({ resource, hasException }) {
        return {
          approving: yield* craftComputed('approving', function* () {
            return yield* resource.isLoading();
          }),
          // Refused by the command (a regression, a check run again since),
          // or the archive did not answer.
          approveFailed: yield* craftComputed('approveFailed', function* () {
            return yield* hasException();
          }),
        };
      },
    );
    yield* craftExpose('approveCheckedChange', function* (origin: string, sessionId: string) {
      yield* approveChange.mutate({ origin, sessionId });
    });

    // The last base-against-head check of the app (`npm run sessions:check`),
    // read again once a change is approved.
    yield* query(
      'lastCheck',
      {
        params: function* () {
          const opened = yield* suiteOpenings.openings();
          const origin = yield* chosenOrigin.effective();
          return opened > 0 && origin ? { origin, opened } : undefined;
        },
        loader: function* ({ params }) {
          return yield* CraftHttpClient.get(({ response }) => ({
            url: `${SESSION_ARCHIVE_URL}/sessions/check?origin=${encodeURIComponent(params?.origin ?? '')}`,
            success: response(sessionsCheckDecoder),
          }));
        },
      },
      insertQueryPipe(
        function* ({ resource }) {
          return {
            check: yield* craftComputed('check', function* () {
              return yield* resource.value();
            }),
          };
        },
        insertReactOnMutation(approveChange, { reload: { onMutationResolved: true } }),
      ),
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


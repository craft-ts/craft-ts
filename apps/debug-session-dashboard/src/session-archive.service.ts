import {
  CraftHttpClient,
  CraftTemporalRuntime,
  craftComputed,
  craftService,
  insertReactOnMutation,
  mutation,
  query,
  source$,
} from '@craft-ts/core';
import { isRecord } from './replay-model';

const SESSION_ARCHIVE_URL =
  import.meta.env['VITE_CRAFT_SESSION_ARCHIVE_URL'] ?? 'http://127.0.0.1:4319';

/** How often the list asks the archive again. */
const REFRESH_EVERY_MS = 2000;

export type SessionSummary = Readonly<{
  id: string;
  startUrl: string;
  createdAt: string;
  updatedAt: string;
  status: 'recording' | 'completed' | 'interrupted';
  version: 2;
  eventCount: number;
  truncated: boolean;
  participantCount?: number;
}>;

type SessionList = Readonly<{ sessions: readonly SessionSummary[] }>;

function isSessionSummary(value: unknown): value is SessionSummary {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['startUrl'] === 'string' &&
    typeof value['createdAt'] === 'string' &&
    typeof value['updatedAt'] === 'string' &&
    (value['status'] === 'recording' ||
      value['status'] === 'completed' ||
      value['status'] === 'interrupted') &&
    typeof value['eventCount'] === 'number' &&
    typeof value['truncated'] === 'boolean'
  );
}

/** The archive answers `{ sessions }`; anything else is an empty archive. */
const sessionListDecoder = {
  decode(input: unknown): SessionList {
    const sessions = isRecord(input) ? input['sessions'] : undefined;
    return { sessions: Array.isArray(sessions) ? sessions.filter(isSessionSummary) : [] };
  },
};

/** A session as the archive stores it: the export, which the engine validates. */
type ArchivedSession = Readonly<Record<string, unknown>>;

const archivedSessionDecoder = {
  decode(input: unknown): ArchivedSession {
    return isRecord(input) ? input : {};
  },
};

/** Why a request to the archive failed, in a few words. */
export function httpFailureReason(exception: unknown): string {
  const payload = isRecord(exception) ? exception['payload'] : undefined;
  const failure = isRecord(payload) ? payload['error'] : undefined;
  const status = isRecord(failure) ? failure['status'] : undefined;
  return typeof status === 'number' && status > 0
    ? `HTTP ${status}`
    : 'serveur d’archive injoignable';
}

/**
 * The local archive of recorded sessions: the list the sessions page shows,
 * refreshed on a timer, the deletion of one, and the load of one. Every call
 * goes through the Craft HTTP transport; the timer is the Craft temporal
 * runtime's, so it ends with the service.
 */
export const { SessionArchive } = craftService(
  { name: 'sessionArchive', providedIn: 'global' },
  function* () {
    const temporal = yield* CraftTemporalRuntime();

    let refreshCount = 0;
    const refreshRequested$ = source$<number>('refreshRequested$');

    const deleteSession = yield* mutation('deleteSession', {
      method: (id: string) => id,
      loader: function* ({ params: id }) {
        return yield* CraftHttpClient.delete(({ response }) => ({
          url: `${SESSION_ARCHIVE_URL}/sessions/${encodeURIComponent(id)}`,
          success: response<unknown>(),
        }));
      },
    });

    const sessions = yield* query(
      'sessions',
      {
        method: refreshRequested$.value,
        loader: function* () {
          return yield* CraftHttpClient.get(({ response }) => ({
            url: `${SESSION_ARCHIVE_URL}/sessions`,
            success: response(sessionListDecoder),
          }));
        },
      },
      insertReactOnMutation(deleteSession, {
        reload: { onMutationResolved: true },
      }),
    );

    yield* query(
      'archived',
      {
        method: (id: string) => id,
        loader: function* ({ params: id }) {
          return yield* CraftHttpClient.get(({ response }) => ({
            url: `${SESSION_ARCHIVE_URL}/sessions/${encodeURIComponent(id)}`,
            success: response(archivedSessionDecoder),
          }));
        },
      },
      () => ({}),
    );

    yield* craftComputed('savedSessions', function* () {
      return (yield* sessions.value())?.sessions ?? [];
    });
    yield* craftComputed('reachable', function* () {
      return !(yield* sessions.hasException());
    });

    const refreshAgain = () => {
      refreshRequested$.emit(++refreshCount);
      temporal.schedule(refreshAgain, REFRESH_EVERY_MS, {
        owner: 'session-archive',
      });
    };
    refreshAgain();
  },
);

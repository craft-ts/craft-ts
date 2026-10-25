import {
  CraftHttpClient,
  CraftTemporalRuntime,
  craftComputed,
  craftExpose,
  craftService,
  insertReactOnMutation,
  mutation,
  query,
  source$,
} from '@craft-ts/core';
import { isRecord } from './replay-model';
import type { ResumeProfile } from './replay-model';

export const SESSION_ARCHIVE_URL =
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
  recordingVersion: number;
  replayVersion: number;
  eventCount: number;
  truncated: boolean;
  participantCount?: number;
}>;

type SessionList = Readonly<{
  sessions: readonly SessionSummary[];
  retentionDays: number;
  storageBytes: number;
}>;

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
    typeof value['recordingVersion'] === 'number' &&
    typeof value['replayVersion'] === 'number' &&
    typeof value['truncated'] === 'boolean'
  );
}

/** The archive answers `{ sessions }`; anything else is an empty archive. */
const sessionListDecoder = {
  decode(input: unknown): SessionList {
    const sessions = isRecord(input) ? input['sessions'] : undefined;
    const retentionDays = isRecord(input) ? input['retentionDays'] : undefined;
    const storageBytes = isRecord(input) ? input['storageBytes'] : undefined;
    return {
      sessions: Array.isArray(sessions)
        ? sessions.filter(isSessionSummary)
        : [],
      retentionDays:
        typeof retentionDays === 'number' && retentionDays > 0
          ? retentionDays
          : 30,
      storageBytes:
        typeof storageBytes === 'number' && Number.isFinite(storageBytes)
          ? Math.max(0, storageBytes)
          : 0,
    };
  },
};

const pruneResultDecoder = {
  decode(input: unknown): Readonly<{ deleted: number }> {
    return {
      deleted:
        isRecord(input) && typeof input['deleted'] === 'number'
          ? input['deleted']
          : 0,
    };
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

    const pruneSessions = yield* mutation('pruneSessions', {
      method: (requested: boolean) => requested,
      loader: function* () {
        return yield* CraftHttpClient.post(({ response }) => ({
          url: `${SESSION_ARCHIVE_URL}/sessions/prune`,
          payload: {},
          success: response(pruneResultDecoder),
        }));
      },
    });

    const deleteSessions = yield* mutation('deleteSessions', {
      method: (ids: readonly string[]) => ids,
      loader: function* ({ params: ids }) {
        return yield* CraftHttpClient.post(({ response }) => ({
          url: `${SESSION_ARCHIVE_URL}/sessions/delete-many`,
          payload: { ids },
          success: response(pruneResultDecoder),
        }));
      },
    });

    const saveResumeProfile = yield* mutation('persistResumeProfile', {
      method: (request: Readonly<{ id: string; profile: ResumeProfile }>) =>
        request,
      loader: function* ({ params }) {
        return yield* CraftHttpClient.put(({ response }) => ({
          url: `${SESSION_ARCHIVE_URL}/sessions/${encodeURIComponent(params.id)}/resume-profile`,
          payload: params.profile,
          success: response<{ saved: boolean }>(),
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
    yield* craftComputed('retentionDays', function* () {
      return (yield* sessions.value())?.retentionDays ?? 30;
    });
    yield* craftComputed('storageBytes', function* () {
      return (yield* sessions.value())?.storageBytes ?? 0;
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

    yield* craftExpose('pruneExpired', function* () {
      yield* pruneSessions.mutate(true);
      refreshRequested$.emit(++refreshCount);
    });
    yield* craftExpose(
      'deleteArchivedSessions',
      function* (ids: readonly string[]) {
        yield* deleteSessions.mutate(ids);
        refreshRequested$.emit(++refreshCount);
      },
    );
    yield* craftExpose(
      'saveResumeProfile',
      function* (id: string, profile: ResumeProfile) {
        return yield* saveResumeProfile.mutate({ id, profile });
      },
    );
  },
);

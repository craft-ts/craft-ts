import {
  CraftHttpClient,
  CraftTemporalRuntime,
  craftComputed,
  craftExpose,
  craftService,
  insertReactOnMutation,
  insertQueryPipe,
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

/** A point of an archived session the AI is asked to resume from. */
export type ResumePoint = Readonly<{
  sessionId: string;
  beforeSequence?: number;
  participantId?: string;
}>;

const resumeRequestDecoder = {
  decode(input: unknown): Readonly<{ id: string }> | undefined {
    const request = isRecord(input) ? input['request'] : undefined;
    return isRecord(request) && typeof request['id'] === 'string'
      ? { id: request['id'] }
      : undefined;
  },
};

/** A resume point frozen by the AI, as the archive lists it. */
export type ResumeCheckpointSummary = Readonly<{
  id: string;
  beforeSequence?: number;
  origin: string;
  route?: string;
  expired: boolean;
  expiresAt: string;
  ttlReason: string;
}>;

function isResumeCheckpointSummary(value: unknown): value is ResumeCheckpointSummary {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['origin'] === 'string' &&
    typeof value['expired'] === 'boolean' &&
    typeof value['expiresAt'] === 'string' &&
    typeof value['ttlReason'] === 'string' &&
    (value['beforeSequence'] === undefined || typeof value['beforeSequence'] === 'number') &&
    (value['route'] === undefined || typeof value['route'] === 'string')
  );
}

const checkpointListDecoder = {
  decode(input: unknown): readonly ResumeCheckpointSummary[] {
    const checkpoints = isRecord(input) ? input['checkpoints'] : undefined;
    return Array.isArray(checkpoints)
      ? checkpoints.filter(isResumeCheckpointSummary)
      : [];
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

    // "Reprendre ici": the archive keeps the point for the AI's
    // `resume.request` tool, so the person only has to say "reprends".
    const resumeRequest = yield* mutation('resumeRequest', {
      method: (point: ResumePoint) => point,
      loader: function* ({ params: point }) {
        return yield* CraftHttpClient.post(({ response }) => ({
          url: `${SESSION_ARCHIVE_URL}/sessions/resume-requests`,
          payload: point,
          success: response(resumeRequestDecoder),
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
      insertQueryPipe(
        insertReactOnMutation(deleteSession, {
          reload: { onMutationResolved: true },
        }),
        insertReactOnMutation(pruneSessions, {
          reload: { onMutationResolved: true },
        }),
        insertReactOnMutation(deleteSessions, {
          reload: { onMutationResolved: true },
        }),
        // A request names an archived session: the list is read again so the
        // page shows what the archive holds when the AI starts reading it.
        insertReactOnMutation(resumeRequest, {
          reload: { onMutationResolved: true },
        }),
      ),
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

    // The points of one session, read when it opens: "Reprendre ici" reopens
    // a valid one directly, without the AI.
    const resumeCheckpoints = yield* query(
      'resumeCheckpoints',
      {
        method: (sessionId: string) => sessionId,
        loader: function* ({ params: sessionId }) {
          return yield* CraftHttpClient.get(({ response }) => ({
            url: `${SESSION_ARCHIVE_URL}/sessions/checkpoints?${new URLSearchParams({ sessionId })}`,
            success: response(checkpointListDecoder),
          }));
        },
      },
      () => ({}),
    );
    yield* craftComputed('resumeCheckpointList', function* () {
      return (yield* resumeCheckpoints.value()) ?? [];
    });

    yield* craftComputed('savedSessions', function* () {
      return (yield* sessions.value())?.sessions ?? [];
    });
    yield* craftComputed('retentionDays', function* () {
      return (yield* sessions.value())?.retentionDays ?? 30;
    });
    yield* craftComputed('storageBytes', function* () {
      return (yield* sessions.value())?.storageBytes ?? 0;
    });
    yield* craftComputed('resumeRequestSending', function* () {
      return yield* resumeRequest.isLoading();
    });
    yield* craftComputed('resumeRequestFailed', function* () {
      return yield* resumeRequest.hasException();
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

    yield* craftExpose('requestResume', function* (point: ResumePoint) {
      yield* resumeRequest.mutate(point);
    });
    yield* craftExpose('pruneExpired', function* () {
      yield* pruneSessions.mutate(true);
    });
    yield* craftExpose(
      'deleteArchivedSessions',
      function* (ids: readonly string[]) {
        yield* deleteSessions.mutate(ids);
      },
    );
  },
);

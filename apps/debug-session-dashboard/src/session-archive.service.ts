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
  state,
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
  recipeCount?: number;
  /** Unexpired saved points that can resume this session. */
  resumeCount?: number;
  resume?:
    | Readonly<{
        kind: 'guided-resume';
        requestId: string;
        sourceSessionId: string;
        beforeSequence?: number;
        participantId?: string;
      }>
    | Readonly<{
        kind: 'recipe-run';
        recipeId: string;
        launchId: string;
        requestId?: string;
        sourceSessionId?: string;
        beforeSequence?: number;
        participantId?: string;
      }>;
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
    typeof value['truncated'] === 'boolean' &&
    (value['recipeCount'] === undefined ||
      (typeof value['recipeCount'] === 'number' &&
        Number.isSafeInteger(value['recipeCount']) &&
        value['recipeCount'] >= 0)) &&
    (value['resumeCount'] === undefined ||
      (typeof value['resumeCount'] === 'number' &&
        Number.isSafeInteger(value['resumeCount']) &&
        value['resumeCount'] >= 0)) &&
    (value['resume'] === undefined || isResumeMetadata(value['resume']))
  );
}

function isResumeMetadata(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value['kind'] === 'recipe-run')
    return (
      typeof value['recipeId'] === 'string' &&
      typeof value['launchId'] === 'string' &&
      (value['requestId'] === undefined ||
        typeof value['requestId'] === 'string') &&
      (value['sourceSessionId'] === undefined ||
        typeof value['sourceSessionId'] === 'string') &&
      (value['beforeSequence'] === undefined ||
        (typeof value['beforeSequence'] === 'number' &&
          Number.isSafeInteger(value['beforeSequence']) &&
          value['beforeSequence'] >= 0)) &&
      (value['participantId'] === undefined ||
        typeof value['participantId'] === 'string')
    );
  return (
    value['kind'] === 'guided-resume' &&
    typeof value['requestId'] === 'string' &&
    typeof value['sourceSessionId'] === 'string' &&
    (value['beforeSequence'] === undefined ||
      (typeof value['beforeSequence'] === 'number' &&
        Number.isSafeInteger(value['beforeSequence']) &&
        value['beforeSequence'] >= 0)) &&
    (value['participantId'] === undefined ||
      typeof value['participantId'] === 'string')
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
  recipeId?: string;
}>;

function isResumeCheckpointSummary(
  value: unknown,
): value is ResumeCheckpointSummary {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['origin'] === 'string' &&
    typeof value['expired'] === 'boolean' &&
    typeof value['expiresAt'] === 'string' &&
    typeof value['ttlReason'] === 'string' &&
    (value['beforeSequence'] === undefined ||
      typeof value['beforeSequence'] === 'number') &&
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

export type ResumeRecipeSummary = Readonly<{
  id: string;
  sessionId: string;
  beforeSequence?: number;
  origin: string;
  name?: string;
  summary?: string;
  objective: Readonly<{ goal: string }>;
  strategy: 'autonomous' | 'existing';
  validation: Readonly<{
    status: 'draft' | 'validation-failed' | 'verified';
    issues: readonly string[];
  }>;
  updatedAt: string;
  runs: readonly ResumeRecipeRunSummary[];
}>;

export type ResumeRecipeRunSummary = Readonly<{
  id: string;
  startedAt: string;
  updatedAt: string;
  status:
    | 'running'
    | 'waiting-human'
    | 'waiting-ai'
    | 'completed'
    | 'failed'
    | 'cancelled';
  currentStep?: number;
  supervised: boolean;
  failure?: Readonly<{ step?: number; detail: string }>;
}>;

export type ResumeRecipeDetail = Readonly<{
  id: string;
  sessionId: string;
  beforeSequence?: number;
  origin: string;
  name?: string;
  summary?: string;
  objective: Readonly<{
    goal: string;
    exact: readonly string[];
    approximate: readonly string[];
    mayWrite: boolean;
  }>;
  strategy: 'autonomous' | 'existing';
  validation: Readonly<{
    status: 'draft' | 'validation-failed' | 'verified';
    issues: readonly string[];
    verifiedRunId?: string;
  }>;
  network?: Readonly<Record<string, unknown>>;
  steps: readonly Readonly<Record<string, unknown>>[];
  cleanup: readonly Readonly<Record<string, unknown>>[];
  revisions: readonly Readonly<Record<string, unknown>>[];
  runs: readonly ResumeRecipeRunSummary[];
  createdAt: string;
  updatedAt: string;
}>;

function isResumeRecipeSummary(value: unknown): value is ResumeRecipeSummary {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['sessionId'] === 'string' &&
    typeof value['origin'] === 'string' &&
    typeof value['updatedAt'] === 'string' &&
    (value['strategy'] === 'autonomous' || value['strategy'] === 'existing') &&
    isRecipeValidation(value['validation']) &&
    isRecord(value['objective']) &&
    typeof value['objective']['goal'] === 'string' &&
    (value['name'] === undefined || typeof value['name'] === 'string') &&
    (value['summary'] === undefined || typeof value['summary'] === 'string') &&
    Array.isArray(value['runs']) &&
    value['runs'].every(isResumeRecipeRunSummary) &&
    (value['beforeSequence'] === undefined ||
      typeof value['beforeSequence'] === 'number')
  );
}

function isResumeRecipeDetail(value: unknown): value is ResumeRecipeDetail {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['sessionId'] === 'string' &&
    typeof value['origin'] === 'string' &&
    typeof value['createdAt'] === 'string' &&
    typeof value['updatedAt'] === 'string' &&
    (value['strategy'] === 'autonomous' || value['strategy'] === 'existing') &&
    isRecipeValidation(value['validation']) &&
    (value['name'] === undefined || typeof value['name'] === 'string') &&
    (value['summary'] === undefined || typeof value['summary'] === 'string') &&
    isRecord(value['objective']) &&
    typeof value['objective']['goal'] === 'string' &&
    Array.isArray(value['objective']['exact']) &&
    value['objective']['exact'].every((item) => typeof item === 'string') &&
    Array.isArray(value['objective']['approximate']) &&
    value['objective']['approximate'].every(
      (item) => typeof item === 'string',
    ) &&
    typeof value['objective']['mayWrite'] === 'boolean' &&
    Array.isArray(value['steps']) &&
    value['steps'].every(isRecord) &&
    Array.isArray(value['cleanup']) &&
    value['cleanup'].every(isRecord) &&
    Array.isArray(value['revisions']) &&
    value['revisions'].every(isRecord) &&
    Array.isArray(value['runs']) &&
    value['runs'].every(isResumeRecipeRunSummary) &&
    (value['network'] === undefined || isRecord(value['network'])) &&
    (value['beforeSequence'] === undefined ||
      typeof value['beforeSequence'] === 'number')
  );
}

function isResumeRecipeRunSummary(value: unknown): value is ResumeRecipeRunSummary {
  return isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['startedAt'] === 'string' &&
    typeof value['updatedAt'] === 'string' &&
    typeof value['supervised'] === 'boolean' &&
    (value['currentStep'] === undefined || typeof value['currentStep'] === 'number') &&
    ['running', 'waiting-human', 'waiting-ai', 'completed', 'failed', 'cancelled'].includes(String(value['status'])) &&
    (value['failure'] === undefined ||
      (isRecord(value['failure']) &&
        typeof value['failure']['detail'] === 'string' &&
        (value['failure']['step'] === undefined || typeof value['failure']['step'] === 'number')));
}

function isRecipeValidation(
  value: unknown,
): value is Readonly<{ status: 'draft' | 'validation-failed' | 'verified'; issues: readonly string[]; verifiedRunId?: string }> {
  return isRecord(value) &&
    (value['status'] === 'draft' || value['status'] === 'validation-failed' || value['status'] === 'verified') &&
    Array.isArray(value['issues']) &&
    value['issues'].every((issue) => typeof issue === 'string') &&
    (value['verifiedRunId'] === undefined || typeof value['verifiedRunId'] === 'string');
}

const recipeDetailDecoder = {
  decode(input: unknown): ResumeRecipeDetail | undefined {
    const recipe = isRecord(input) ? input['recipe'] : undefined;
    return isResumeRecipeDetail(recipe) ? recipe : undefined;
  },
};

const recipeListDecoder = {
  decode(input: unknown): readonly ResumeRecipeSummary[] {
    const recipes = isRecord(input) ? input['recipes'] : undefined;
    return Array.isArray(recipes) ? recipes.filter(isResumeRecipeSummary) : [];
  },
};

export type ResumeNotice = Readonly<{
  sessionId: string;
  requestId: string;
  prompt: string;
  appUrl: string;
  appTabOpened: boolean;
}>;

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
    // `resume.request` tool, bound to the id copied into the prompt.
    const resumeRequest = yield* mutation('resumeRequest', {
      method: (input: Readonly<{ point: ResumePoint; requestId: string }>) =>
        input,
      loader: function* ({ params: input }) {
        return yield* CraftHttpClient.post(({ response }) => ({
          url: `${SESSION_ARCHIVE_URL}/sessions/resume-requests`,
          payload: { ...input.point, id: input.requestId },
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
    const recipeCatalog = yield* query(
      'recipeCatalog',
      {
        method: refreshRequested$.value,
        loader: function* () {
          return yield* CraftHttpClient.get(({ response }) => ({
            url: `${SESSION_ARCHIVE_URL}/sessions/recipes`,
            success: response(recipeListDecoder),
          }));
        },
      },
      () => ({}),
    );
    const recipeDetail = yield* query(
      'recipeDetail',
      {
        method: (id: string) => id,
        loader: function* ({ params: id }) {
          return yield* CraftHttpClient.get(({ response }) => ({
            url: `${SESSION_ARCHIVE_URL}/sessions/recipes/${encodeURIComponent(id)}`,
            success: response(recipeDetailDecoder),
          }));
        },
      },
      () => ({}),
    );
    yield* craftComputed('resumeCheckpointList', function* () {
      return (yield* resumeCheckpoints.value()) ?? [];
    });
    yield* craftComputed('resumeRecipeList', function* () {
      return (yield* recipeCatalog.value()) ?? [];
    });
    yield* craftComputed('resumeRecipeDetail', function* () {
      return (yield* recipeDetail.value()) ?? undefined;
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

    // What the dashboard tells after « Reprendre ici »: the request is out,
    // and the sentence to give the AI, shown in case the copy failed.
    const resumeNotice = yield* state(
      'resumeNotice',
      undefined as ResumeNotice | undefined,
      ({ set }) => ({
        show: (notice: ResumeNotice) => set(notice),
        dismiss: () => set(undefined),
      }),
    );
    yield* craftExpose(
      'requestResume',
      function* (
        point: ResumePoint,
        requestId: string,
        prompt: string,
        appUrl: string,
        appTabOpened: boolean,
      ) {
        resumeNotice.dismiss();
        yield* resumeRequest.mutate({ point, requestId });
        const sent = !(yield* resumeRequest.hasException());
        if (sent) {
          resumeNotice.show({
            sessionId: point.sessionId,
            requestId,
            prompt,
            appUrl,
            appTabOpened,
          });
        }
        return sent;
      },
    );
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

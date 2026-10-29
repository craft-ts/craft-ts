import type { SendContextEvent, SendContextSession } from '@craft-ts/core';
import { CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT } from './debug-session-replay-signals';
import { captureDebugSessionEnvironment } from './debug-session-environment';

const SHARED_SESSION_ID_KEY = 'craft-debug-session-id';
const PARTICIPANT_ID_KEY = 'craft-debug-session-participant-id';
const RESUME_REQUEST_PARAM = 'craft-resume-request';
const RESUME_RECIPE_PARAM = 'craft-resume-recipe';
const RESUME_RECIPE_SESSION_PARAM = 'craft-debug-session-recipe-id';
const RESUME_RECIPE_LAUNCH_PARAM = 'craft-resume-recipe-launch';
const RESUME_SESSION_METADATA_KEY = 'craft-debug-session-resume';
const RECIPE_RUN_MARKED_EVENT = 'craft-debug-session-recipe-run';

type E2ESessionMarker = Readonly<{ id: string; test: Readonly<Record<string, unknown>> }>;
type E2ESessionReady = (id: string) => unknown;
type CraftDebugSessionApi = Readonly<{
  id(): string;
  finish(): Promise<'acknowledged' | 'timeout' | 'offline'>;
  mark(label: string): void;
}>;

/** Streams redacted session snapshots and subsequent events to a local archive. */
export function connectDebugSessionPersistence(
  session: SendContextSession,
  webSocketUrl: string,
): () => void {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined')
    return () => undefined;

  const marker = (globalThis as typeof globalThis & { __CRAFT_E2E_SESSION__?: E2ESessionMarker }).__CRAFT_E2E_SESSION__;
  let resume = guidedResumeMetadata();

  const sessionScope =
    resume?.['kind'] === 'recipe-run'
      ? resume['launchId']
      : resume?.['requestId'];
  const resumeSuffix =
    typeof sessionScope === 'string' ? `:resume:${sessionScope}` : '';
  const storageKey = `${SHARED_SESSION_ID_KEY}:${location.origin}${resumeSuffix}`;
  const participantStorageKey = `${PARTICIPANT_ID_KEY}:${location.origin}${resumeSuffix}`;
  let id: string | undefined;
  let participantId = readOrCreateParticipantId(participantStorageKey);
  let releaseParticipantLock: () => void = () => undefined;
  let persistenceStarted = false;
  const createdAt = new Date(
    session.activeClip?.startedAt ?? Date.now(),
  ).toISOString();
  let socket: WebSocket | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let finishAckTimer: ReturnType<typeof setTimeout> | undefined;
  let finishResult: ((value: 'acknowledged' | 'timeout' | 'offline') => void) | undefined;
  let finishPromise: Promise<'acknowledged' | 'timeout' | 'offline'> | undefined;
  let lastSequence = 0;
  let closed = false;
  let persistencePaused = false;
  let syncing = false;
  let pendingHistory: readonly SendContextEvent[] = [];
  let replayStartSequence = 0;
  let lastParticipantState = participantState();
  const excludedReplayEventIds = new Set<string>();

  const send = (message: Record<string, unknown>): void => {
    if (socket?.readyState !== WebSocket.OPEN) return;
    try {
      socket.send(JSON.stringify(message));
    } catch {
      socket.close();
    }
  };

  const readOrCreateSharedId = (): string => {
    try {
      if (marker?.id && isUuid(marker.id)) {
        localStorage.setItem(storageKey, marker.id);
        return marker.id;
      }
      const existing = localStorage.getItem(storageKey);
      if (existing && isUuid(existing)) return existing;
      const created = crypto.randomUUID();
      localStorage.setItem(storageKey, created);
      return created;
    } catch {
      return crypto.randomUUID();
    }
  };

  const exportSession = (): Record<string, unknown> => {
    const exported = JSON.parse(session.exportSessionJson()) as Record<
      string,
      unknown
    >;
    if (excludedReplayEventIds.size === 0) return exported;
    if (Array.isArray(exported['events']))
      exported['events'] = exported['events'].filter(
        (event) =>
          !isRecord(event) ||
          typeof event['id'] !== 'string' ||
          !excludedReplayEventIds.has(event['id']),
      );
    if (Array.isArray(exported['clips']))
      exported['clips'] = exported['clips'].map((clip) => {
        if (!isRecord(clip) || !Array.isArray(clip['eventIds'])) return clip;
        return {
          ...clip,
          eventIds: clip['eventIds'].filter(
            (id) => typeof id !== 'string' || !excludedReplayEventIds.has(id),
          ),
        };
      });
    return exported;
  };

  const clipsForEvents = (
    events: readonly SendContextEvent[],
  ): readonly Readonly<Record<string, unknown>>[] => {
    const eventIds = new Set(events.map((event) => event.id));
    return session.clips.map((clip) => ({
      ...clip,
      eventIds: clip.eventIds.filter(
        (eventId) =>
          !excludedReplayEventIds.has(eventId) && eventIds.has(eventId),
      ),
    }));
  };

  const clipMetadata = (): readonly Readonly<Record<string, unknown>>[] =>
    session.clips.map((clip) => ({
      ...clip,
      eventIds: [],
    }));

  const sendSync = (): void => {
    const exported = exportSession();
    pendingHistory = Array.isArray(exported['events'])
      ? (exported['events'] as SendContextEvent[])
      : [];
    syncing = true;
    lastSequence = 0;
    send({
      type: 'session:sync',
      id,
      participantId,
      ...(marker ? { test: marker.test } : {}),
      createdAt,
      participant: {
        title: document.title.trim() || `Onglet ${participantId.slice(0, 6)}`,
        state: participantState(),
        environment: captureDebugSessionEnvironment(),
      },
      session: {
        ...exported,
        ...(resume ? { resume } : {}),
        events: [],
        clips: clipsForEvents([]),
      },
    });
  };

  const sendHistory = (): void => {
    const exported = exportSession();
    const events = Array.isArray(exported['events'])
      ? (exported['events'] as SendContextEvent[])
      : pendingHistory;
    let batch: SendContextEvent[] = [];
    let batchBytes = 0;
    const flush = (): void => {
      if (batch.length === 0) return;
      send({
        type: 'session:events',
        id,
        events: batch,
        clips: clipsForEvents(batch),
        participantId,
        truncated: session.clips.some((clip) => clip.truncated),
      });
      batch = [];
      batchBytes = 0;
    };
    for (const event of events) {
      const eventBytes = JSON.stringify(event).length;
      if (
        batch.length > 0 &&
        (batch.length >= 100 || batchBytes + eventBytes > 256_000)
      )
        flush();
      batch.push(event);
      batchBytes += eventBytes;
    }
    flush();
    send({
      type: 'session:events',
      id,
      events: [],
      clips: clipMetadata(),
      participantId,
      truncated: session.clips.some((clip) => clip.truncated),
    });
    lastSequence = session.events.reduce(
      (highest, event) => Math.max(highest, event.sequence),
      0,
    );
    pendingHistory = [];
    syncing = false;
  };

  const sendEvent = (event: SendContextEvent): void => {
    if (syncing || event.sequence <= lastSequence) return;
    lastSequence = event.sequence;
    send({
      type: 'session:event',
      id,
      event,
      clips: clipsForEvents([event]),
      participantId,
      truncated: session.clips.some((clip) => clip.truncated),
    });
  };

  const onRecipeRunMarked = (event: Event): void => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (
      !isRecord(detail) ||
      typeof detail['recipeId'] !== 'string' ||
      !isUuid(detail['recipeId'])
    )
      return;
    const launchId =
      typeof detail['launchId'] === 'string' && isUuid(detail['launchId'])
        ? detail['launchId']
        : crypto.randomUUID();
    const url = new URL(location.href);
    url.searchParams.set(RESUME_RECIPE_SESSION_PARAM, detail['recipeId']);
    url.searchParams.set(RESUME_RECIPE_LAUNCH_PARAM, launchId);
    try {
      history.replaceState(
        history.state,
        '',
        `${url.pathname}${url.search}${url.hash}`,
      );
    } catch {
      // The current session still receives its metadata over the socket.
    }
    const previous = resume;
    resume = {
      kind: 'recipe-run',
      recipeId: detail['recipeId'],
      launchId,
      ...(typeof previous?.['requestId'] === 'string'
        ? { requestId: previous['requestId'] }
        : {}),
      ...(typeof previous?.['sourceSessionId'] === 'string'
        ? { sourceSessionId: previous['sourceSessionId'] }
        : {}),
      ...(typeof previous?.['beforeSequence'] === 'number'
        ? { beforeSequence: previous['beforeSequence'] }
        : {}),
      ...(typeof previous?.['participantId'] === 'string'
        ? { participantId: previous['participantId'] }
        : {}),
    };
    try {
      sessionStorage.setItem(RESUME_SESSION_METADATA_KEY, JSON.stringify(resume));
    } catch {
      // The live session still receives the association over its socket.
    }
    send({ type: 'session:resume-metadata', id, resume });
  };

  const onReplayPersistence = (event: Event): void => {
    const paused = (event as CustomEvent<{ paused?: unknown }>).detail?.paused;
    if (typeof paused !== 'boolean') return;
    persistencePaused = paused;
    if (paused) {
      replayStartSequence = session.events.reduce(
        (highest, item) => Math.max(highest, item.sequence),
        lastSequence,
      );
      lastSequence = replayStartSequence;
    }
  };

  const subscribe = session.events$.subscribe({
    next: (events) => {
      const firstSequence = events[0]?.sequence;
      const firstUnseenIndex =
        firstSequence === undefined
          ? events.length
          : Math.max(0, lastSequence + 1 - firstSequence);
      if (persistencePaused) {
        for (const event of events.slice(firstUnseenIndex)) {
          if (event.sequence > replayStartSequence)
            excludedReplayEventIds.add(event.id);
          lastSequence = Math.max(lastSequence, event.sequence);
        }
        return;
      }
      if (syncing) return;
      for (const event of events.slice(firstUnseenIndex)) sendEvent(event);
    },
  });

  const connect = (): void => {
    if (closed || !id) return;
    try {
      const connection = new WebSocket(webSocketUrl);
      socket = connection;
      connection.addEventListener(
        'message',
        (messageEvent: MessageEvent<string>) => {
          let message: unknown;
          try {
            message = JSON.parse(messageEvent.data);
          } catch {
            return;
          }
          if (
            isRecord(message) &&
            message['type'] === 'session:saved' &&
            message['id'] === id
          ) {
            if (finishAckTimer !== undefined) clearTimeout(finishAckTimer);
            finishAckTimer = undefined;
            finishResult?.('acknowledged');
            finishResult = undefined;
            connection.close(1000, 'session finish acknowledged');
            return;
          }
          if (
            !isRecord(message) ||
            message['type'] !== 'session:ready' ||
            typeof message['id'] !== 'string' ||
            !isUuid(message['id'])
          )
            return;
          if (message['id'] !== id) {
            id = message['id'];
            try {
              localStorage.setItem(storageKey, id);
            } catch {
              // The in-memory id is sufficient for this page if storage is denied.
            }
          }
          // Under a Playwright test, the fixture keeps the effective id even if
          // the test closes this page before the end.
          if (marker) reportE2eSessionId(id);
          if (resume?.['kind'] === 'recipe-run')
            send({ type: 'session:resume-metadata', id, resume });
          if (syncing) sendHistory();
        },
      );
    } catch {
      scheduleReconnect();
      return;
    }
    const connection = socket;
    connection.addEventListener('open', sendSync, { once: true });
    connection.addEventListener(
      'close',
      () => {
        if (socket === connection) scheduleReconnect();
      },
      { once: true },
    );
    connection.addEventListener(
      'error',
      () => {
        if (socket === connection) connection.close();
      },
      { once: true },
    );
  };

  function scheduleReconnect(): void {
    if (closed || retryTimer !== undefined) return;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      connect();
    }, 1000);
  }

  const finish = (): Promise<'acknowledged' | 'timeout' | 'offline'> => {
    if (finishPromise) return finishPromise;
    finishPromise = new Promise((resolve) => { finishResult = resolve; });
    if (closed) { finishResult?.('offline'); return finishPromise; }
    closed = true;
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    id ??= readOrCreateSharedId();
    if (id) {
      const canReceiveAcknowledgement = socket?.readyState === WebSocket.OPEN;
      send({
        type: 'session:events',
        id,
        events: [],
        clips: clipMetadata(),
        participantId,
        truncated: session.clips.some((clip) => clip.truncated),
      });
      send({ type: 'session:finish', id, participantId });
      persistFinishWithKeepalive(id);
      if (canReceiveAcknowledgement) {
        finishAckTimer = setTimeout(() => {
          finishAckTimer = undefined;
          finishResult?.('timeout');
          finishResult = undefined;
          socket?.close(1000, 'session finish acknowledgement timeout');
        }, 750);
      } else {
        finishResult?.('offline');
        finishResult = undefined;
        socket?.close(1000, 'session finished without an open connection');
      }
    }
    subscribe.unsubscribe();
    releaseParticipantLock();
    return finishPromise;
  };

  if (marker) {
    const api: CraftDebugSessionApi = {
      id: () => id ?? marker.id,
      finish,
      mark: (label) => session.capture('custom', 'emitted', { name: 'test-marker', payload: { label: label.slice(0, 512) } }),
    };
    (globalThis as typeof globalThis & { __craftDebugSession?: CraftDebugSessionApi }).__craftDebugSession = api;
  }

  function persistFinishWithKeepalive(sessionId: string): void {
    try {
      const archiveUrl = new URL(webSocketUrl);
      archiveUrl.protocol = archiveUrl.protocol === 'wss:' ? 'https:' : 'http:';
      archiveUrl.pathname = `/sessions/${sessionId}/finish`;
      archiveUrl.search = '';
      archiveUrl.hash = '';
      const payload = JSON.stringify({
        participantId,
        clips: clipMetadata(),
        truncated: session.clips.some((clip) => clip.truncated),
      });
      if (typeof navigator.sendBeacon === 'function') {
        let accepted = false;
        try {
          accepted = navigator.sendBeacon(
            archiveUrl.href,
            new Blob([payload], { type: 'text/plain;charset=UTF-8' }),
          );
        } catch {
          // Fall back to fetch when the browser rejects the beacon body.
        }
        if (accepted) return;
      }
      void fetch(archiveUrl.href, {
        method: 'POST',
        headers: { 'content-type': 'text/plain;charset=UTF-8' },
        body: payload,
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      // The WebSocket finish remains the primary path if keepalive is unavailable.
    }
  }

  const onStorage = (event: StorageEvent): void => {
    if (event.key !== storageKey || !event.newValue || !isUuid(event.newValue))
      return;
    if (event.newValue === id) return;
    id = event.newValue;
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    retryTimer = undefined;
    const previous = socket;
    socket = undefined;
    previous?.close(4001, 'shared session changed');
    connect();
  };

  const updateParticipantState = (): void => {
    const state = participantState();
    if (state === lastParticipantState) return;
    lastParticipantState = state;
    session.capture('participant', 'emitted', {
      name: 'state',
      payload: { state },
    });
    send({
      type: 'session:participant-state',
      id,
      participantId,
      state,
    });
  };

  const onVisibilityChange = (): void => updateParticipantState();
  const onFocus = (): void => updateParticipantState();
  const onBlur = (): void => updateParticipantState();

  window.addEventListener('pagehide', finish, { once: true });
  window.addEventListener('storage', onStorage);
  window.addEventListener(RECIPE_RUN_MARKED_EVENT, onRecipeRunMarked);
  window.addEventListener('focus', onFocus);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibilityChange);
  session.capture('participant', 'emitted', {
    name: 'state',
    payload: { state: lastParticipantState, initial: true },
  });
  window.addEventListener(
    CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT,
    onReplayPersistence,
  );
  claimParticipantIdentity();
  return () => {
    window.removeEventListener('pagehide', finish);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(RECIPE_RUN_MARKED_EVENT, onRecipeRunMarked);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener(
      CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT,
      onReplayPersistence,
    );
    finish();
  };

  function startPersistence(): void {
    if (closed || persistenceStarted) return;
    persistenceStarted = true;
    const locks = navigator.locks;
    if (locks) {
      void locks
        .request(`craft-debug-session:${storageKey}`, readOrCreateSharedId)
        .then((sharedId) => {
          if (closed) return;
          id = sharedId;
          connect();
        })
        .catch(() => {
          id = readOrCreateSharedId();
          connect();
        });
    } else {
      id = readOrCreateSharedId();
      connect();
    }
  }

  function claimParticipantIdentity(): void {
    const locks = navigator.locks;
    if (!locks) {
      startPersistence();
      return;
    }

    let acquired = false;
    void locks
      .request(
        `craft-debug-participant:${storageKey}:${participantId}`,
        { ifAvailable: true },
        async (lock) => {
          if (!lock) return;
          acquired = true;
          if (closed) return;
          await new Promise<void>((resolve) => {
            releaseParticipantLock = resolve;
            startPersistence();
          });
        },
      )
      .then(() => {
        if (acquired || closed) return;
        participantId = crypto.randomUUID();
        try {
          sessionStorage.setItem(participantStorageKey, participantId);
        } catch {
          // Keep the in-memory identity when browser storage is unavailable.
        }
        claimParticipantIdentity();
      })
      .catch(() => startPersistence());
  }
}

/** Associate the current recording with the recipe it is executing. */
export function markCurrentDebugSessionAsRecipeRun(recipeId: string): void {
  if (typeof window === 'undefined' || !isUuid(recipeId)) return;
  const existingLaunchId = new URLSearchParams(location.search).get(
    RESUME_RECIPE_LAUNCH_PARAM,
  );
  window.dispatchEvent(
    new CustomEvent(RECIPE_RUN_MARKED_EVENT, {
      detail: {
        recipeId,
        ...(existingLaunchId && isUuid(existingLaunchId)
          ? { launchId: existingLaunchId }
          : {}),
      },
    }),
  );
}

function guidedResumeMetadata(): Readonly<Record<string, unknown>> | undefined {
  const fromUrl = (): Readonly<Record<string, unknown>> | undefined => {
    const params = new URLSearchParams(location.search);
    const requestId = params.get(RESUME_REQUEST_PARAM);
    const sourceSessionId = params.get('craft-resume-session');
    const recipeId =
      params.get(RESUME_RECIPE_SESSION_PARAM) ??
      params.get(RESUME_RECIPE_PARAM);
    const launchId = params.get(RESUME_RECIPE_LAUNCH_PARAM);
    const beforeSequenceParam = params.get('craft-resume-before');
    const beforeSequence = Number(beforeSequenceParam);
    const participantId = params.get('craft-resume-participant');
    if (recipeId && launchId && isUuid(recipeId) && isUuid(launchId))
      return {
        kind: 'recipe-run',
        recipeId,
        launchId,
        ...(requestId && isUuid(requestId) ? { requestId } : {}),
        ...(sourceSessionId && isUuid(sourceSessionId)
          ? { sourceSessionId }
          : {}),
        ...(beforeSequenceParam !== null &&
        Number.isSafeInteger(beforeSequence) &&
        beforeSequence >= 0
          ? { beforeSequence }
          : {}),
        ...(participantId && participantId.length <= 200
          ? { participantId }
          : {}),
      };
    if (
      !requestId ||
      !sourceSessionId ||
      !isUuid(requestId) ||
      !isUuid(sourceSessionId)
    )
      return undefined;
    return {
      kind: 'guided-resume',
      requestId,
      sourceSessionId,
      ...(beforeSequenceParam !== null &&
      Number.isSafeInteger(beforeSequence) &&
      beforeSequence >= 0
        ? { beforeSequence }
        : {}),
      ...(participantId && participantId.length <= 200
        ? { participantId }
        : {}),
    };
  };
  try {
    const current = fromUrl();
    if (current) {
      sessionStorage.setItem(
        RESUME_SESSION_METADATA_KEY,
        JSON.stringify(current),
      );
      return current;
    }
    const cached = sessionStorage.getItem(RESUME_SESSION_METADATA_KEY);
    if (!cached) return undefined;
    const value: unknown = JSON.parse(cached);
    return isRecord(value) &&
      ((value['kind'] === 'guided-resume' &&
        typeof value['requestId'] === 'string' &&
        isUuid(value['requestId']) &&
        typeof value['sourceSessionId'] === 'string' &&
        isUuid(value['sourceSessionId'])) ||
        (value['kind'] === 'recipe-run' &&
          typeof value['recipeId'] === 'string' &&
          isUuid(value['recipeId']) &&
          typeof value['launchId'] === 'string' &&
          isUuid(value['launchId'])))
      ? value
      : undefined;
  } catch {
    return fromUrl();
  }
}

function participantState(): 'visible' | 'hidden' | 'blurred' {
  if (document.visibilityState === 'hidden') return 'hidden';
  return document.hasFocus() ? 'visible' : 'blurred';
}

function readOrCreateParticipantId(storageKey: string): string {
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing && isUuid(existing)) return existing;
    const created = crypto.randomUUID();
    sessionStorage.setItem(storageKey, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function reportE2eSessionId(id: string): void {
  const report = (globalThis as typeof globalThis & { __craftE2eSessionReady?: E2ESessionReady }).__craftE2eSessionReady;
  if (typeof report !== 'function') return;
  try {
    void Promise.resolve(report(id)).catch(() => undefined);
  } catch {
    // The binding disappears when the test context closes.
  }
}

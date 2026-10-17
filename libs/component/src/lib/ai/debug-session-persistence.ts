import type { SendContextEvent, SendContextSession } from '@craft-ts/core';
import { CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT } from './debug-session-replay-signals';
import { captureDebugSessionEnvironment } from './debug-session-environment';

const SHARED_SESSION_ID_KEY = 'craft-debug-session-id';

/** Streams redacted session snapshots and subsequent events to a local archive. */
export function connectDebugSessionPersistence(
  session: SendContextSession,
  webSocketUrl: string,
): () => void {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined')
    return () => undefined;

  const storageKey = `${SHARED_SESSION_ID_KEY}:${location.origin}`;
  let id: string | undefined;
  const participantId = crypto.randomUUID();
  const createdAt = new Date(
    session.activeClip?.startedAt ?? Date.now(),
  ).toISOString();
  let socket: WebSocket | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let finishAckTimer: ReturnType<typeof setTimeout> | undefined;
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
      createdAt,
      participant: {
        title: `Onglet ${participantId.slice(0, 6)}`,
        state: participantState(),
        environment: captureDebugSessionEnvironment(),
      },
      session: {
        ...exported,
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

  const finish = (): void => {
    if (closed) return;
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
          socket?.close(1000, 'session finish acknowledgement timeout');
        }, 750);
      } else {
        socket?.close(1000, 'session finished without an open connection');
      }
    }
    subscribe.unsubscribe();
  };

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
  return () => {
    window.removeEventListener('pagehide', finish);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener(
      CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT,
      onReplayPersistence,
    );
    finish();
  };
}

function participantState(): 'visible' | 'hidden' | 'blurred' {
  if (document.visibilityState === 'hidden') return 'hidden';
  return document.hasFocus() ? 'visible' : 'blurred';
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

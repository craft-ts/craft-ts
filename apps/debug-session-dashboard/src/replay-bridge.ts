import {
  after,
  cancelAfter,
  frameHasWindow,
  hideClickMarker,
  isFrameWindow,
  newUuid,
  onWindowMessage,
  postToFrame,
  saveTextFile,
  setFramePlaceholder,
  showClickMarker,
} from './replay-browser';
import {
  isRecord,
  parseLocalTarget,
  parseReplayDifference,
  parseViewport,
  REPLAY_CHANNEL,
  type ReplayDifference,
  type ReplayFrameConnection,
} from './replay-model';
import {
  freezeReplayVisibilityClock,
  hideReplayDialog,
  endReplayLoadingIndicator,
  observeReplayStage,
  send,
  setNextActionCountdown,
  setReplayActionTarget,
  showReplayDialog,
  updateGlobalProgress,
  updateGlobalReplayState,
  updateReplayFrameUrl,
  updateReplayViewport,
} from './replay-playback';
import {
  connected,
  difference,
  frameConnections,
  handshakeTimers,
  participantTitle,
  partialReplay,
  registers,
  replayableEvents,
  replayIndex,
  replayScales,
  replayState,
  replayViewport,
  replayViewports,
  replayWarnings,
  REPLAY_ERROR_NOTE_PREFIX,
  seekHooks,
  warningIndexes,
  autoSkipDifferences,
  recordReplayDifference,
  resolveLatestReplayDifference,
  selectedParticipantId,
  status,
} from './replay-state';

/**
 * The conversation with the replayed page. The page is another window: it
 * answers `hello` with `ready`, takes `start`, `play`, `step`… and reports back
 * on the channel. Nothing it sends is trusted before it is checked here.
 */

/** The frame loaded: ask its bridge to prove it is there. */
export function handshake(participantId: string): void {
  observeReplayStage();
  const connection = frameConnections.get(participantId);
  if (!connection || !frameHasWindow(participantId)) return;
  const parsed = parseLocalTarget(connection.href);
  if (!parsed.ok) return;
  const previousTimer = handshakeTimers.get(participantId);
  if (previousTimer !== undefined) cancelAfter(previousTimer);
  const nonce = newUuid();
  connection.nonce = nonce;
  postToFrame(
    participantId,
    { channel: REPLAY_CHANNEL, type: 'hello', nonce },
    parsed.url.origin,
  );
  status.set(
    `Vérification du pont de replay · ${participantTitle(participantId)}…`,
  );
  const timer = after(5000, () => {
    handshakeTimers.delete(participantId);
    if (connection.connected || connection.nonce !== nonce) return;
    connection.status = 'error';
    updateGlobalReplayState();
    status.set(
      `Aucune réponse du pont de replay. Vérifie que l’application tourne sur ${parsed.url.origin} et active provideCraftDebugReplayBridge.`,
    );
  });
  handshakeTimers.set(participantId, timer);
}

/** The next action of a tab, so a pause can resume where the tab was. */
function rememberResumeIndex(
  connection: ReplayFrameConnection,
  data: Readonly<Record<string, unknown>>,
): void {
  const nextIndex = data['nextIndex'];
  if (typeof nextIndex === 'number')
    connection.resumeIndex = Math.max(connection.resumeIndex, nextIndex);
}

function scheduledCount(): number {
  return [...frameConnections.values()].filter(
    (item) => item.status === 'scheduled',
  ).length;
}

function onReady(connection: ReplayFrameConnection, origin: string): void {
  const { participantId } = connection;
  const handshakeTimer = handshakeTimers.get(participantId);
  if (handshakeTimer !== undefined) {
    cancelAfter(handshakeTimer);
    handshakeTimers.delete(participantId);
  }
  connection.connected = true;
  if (
    connection.startOffsetMs > 0 &&
    registers.clockElapsedMs >= connection.startOffsetMs
  )
    connection.timelineOriginMs =
      registers.visibilityOriginMs + registers.clockElapsedMs;
  postToFrame(
    participantId,
    {
      channel: REPLAY_CHANNEL,
      type: 'start',
      session: connection.session,
      startMode: connection.startMode,
      mode: connection.diagnostic ? 'diagnostic' : 'invocation',
      startIndex: connection.resumeIndex,
      replayRunId: connection.replayRunId,
      ...(connection.timelineOriginMs === undefined
        ? {}
        : { timelineOriginMs: connection.timelineOriginMs }),
    },
    origin,
  );
  connection.started = true;
  connection.status = 'ready';
  if (connection.resumeIndex > 0)
    updateGlobalProgress(participantId, connection.resumeIndex);
  setFramePlaceholder(participantId, '');
  updateGlobalReplayState();
  if (connected())
    status.set(
      `Replay · ready${scheduledCount() > 0 ? ` · ${scheduledCount()} onglet(s) s’ouvriront au moment enregistré` : ` · ${frameConnections.size} onglet(s) préparé(s)`}.`,
    );
  // What waits for the tab is sent once the page says its replay exists
  // (`status: ready`, see `onStatus`): a command sent right behind `start` would
  // reach a page that has no replay yet, and be dropped without an answer.
}

/** The page created its replay: it can take the commands that were waiting. */
function onFrameReady(connection: ReplayFrameConnection): void {
  const { participantId } = connection;
  connection.frameReady = true;
  if (connection.pendingStep) {
    connection.pendingStep = false;
    send('step', {}, participantId);
  } else if (registers.playbackRequested) {
    send('play', {}, participantId);
  }
  seekHooks.drive();
}

function onInteraction(
  connection: ReplayFrameConnection,
  data: Readonly<Record<string, unknown>>,
): void {
  const { participantId } = connection;
  rememberResumeIndex(connection, data);
  setReplayActionTarget(participantId);
  const action = data['action'];
  const x = data['clientX'];
  const y = data['clientY'];
  if (data['kind'] === 'gesture') {
    if (
      typeof x === 'number' &&
      Number.isFinite(x) &&
      typeof y === 'number' &&
      Number.isFinite(y)
    ) {
      const scale = replayScales.get(participantId) ?? 1;
      const trigger = String(data['trigger'] ?? data['name'] ?? 'geste');
      const label =
        trigger === 'longPress'
          ? 'Appui long rejoué'
          : trigger === 'dragStart'
            ? 'Début du glissement rejoué'
            : trigger === 'drop'
              ? 'Dépôt rejoué'
              : trigger === 'dragCancel'
                ? 'Glissement annulé rejoué'
                : trigger === 'swipe'
                  ? 'Balayage rejoué'
                  : `Geste rejoué · ${trigger}`;
      showClickMarker(participantId, x * scale, y * scale, label, 'click');
    }
    return;
  }
  if (data['kind'] === 'hover') {
    if (
      action === 'enter' &&
      data['pointerId'] === -1 &&
      x === 0 &&
      y === 0
    ) {
      // Keyboard focus uses a synthetic pointer id and has no mouse location.
      hideClickMarker(participantId);
      return;
    }
    if (
      action === 'enter' &&
      typeof x === 'number' &&
      Number.isFinite(x) &&
      typeof y === 'number' &&
      Number.isFinite(y)
    ) {
      const scale = replayScales.get(participantId) ?? 1;
      showClickMarker(
        participantId,
        x * scale,
        y * scale,
        `Survol rejoué · ${String(data['name'] ?? 'interaction')}`,
        'hover',
      );
    } else if (action === 'leave') {
      hideClickMarker(participantId);
    }
    return;
  }
  if (
    (action === 'click' ||
      action === 'pointerdown' ||
      action === 'mousedown') &&
    typeof x === 'number' &&
    Number.isFinite(x) &&
    typeof y === 'number' &&
    Number.isFinite(y)
  ) {
    // Keyboard-activated clicks have no pointer position. Older recordings
    // serialize their coordinates as (0, 0); showing that as a mouse marker
    // makes the click appear in the viewport's top-left corner.
    if (action === 'click' && x === 0 && y === 0) {
      hideClickMarker(participantId);
      return;
    }
    const scale = replayScales.get(participantId) ?? 1;
    showClickMarker(
      participantId,
      x * scale,
      y * scale,
      `Clic rejoué · ${String(data['name'] ?? 'interaction')}`,
      action === 'click' ? 'click' : 'press',
    );
  }
}

function onViewportStep(
  connection: ReplayFrameConnection,
  data: Readonly<Record<string, unknown>>,
): void {
  const { participantId } = connection;
  rememberResumeIndex(connection, data);
  setReplayActionTarget(participantId);
  const viewport = parseViewport(data['width'], data['height']);
  if (!viewport) return;
  replayViewports.set(participantId, viewport);
  if (selectedParticipantId() === participantId) replayViewport.set(viewport);
  updateReplayViewport();
  hideClickMarker(participantId);
}

function onDifference(
  connection: ReplayFrameConnection,
  data: Readonly<Record<string, unknown>>,
  first: ReplayDifference,
): void {
  setNextActionCountdown(undefined);
  difference.set(first);
  registers.playbackRequested = false;
  registers.differenceParticipantId = connection.participantId;
  recordReplayDifference(connection.participantId, first);
  if (typeof data['index'] === 'number')
    updateGlobalProgress(connection.participantId, data['index']);
  if (typeof data['state'] === 'string') replayState.set(data['state']);
  if (replayState() !== 'playing') freezeReplayVisibilityClock();
  if (autoSkipDifferences() && first.skip) {
    status.set(
      `Décalage à l’événement ${first.eventId ?? '?'} · reprise automatique au checkpoint ${first.skip.checkpointEventId}.`,
    );
    send('skip-to-checkpoint', {}, connection.participantId);
  } else {
    status.set(`Premier écart détecté à l’événement ${first.eventId ?? '?'}.`);
  }
}

function onStep(
  connection: ReplayFrameConnection,
  data: Readonly<Record<string, unknown>>,
): void {
  // A page that reported an error has stopped its replay: a step answer that
  // arrives afterwards must not bring it back to "paused", or an advance would
  // ask for the same step again and again.
  if (connection.status === 'error') {
    registers.seekStepping = false;
    seekHooks.drive();
    return;
  }
  setNextActionCountdown(undefined);
  const index = typeof data['index'] === 'number' ? data['index'] : 0;
  const total = replayableEvents().length;
  const nextState =
    typeof data['state'] === 'string' ? data['state'] : 'paused';
  updateGlobalProgress(connection.participantId, index);
  connection.status = nextState;
  updateGlobalReplayState();
  status.set(
    replayState() === 'completed' || nextState === 'completed'
      ? `Replay terminé · ${replayIndex()} / ${total}`
      : `Replay · étape ${replayIndex()} / ${total}`,
  );
  registers.seekStepping = false;
  seekHooks.drive();
}

function onProgress(
  connection: ReplayFrameConnection,
  data: Readonly<Record<string, unknown>>,
): void {
  const { participantId } = connection;
  if (typeof data['index'] === 'number')
    updateGlobalProgress(participantId, data['index']);
  const nextState =
    typeof data['state'] === 'string' ? data['state'] : 'paused';
  if (nextState === 'completed') hideReplayDialog(participantId);
  connection.status = nextState;
  updateGlobalReplayState();
  setNextActionCountdown(
    nextState === 'playing' && typeof data['nextDelayMs'] === 'number'
      ? data['nextDelayMs']
      : undefined,
  );
  const total = replayableEvents().length;
  status.set(
    replayState() === 'completed'
      ? `Replay terminé · ${replayIndex()} / ${total}`
      : `Replay · ${data['state'] === 'playing' ? 'lecture' : 'étape'} ${replayIndex()} / ${total}`,
  );
}

function onRecovered(
  connection: ReplayFrameConnection,
  data: Readonly<Record<string, unknown>>,
): void {
  freezeReplayVisibilityClock();
  setNextActionCountdown(undefined);
  if (typeof data['index'] === 'number')
    updateGlobalProgress(connection.participantId, data['index']);
  connection.status = 'paused';
  updateGlobalReplayState();
  replayState.set('paused');
  difference.set(undefined);
  resolveLatestReplayDifference(connection.participantId, 'recovered');
  const href = data['href'];
  const destination =
    typeof href === 'string'
      ? `navigation vers ${new URL(href).pathname}`
      : 'point de contrôle restauré';
  status.set(`Reprise forcée · ${destination} · étape ${replayIndex()}`);
}

function onSkipped(
  connection: ReplayFrameConnection,
  data: Readonly<Record<string, unknown>>,
): void {
  freezeReplayVisibilityClock();
  setNextActionCountdown(undefined);
  if (typeof data['index'] === 'number')
    updateGlobalProgress(connection.participantId, data['index']);
  connection.status = 'paused';
  const from = data['from'];
  const skipped = {
    from: typeof from === 'number' ? from : replayIndex(),
    to: replayIndex(),
    checkpointEventId: String(data['checkpointEventId'] ?? 'inconnu'),
  };
  updateGlobalReplayState();
  replayState.set('paused');
  partialReplay.set(skipped);
  difference.set(undefined);
  resolveLatestReplayDifference(connection.participantId, 'skipped');
  status.set(
    `Replay partiel · intervalle ${skipped.from}–${skipped.to} ignoré · reprise en pause.`,
  );
}

function onError(
  connection: ReplayFrameConnection,
  data: Readonly<Record<string, unknown>>,
): void {
  hideReplayDialog(connection.participantId);
  freezeReplayVisibilityClock();
  setNextActionCountdown(undefined);
  connection.status = 'error';
  registers.differenceParticipantId = connection.participantId;
  replayState.set('error');
  endReplayLoadingIndicator();
  status.set(
    `Replay interrompu · ${String(data['message'] ?? 'erreur inconnue')}`,
  );
  const errorNote = `${REPLAY_ERROR_NOTE_PREFIX}${String(
    data['message'] ?? 'erreur inconnue',
  )}`;
  replayWarnings.update((notes) =>
    notes.includes(errorNote) ? notes : [...notes, errorNote].slice(-50),
  );
}

function onStatus(
  connection: ReplayFrameConnection,
  data: Readonly<Record<string, unknown>>,
): void {
  const nextState = String(data['status'] ?? 'état inconnu');
  if (nextState === 'stopped' || nextState === 'completed')
    hideReplayDialog(connection.participantId);
  connection.status = nextState;
  if (typeof data['index'] === 'number')
    updateGlobalProgress(connection.participantId, data['index']);
  updateGlobalReplayState();
  if (nextState !== 'playing') setNextActionCountdown(undefined);
  status.set(`Replay · ${nextState}`);
  if (nextState === 'ready' && connection.connected) onFrameReady(connection);
}

function onWarning(data: Readonly<Record<string, unknown>>): void {
  const warning = String(data['message'] ?? 'Événement de replay ignoré.');
  if (!warningIndexes.has(warning)) warningIndexes.set(warning, replayIndex());
  replayWarnings.update((warnings) =>
    warnings.includes(warning) ? warnings : [...warnings, warning].slice(-50),
  );
}

/** What a message from a replayed page asks of the dashboard. */
function handle(
  connection: ReplayFrameConnection,
  type: string,
  data: Readonly<Record<string, unknown>>,
  origin: string,
  importText: (text: string) => void,
): void {
  const { participantId } = connection;
  switch (type) {
    case 'ready':
      if (data['nonce'] === connection.nonce) onReady(connection, origin);
      break;
    case 'warning':
      onWarning(data);
      break;
    case 'error':
      onError(connection, data);
      break;
    case 'status':
      onStatus(connection, data);
      break;
    case 'recovered':
      onRecovered(connection, data);
      break;
    case 'skipped':
      onSkipped(connection, data);
      break;
    case 'progress':
      onProgress(connection, data);
      break;
    case 'interaction':
      onInteraction(connection, data);
      break;
    case 'scroll-step':
      rememberResumeIndex(connection, data);
      setReplayActionTarget(participantId);
      hideClickMarker(participantId);
      break;
    case 'viewport-step':
      onViewportStep(connection, data);
      break;
    case 'step':
    case 'difference': {
      const first = parseReplayDifference(data['difference']);
      if (first) onDifference(connection, data, first);
      else if (type === 'step') onStep(connection, data);
      break;
    }
    case 'export': {
      const text = data['session'];
      if (typeof text !== 'string') break;
      importText(text);
      status.set('Session v3 exportée dans le dashboard.');
      saveTextFile('craft-debug-session-v6.json', 'application/json', text);
      break;
    }
  }
}

/**
 * Starts listening to the replayed pages, once. `importText` is how an export
 * the page sends back becomes the open recording.
 */
export function listenToReplayBridge(importText: (text: string) => void): void {
  if (registers.bridgeListening) return;
  registers.bridgeListening = true;
  onWindowMessage((message) => {
    const connection = [...frameConnections.values()].find((candidate) =>
      isFrameWindow(candidate.participantId, message.source),
    );
    const target = parseLocalTarget(connection?.href ?? '');
    const data = message.data;
    if (
      !connection ||
      !target.ok ||
      message.origin !== target.url.origin ||
      !isRecord(data) ||
      data['channel'] !== REPLAY_CHANNEL
    )
      return;
    const type = data['type'];
    if (typeof type !== 'string') return;
    const { participantId } = connection;
    if (typeof data['href'] === 'string')
      updateReplayFrameUrl(participantId, data['href'], target.url.origin);
    if (typeof data['currentHref'] === 'string')
      updateReplayFrameUrl(
        participantId,
        data['currentHref'],
        target.url.origin,
      );
    if (
      type === 'interaction' ||
      type === 'scroll-step' ||
      type === 'viewport-step'
    )
      hideReplayDialog(participantId);
    if (type === 'dialog') {
      showReplayDialog(participantId, data['dialog']);
      return;
    }
    handle(connection, type, data, target.url.origin, importText);
  });
}

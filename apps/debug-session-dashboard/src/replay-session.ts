import { validateDebugSessionExport } from '@craft-ts/component';
import {
  after,
  currentHash,
  firstSelectedFile,
  hasFrame,
  hasFrameGrid,
  newUuid,
  renderFrames,
  setFramePlaceholder,
  goToHash,
  setTileHidden,
  cancelAfter,
} from './replay-browser';
import { handshake, listenToReplayBridge } from './replay-bridge';
import {
  isRecord,
  participantStartAtMs,
  parseLocalTarget,
  REPLAY_QUERY_MARKER,
  replaySessionStartAtMs,
  type ReplayFrameConnection,
} from './replay-model';
import {
  beginReplayLoadingIndicator,
  endReplayLoadingIndicator,
  launchDueReplayParticipants,
  launchReplayParticipant,
  pauseReplay,
  playReplay,
  prepareReplayVisibilityTimeline,
  send,
  setNextActionCountdown,
  setReplayActionTarget,
  stopReplayVisibilityClock,
  updateActiveReplayFrame,
  updateReplayViewport,
} from './replay-playback';
import {
  activeReplayParticipantId,
  canReplaySelectedSession,
  completedReplayEventIds,
  connected,
  diagnosticReplay,
  continuations,
  difference,
  differenceHistoryOpen,
  eventTimelinePage,
  events,
  frameConnections,
  handshakeTimers,
  importOpen,
  loadError,
  participantTitle,
  recordingClock,
  registers,
  replayableEvents,
  replayIndex,
  replayParticipantIds,
  replayState,
  replayViewport,
  replayWarnings,
  seekHooks,
  seekTarget,
  warningIndexes,
  dismissedWarnings,
  warningHistoryOpen,
  replayDifferences,
  rememberAutoSkipDifferences,
  routeSessionId,
  selectedParticipantId,
  session,
  sessionParticipants,
  sessionsForReplay,
  sessionText,
  showAllEvents,
  startMode,
  status,
  targetUrl,
} from './replay-state';

/**
 * What the dashboard does with a recording: open it, draw its tabs, start the
 * replay and steer it. The view calls these; the route and the archive call
 * the load ones.
 */

/* ── the stage ──────────────────────────────────────────────────────────── */

export function renderReplayFrames(): void {
  if (!hasFrameGrid()) return;
  const participantIds = replayParticipantIds();
  if (!participantIds.includes(activeReplayParticipantId() ?? ''))
    activeReplayParticipantId.set(participantIds[0]);
  renderFrames(
    participantIds.map((participantId) => {
      const participant = sessionParticipants().find(
        (item) => item.id === participantId,
      );
      return {
        participantId,
        title: participantTitle(participantId),
        startUrl: participant?.startUrl ?? '',
        colorScheme:
          participant?.environment?.colorScheme === 'dark' ? 'dark' : 'light',
        hidden: participantId !== activeReplayParticipantId(),
      };
    }),
    handshake,
  );
  updateReplayViewport();
}

/* ── opening a recording ────────────────────────────────────────────────── */

export function importJson(text: string): void {
  registers.loadedArchiveCreatedAtMs = undefined;
  sessionText.set(text);
  const result = validateDebugSessionExport(text.trim());
  if (!result.ok) {
    endReplayLoadingIndicator();
    session.set(undefined);
    events.set([]);
    status.set(result.error);
    loadError.set(result.error);
    return;
  }
  loadError.set(undefined);
  session.set(result.session);
  sessionParticipants.set(
    Array.isArray(result.session.participants)
      ? result.session.participants
      : [],
  );
  selectedParticipantId.set('all');
  eventTimelinePage.set(0);
  replayViewport.set(result.session.viewport);
  updateReplayViewport();
  events.set(result.session.events);
  if (!routeSessionId() && currentHash() !== '#/import') {
    goToHash('#/import');
  }
  difference.set(undefined);
  status.set(
    `Session v${result.session.version} importée · ${result.session.events.length} événements${result.session.truncated ? ' · archive tronquée, replay selon l’historique conservé par onglet' : ''}`,
  );
  const recordedUrl = parseLocalTarget(result.session.startUrl);
  if (recordedUrl.ok) targetUrl.set(recordedUrl.url.href);
  renderReplayFrames();
}

/** Starts the replay on the next turn, once the tabs it needs are drawn. */
export function scheduleReplayPreparation(): void {
  after(0, () => {
    if (canReplaySelectedSession()) startReplay();
    else endReplayLoadingIndicator();
  });
}

/** An archived session was asked for: clear what the last one left. */
export function beginSessionLoad(id: string): void {
  beginReplayLoadingIndicator();
  loadError.set(undefined);
  if (registers.loadedArchiveSessionId !== id) {
    session.set(undefined);
    events.set([]);
    difference.set(undefined);
    setNextActionCountdown(undefined);
    connected.set(false);
    replayState.set('idle');
    sessionText.set('');
  }
}

/** The archive answered: open the session unless the address moved on. */
export function completeSessionLoad(id: string, archived: unknown): void {
  if (routeSessionId() !== id) return;
  importJson(JSON.stringify(archived));
  registers.loadedArchiveCreatedAtMs =
    isRecord(archived) && typeof archived['createdAt'] === 'string'
      ? Date.parse(archived['createdAt'])
      : undefined;
  registers.loadedArchiveSessionId = id;
  const participants = sessionParticipants();
  if (
    (participants.length > 1 || session()?.truncated) &&
    replayParticipantIds().length === 0
  ) {
    status.set(
      isRecord(archived) && archived['truncated']
        ? 'Session tronquée · aucun onglet avec un historique complet ne peut être rejoué.'
        : 'Session chargée · aucun onglet ne contient d’action rejouable.',
    );
    endReplayLoadingIndicator();
    return;
  }
  after(0, () => {
    if (routeSessionId() !== id || registers.loadedArchiveSessionId !== id)
      return;
    if (!canReplaySelectedSession()) {
      status.set('Session chargée · aucun replay fiable à préparer.');
      endReplayLoadingIndicator();
      return;
    }
    startReplay();
  });
}

export function failSessionLoad(reason: string): void {
  endReplayLoadingIndicator();
  const message = `Impossible de charger la session · ${reason}`;
  status.set(message);
  loadError.set(message);
}

/** The address left the replay page: stop what was running in it. */
export function leaveReplayPage(): void {
  send('stop');
  registers.playbackRequested = false;
  for (const timer of handshakeTimers.values()) cancelAfter(timer);
  handshakeTimers.clear();
  frameConnections.clear();
  setNextActionCountdown(undefined);
  connected.set(false);
  replayState.set('idle');
}

export function openImport(): void {
  // A fresh sheet: not the last session that was opened.
  sessionText.set('');
  loadError.set(undefined);
  importOpen.set(true);
}

export function closeImport(): void {
  importOpen.set(false);
}

export function importPastedSession(): void {
  registers.loadedArchiveSessionId = undefined;
  importJson(sessionText());
  if (session()) importOpen.set(false);
  scheduleReplayPreparation();
}

/** A file picked in the import dialog. */
export function importSelectedFile(event: Event): void {
  const file = firstSelectedFile(event);
  if (!file) return;
  registers.loadedArchiveSessionId = undefined;
  void file
    .text()
    .then((text) => {
      importJson(text);
      if (session()) importOpen.set(false);
      scheduleReplayPreparation();
    })
    .catch((error: unknown) => status.set(String(error)));
}

export function setShowAllEvents(next: boolean): void {
  showAllEvents.set(next);
  eventTimelinePage.set(0);
}

/* ── steering the replay ────────────────────────────────────────────────── */

export function startReplay(): void {
  const slices = sessionsForReplay();
  if (slices.length === 0) {
    endReplayLoadingIndicator();
    return;
  }
  setNextActionCountdown(undefined);
  if (
    startMode() === 'snapshot' &&
    slices.some((item) => !item.session.snapshots?.length)
  ) {
    endReplayLoadingIndicator();
    status.set(
      'Au moins un onglet ne contient pas de snapshot versionné complet. Choisis le démarrage à l’URL.',
    );
    return;
  }
  difference.set(undefined);
  replayDifferences.set([]);
  differenceHistoryOpen.set(false);
  registers.differenceParticipantId = undefined;
  registers.actionParticipantId = undefined;
  registers.recordedActiveParticipantId = undefined;
  completedReplayEventIds.clear();
  stopReplayVisibilityClock();
  registers.clockElapsedMs = 0;
  registers.playbackRequested = false;
  if (registers.keepNotesOnStart) {
    registers.keepNotesOnStart = false;
  } else {
    replayWarnings.set([]);
    dismissedWarnings.set([]);
    warningIndexes.clear();
    seekTarget.set(undefined);
  }
  registers.seekStepping = false;
  warningHistoryOpen.set(false);
  frameConnections.clear();
  replayIndex.set(0);
  replayState.set('preparing');
  beginReplayLoadingIndicator();
  connected.set(false);
  const mode = startMode();
  renderReplayFrames();
  prepareReplayVisibilityTimeline();
  listenToReplayBridge(importJson);
  const timelineOriginMs = replaySessionStartAtMs(slices, recordingClock());
  const replayRunId = newUuid();
  const sharedTimeline = selectedParticipantId() === 'all' && slices.length > 1;
  status.set(
    sharedTimeline
      ? `Préparation de ${slices.length} onglets…`
      : 'Chargement et préparation du replay…',
  );
  for (const { participantId, session: replaySession } of slices) {
    const useRecordedUrl = mode === 'url' || sharedTimeline;
    const target = parseLocalTarget(
      useRecordedUrl ? replaySession.startUrl : targetUrl().trim(),
    );
    if (!target.ok || !hasFrame(participantId)) {
      endReplayLoadingIndicator();
      status.set(
        target.ok ? 'La frame de replay est introuvable.' : target.error,
      );
      continue;
    }
    if (!sharedTimeline && mode === 'url') targetUrl.set(target.url.href);
    if (useRecordedUrl) target.url.searchParams.set(REPLAY_QUERY_MARKER, '1');
    const participantTimelineOriginMs = participantStartAtMs(
      participantId,
      replaySession,
      recordingClock(),
    );
    const startOffsetMs = Math.max(
      0,
      participantTimelineOriginMs - timelineOriginMs,
    );
    const connection: ReplayFrameConnection = {
      participantId,
      replayRunId,
      href: target.url.href,
      nonce: '',
      connected: false,
      started: false,
      status: 'scheduled',
      resumeIndex: 0,
      session: replaySession,
      startMode: mode,
      diagnostic: diagnosticReplay(),
      timelineOriginMs: participantTimelineOriginMs,
      startOffsetMs,
    };
    frameConnections.set(participantId, connection);
    if (startOffsetMs > 0) {
      setFramePlaceholder(
        participantId,
        'Cet onglet s’ouvrira au moment enregistré.',
      );
      setTileHidden(participantId, false);
    }
  }
  launchDueReplayParticipants(0);
}

export function stepNextReplayAction(): void {
  const next = replayableEvents()[replayIndex()];
  if (!next) return;
  const participantId = next.participantId ?? replayParticipantIds()[0];
  if (!participantId) return;
  setReplayActionTarget(participantId);
  updateActiveReplayFrame();
  const connection = frameConnections.get(participantId);
  if (connection?.status === 'scheduled') {
    connection.pendingStep = true;
    registers.playbackRequested = false;
    launchReplayParticipant(connection);
    return;
  }
  send('step', {}, participantId);
}

/** Stop waiting for the next action: it starts now. Only meaningful while playing. */
export function skipReplayWait(): void {
  if (replayState() === 'playing') send('skip-wait');
}

/**
 * Replay again from the start, quickly, and stop right before the action a note
 * was raised on, so the gap can be looked at. The notes are kept.
 */
export function seekReplayToWarning(warning: string): void {
  const target = warningIndexes.get(warning);
  if (target === undefined) return;
  registers.keepNotesOnStart = true;
  startReplay();
  // `startReplay` refuses to start without slices: then nothing consumed it.
  registers.keepNotesOnStart = false;
  if (replayState() !== 'preparing') return;
  seekTarget.set(target);
  status.set(`Replay · retour à l’action ${target + 1}…`);
}

function driveSeek(): void {
  const target = seekTarget();
  if (target === undefined) return;
  if (
    difference() !== undefined ||
    ['error', 'completed'].includes(replayState()) ||
    replayIndex() >= target
  ) {
    seekTarget.set(undefined);
    if (replayIndex() >= target && replayState() !== 'error')
      status.set(
        `Replay · arrêté avant l’action ${target + 1}. « Action suivante » l’exécute.`,
      );
    return;
  }
  if (!['ready', 'paused'].includes(replayState())) return;
  if (registers.seekStepping) return;
  registers.seekStepping = true;
  stepNextReplayAction();
}
seekHooks.drive = driveSeek;

export function stopReplay(): void {
  seekTarget.set(undefined);
  registers.seekStepping = false;
  send('stop');
  registers.playbackRequested = false;
  stopReplayVisibilityClock();
  registers.clockElapsedMs = 0;
  updateActiveReplayFrame(0);
  setNextActionCountdown(undefined);
  difference.set(undefined);
  status.set('Replay arrêté.');
}

export { pauseReplay, playReplay };

export function selectParticipant(value: string): void {
  stopReplayVisibilityClock();
  registers.playbackRequested = false;
  registers.clockElapsedMs = 0;
  send('stop');
  for (const timer of handshakeTimers.values()) cancelAfter(timer);
  handshakeTimers.clear();
  frameConnections.clear();
  completedReplayEventIds.clear();
  connected.set(false);
  replayState.set('idle');
  selectedParticipantId.set(continuations().get(value) ?? value);
  eventTimelinePage.set(0);
  replayIndex.set(0);
  const participant = sessionParticipants().find((item) => item.id === value);
  replayViewport.set(participant?.viewport ?? session()?.viewport);
  if (participant?.startUrl) {
    const parsed = parseLocalTarget(participant.startUrl);
    if (parsed.ok) targetUrl.set(parsed.url.href);
  }
  renderReplayFrames();
  updateReplayViewport();
  scheduleReplayPreparation();
}

/** Asks the replayed page to apply the state the recording expected. */
export function forceReplayRecovery(): void {
  status.set('Application de la reprise forcée…');
  if (registers.differenceParticipantId)
    send('force-recover', {}, registers.differenceParticipantId);
}

/** Asks the replayed page to jump to the next checkpoint it can resume from. */
export function skipToCheckpoint(): void {
  if (!difference()?.skip) return;
  rememberAutoSkipDifferences(true);
  status.set('Restauration du prochain checkpoint…');
  if (registers.differenceParticipantId)
    send('skip-to-checkpoint', {}, registers.differenceParticipantId);
}

/** Asks the replayed page for the session it captured, to open and download it. */
export function exportTarget(): void {
  const participantId =
    selectedParticipantId() === 'all'
      ? replayParticipantIds()[0]
      : selectedParticipantId();
  if (participantId) send('export', {}, participantId);
  status.set('Export demandé à l’application cible…');
}

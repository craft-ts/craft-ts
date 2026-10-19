import { getReplaySteps } from '@craft-ts/component';
import {
  after,
  cancelAfter,
  cancelEvery,
  every,
  hasFrame,
  hideDialogOverlay,
  layoutFrames,
  loadFrame,
  monotonicMs,
  observeStage,
  paintTiles,
  postToFrame,
  setFrameAddress,
  setFramePlaceholder,
  setTileHidden,
  showDialogOverlay,
} from './replay-browser';
import {
  describeReplayDialog,
  parseLocalTarget,
  REPLAY_CHANNEL,
  REPLAY_QUERY_MARKER,
  replaySessionStartAtMs,
  terminalStateOf,
  visibilityTimeline,
  type ReplayFrameConnection,
} from './replay-model';
import {
  activeReplayParticipantId,
  completedReplayEventIds,
  connected,
  continuations,
  dialogTimers,
  frameConnections,
  hasDifference,
  nextActionDelayMs,
  participantStates,
  recordingClock,
  registers,
  replayableEvents,
  replayIndex,
  replayParticipantIds,
  replayScales,
  replaySkeletonVisible,
  replayState,
  replayViewports,
  replayViewportScale,
  selectedParticipantId,
  session,
  sessionForParticipant,
  sessionParticipants,
  sessionsForReplay,
} from './replay-state';

/**
 * The replay while it runs: the loading veil, the countdown to the next
 * action, the clock that tells which tab was in front, and the progress the
 * tabs report. Everything here reads and writes the state; the browser is
 * reached through `replay-browser`.
 */

/* ── the loading veil ───────────────────────────────────────────────────── */

export function beginReplayLoadingIndicator(): void {
  if (replaySkeletonVisible() || registers.skeletonTimer !== undefined) return;
  replaySkeletonVisible.set(false);
  registers.skeletonTimer = after(300, () => {
    replaySkeletonVisible.set(true);
    registers.skeletonTimer = undefined;
  });
}

export function endReplayLoadingIndicator(): void {
  if (registers.skeletonTimer !== undefined) {
    cancelAfter(registers.skeletonTimer);
    registers.skeletonTimer = undefined;
  }
  replaySkeletonVisible.set(false);
}

/* ── the countdown to the next action ───────────────────────────────────── */

export function setNextActionCountdown(delayMs: number | undefined): void {
  if (registers.countdownTimer !== undefined) {
    cancelEvery(registers.countdownTimer);
    registers.countdownTimer = undefined;
  }
  if (delayMs === undefined || !Number.isFinite(delayMs)) {
    nextActionDelayMs.set(undefined);
    return;
  }

  const duration = Math.max(0, delayMs);
  const startedAt = monotonicMs();
  nextActionDelayMs.set(duration);
  if (duration === 0) return;
  registers.countdownTimer = every(100, () => {
    const remaining = Math.max(0, duration - (monotonicMs() - startedAt));
    nextActionDelayMs.set(remaining);
    if (remaining === 0 && registers.countdownTimer !== undefined) {
      cancelEvery(registers.countdownTimer);
      registers.countdownTimer = undefined;
    }
  });
}

/* ── the stage ──────────────────────────────────────────────────────────── */

export function updateReplayViewport(): void {
  const scaled = layoutFrames(
    replayParticipantIds().map((participantId) => ({
      participantId,
      viewport: () =>
        replayViewports.get(participantId) ??
        sessionForParticipant(participantId)?.viewport ??
        session()?.viewport,
    })),
  );
  if (!scaled) return;
  let primaryScale = 1;
  for (const { participantId, scale } of scaled) {
    replayScales.set(participantId, scale);
    if (participantId === selectedParticipantId() || primaryScale === 1)
      primaryScale = scale;
  }
  replayViewportScale.set(primaryScale);
}

export function observeReplayStage(): void {
  observeStage(updateReplayViewport);
}

/* ── what a replayed page shows ─────────────────────────────────────────── */

export function hideReplayDialog(participantId: string): void {
  const timer = dialogTimers.get(participantId);
  if (timer !== undefined) cancelAfter(timer);
  dialogTimers.delete(participantId);
  hideDialogOverlay(participantId);
}

export function showReplayDialog(participantId: string, value: unknown): void {
  const dialog = describeReplayDialog(value);
  if (!dialog) return;
  hideReplayDialog(participantId);
  if (!showDialogOverlay(participantId, dialog)) return;
  if (dialog.durationMs > 0)
    dialogTimers.set(
      participantId,
      after(dialog.durationMs + 250, () => hideReplayDialog(participantId)),
    );
}

export function updateReplayFrameUrl(
  participantId: string,
  value: unknown,
  expectedOrigin: string,
): void {
  if (typeof value !== 'string') return;
  try {
    const url = new URL(value);
    if (url.origin !== expectedOrigin) return;
    // The replay marker is added by the dashboard and is not part of the
    // page's meaningful location.
    url.searchParams.delete(REPLAY_QUERY_MARKER);
    setFrameAddress(participantId, url.href);
  } catch {
    // Ignore malformed URLs from the embedded application.
  }
}

/* ── which tab is in front ──────────────────────────────────────────────── */

export function updateReplayTileIndicators(): void {
  paintTiles(
    registers.visibilityParticipantIds.map((id) => {
      const recordedActive = registers.recordedActiveParticipantId === id;
      const actionTarget = registers.actionParticipantId === id;
      const state = participantStates.get(id)?.state;
      const message =
        state === 'hidden'
          ? 'Non visible'
          : state === 'closed'
            ? 'Onglet fermé'
            : state === 'interrupted'
              ? 'Connexion interrompue'
              : undefined;
      return {
        participantId: id,
        focus: recordedActive,
        action: actionTarget,
        badge:
          recordedActive && actionTarget
            ? 'ACTIF · ACTION'
            : recordedActive
              ? 'ACTIF'
              : actionTarget
                ? 'ACTION'
                : '',
        veil:
          message === undefined
            ? undefined
            : { message, dim: state === 'hidden' },
      };
    }),
  );
}

export function setReplayActionTarget(participantId: string): void {
  registers.actionParticipantId = participantId;
  activeReplayParticipantId.set(participantId);
  updateReplayTileIndicators();
}

export function updateActiveReplayFrame(
  elapsedMs = registers.clockElapsedMs,
): void {
  const participantIds = registers.visibilityParticipantIds;
  if (participantIds.length === 0) return;
  const at = registers.visibilityOriginMs + elapsedMs;
  let changed = false;
  for (
    let change = registers.visibilityTimeline[registers.visibilityCursor];
    change !== undefined && change.time <= at;
    change = registers.visibilityTimeline[registers.visibilityCursor]
  ) {
    registers.visibilityCursor += 1;
    participantStates.set(change.participantId, {
      state: change.state,
      time: change.time,
    });
    changed = true;
  }
  if (!changed) {
    updateReplayTileIndicators();
    return;
  }
  const states = [...participantStates.entries()];
  const focused = states
    .filter(([, value]) => value.state === 'visible')
    .sort((left, right) => right[1].time - left[1].time)[0];
  const fallback = states
    .filter(
      ([, value]) =>
        value.state !== 'hidden' &&
        value.state !== 'closed' &&
        value.state !== 'interrupted',
    )
    .sort((left, right) => right[1].time - left[1].time)[0];
  const participantId = (focused ?? fallback)?.[0] ?? participantIds[0];
  registers.recordedActiveParticipantId = focused?.[0];
  if (!participantId) return;
  if (participantId !== activeReplayParticipantId())
    activeReplayParticipantId.set(participantId);
  updateReplayTileIndicators();
  for (const id of participantIds) {
    const scheduled = frameConnections.get(id)?.status === 'scheduled';
    setTileHidden(
      id,
      scheduled
        ? false
        : selectedParticipantId() === 'all'
          ? false
          : id !== participantId,
    );
  }
}

/** A tab that ended in the recording shows how, once the replay is over. */
export function applyReplayTerminalParticipantStates(): void {
  let changed = false;
  for (const participant of sessionParticipants()) {
    if (!registers.visibilityParticipantIds.includes(participant.id)) continue;
    const state = terminalStateOf(participant);
    if (!state) continue;
    participantStates.set(participant.id, {
      state,
      time: Number.POSITIVE_INFINITY,
    });
    changed = true;
  }
  if (changed) updateReplayTileIndicators();
}

export function prepareReplayVisibilityTimeline(): void {
  registers.visibilityParticipantIds = replayParticipantIds();
  registers.recordedActiveParticipantId = undefined;
  const slices = sessionsForReplay();
  const clock = recordingClock();
  registers.visibilityOriginMs = replaySessionStartAtMs(slices, clock);
  registers.visibilityTimeline = visibilityTimeline(
    slices,
    clock,
    registers.visibilityParticipantIds,
    continuations(),
  );
  registers.visibilityCursor = 0;
  participantStates.clear();
  updateActiveReplayFrame(0);
  if (replayableEvents().length === 0) applyReplayTerminalParticipantStates();
}

/* ── the tabs' progress ─────────────────────────────────────────────────── */

export function updateGlobalProgress(
  participantId: string,
  localIndex: number,
): void {
  const participantSession = sessionForParticipant(participantId);
  if (!participantSession) return;
  const localActions = getReplaySteps(participantSession.events);
  for (const event of localActions.slice(0, Math.max(0, localIndex)))
    completedReplayEventIds.add(event.id);
  const ordered = replayableEvents();
  let completedPrefix = 0;
  for (
    let next = ordered[completedPrefix];
    next !== undefined && completedReplayEventIds.has(next.id);
    next = ordered[completedPrefix]
  )
    completedPrefix += 1;
  replayIndex.set(completedPrefix);
}

export function updateGlobalReplayState(): void {
  const activeIds = replayParticipantIds();
  const active = activeIds.map((id) => frameConnections.get(id));
  const framesConnected =
    active.length > 0 &&
    active.every(
      (connection) =>
        connection !== undefined &&
        ((connection.connected && connection.started) ||
          connection.status === 'scheduled' ||
          (connection.status === 'preparing' &&
            (registers.playbackRequested || connection.startOffsetMs > 0))),
    );
  connected.set(framesConnected);
  const states = active.flatMap((connection) =>
    connection ? [connection.status] : [],
  );
  // todoR imperative code
  if (states.includes('error')) replayState.set('error');
  // The global cursor advances only after an interaction has settled and its
  // participant has reported progress. Hidden iframe timers can delay the
  // final "completed" status message even after every recorded action ran.
  else if (
    replayableEvents().length > 0 &&
    replayIndex() >= replayableEvents().length &&
    !hasDifference()
  )
    replayState.set('completed');
  else if (
    states.includes('playing') ||
    (registers.playbackRequested &&
      states.some((state) => state !== 'completed' && state !== 'error'))
  )
    replayState.set('playing');
  else if (states.length > 0 && states.every((state) => state === 'completed'))
    replayState.set('completed');
  else if (states.includes('paused')) replayState.set('paused');
  else if (framesConnected) replayState.set('ready');
  else replayState.set('preparing');
  const hasStartedParticipant = active.some(
    (connection) => connection?.connected && connection.started,
  );
  if (hasStartedParticipant || states.includes('error'))
    endReplayLoadingIndicator();
  if (replayState() === 'completed') applyReplayTerminalParticipantStates();
  if (replayState() !== 'playing' && registers.clockStartedAt !== undefined) {
    freezeReplayVisibilityClock();
  }
}

/* ── talking to the tabs ────────────────────────────────────────────────── */

/** Sends a command to every connected tab, or to one. */
export function send(
  type: string,
  payload: Readonly<Record<string, unknown>> = {},
  participantId?: string,
): void {
  const connections = participantId
    ? [frameConnections.get(participantId)]
    : [...frameConnections.values()];
  for (const connection of connections) {
    if (!connection?.connected) continue;
    const target = parseLocalTarget(connection.href);
    if (!target.ok) continue;
    postToFrame(
      connection.participantId,
      {
        channel: REPLAY_CHANNEL,
        type,
        replayRunId: connection.replayRunId,
        ...payload,
      },
      target.url.origin,
    );
  }
}

/* ── opening the tabs, the clock ────────────────────────────────────────── */

export function launchReplayParticipant(
  connection: ReplayFrameConnection,
): void {
  if (connection.status !== 'scheduled') return;
  if (!hasFrame(connection.participantId)) return;
  connection.status = 'preparing';
  setFramePlaceholder(
    connection.participantId,
    'Ouverture au moment enregistré…',
  );
  loadFrame(connection.participantId, connection.href);
  updateGlobalReplayState();
}

export function launchDueReplayParticipants(elapsedMs: number): void {
  for (const connection of frameConnections.values()) {
    if (
      connection.status === 'scheduled' &&
      connection.startOffsetMs <= elapsedMs
    )
      launchReplayParticipant(connection);
  }
}

export function stopReplayVisibilityClock(): void {
  if (registers.clockTimer !== undefined) cancelEvery(registers.clockTimer);
  registers.clockTimer = undefined;
  registers.clockStartedAt = undefined;
}

export function freezeReplayVisibilityClock(): void {
  if (registers.clockStartedAt !== undefined)
    registers.clockElapsedMs += monotonicMs() - registers.clockStartedAt;
  stopReplayVisibilityClock();
  updateActiveReplayFrame(registers.clockElapsedMs);
}

export function playReplay(): void {
  registers.playbackRequested = true;
  send('play');
  stopReplayVisibilityClock();
  const baseElapsedMs = registers.clockElapsedMs;
  registers.clockStartedAt = monotonicMs();
  registers.clockTimer = every(40, () => {
    if (registers.clockStartedAt === undefined) return;
    registers.clockElapsedMs =
      baseElapsedMs + monotonicMs() - registers.clockStartedAt;
    launchDueReplayParticipants(registers.clockElapsedMs);
    updateActiveReplayFrame(registers.clockElapsedMs);
    if (replayState() === 'completed' || replayState() === 'error')
      stopReplayVisibilityClock();
  });
  updateActiveReplayFrame(registers.clockElapsedMs);
}

export function pauseReplay(): void {
  registers.playbackRequested = false;
  freezeReplayVisibilityClock();
  send('pause');
}

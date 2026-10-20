import type { SendContextEvent } from '@craft-ts/core';
import {
  clockLabel,
  countdownLabel,
  plural,
  replayStateLabels,
  nextActionLabel,
} from './replay-model';
import {
  errorCount,
  events,
  nextActionDelayMs,
  replayableEvents,
  replayActionOffsetsMs,
  replayableParticipants,
  replayIndex,
  replayParticipantIds,
  replayState,
  replayViewport,
  replayViewportScale,
  selectedParticipantId,
  session,
  showAllEvents,
  visibleEvents,
} from './replay-state';

/** The sentences the replay page reads out, built from what the state holds. */

export const sessionDate = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function nextActionTimingLabel(): string {
  return replayState() === 'playing' ? countdownLabel(nextActionDelayMs()) : '';
}

export function progressLabel(): string {
  const total = replayableEvents().length;
  if (!total) return 'Aucune étape rejouable dans cette session.';
  const state = replayStateLabels[replayState()] ?? replayState();
  return `${replayIndex()} / ${total} étapes · ${state}`;
}

/** The whole recorded timeline, from the first action to the last. */
export function replayDurationMs(): number {
  return replayActionOffsetsMs().at(-1) ?? 0;
}

/**
 * Where the replay is on that timeline: the last action it ran, moving on
 * toward the next one as the countdown runs down.
 */
export function replayElapsedMs(): number {
  const offsets = replayActionOffsetsMs();
  const index = replayIndex();
  const next = offsets[index];
  if (next === undefined) return replayDurationMs();
  const previous = index > 0 ? (offsets[index - 1] ?? 0) : 0;
  const remaining =
    replayState() === 'playing' ? nextActionDelayMs() : undefined;
  return remaining === undefined
    ? previous
    : Math.min(next, Math.max(previous, next - remaining));
}

/** How far along the timeline, as a share of its duration. */
export function replayElapsedShare(): number {
  const total = replayDurationMs();
  if (total > 0) return (replayElapsedMs() / total) * 100;
  const steps = replayableEvents().length;
  return steps > 0 && replayIndex() >= steps ? 100 : 0;
}

export function timeProgressLabel(): string {
  if (!replayableEvents().length) return '';
  return `Temps · ${clockLabel(replayElapsedMs())} / ${clockLabel(replayDurationMs())}`;
}

export function timeRemainingLabel(): string {
  if (!replayableEvents().length) return '';
  return `reste ${clockLabel(replayDurationMs() - replayElapsedMs())}`;
}

export function currentNextActionLabel(): string {
  return nextActionLabel(replayableEvents()[replayIndex()]);
}

export function journalSummary(): string {
  if (showAllEvents()) return plural(visibleEvents().length, 'événement');
  return errorCount() === 0
    ? 'Aucune erreur dans cet enregistrement.'
    : plural(errorCount(), 'erreur');
}

export function eventElapsedLabel(item: SendContextEvent): string {
  const firstTimestamp = visibleEvents()[0]?.timestamp ?? item.timestamp;
  const elapsed =
    selectedParticipantId() === 'all'
      ? (item.globalElapsedMs ??
        item.elapsedMs ??
        item.timestamp - firstTimestamp)
      : (item.elapsedMs ?? item.timestamp - firstTimestamp);
  return elapsed >= 1000
    ? `${(elapsed / 1000).toFixed(1)} s`
    : `${elapsed.toFixed(0)} ms`;
}

export function recordingCaption(): string {
  const recorded = session();
  if (!recorded)
    return 'La session demandée est introuvable ou a été supprimée.';
  const truncated = recorded.truncated
    ? ' · archive tronquée, onglets incomplets exclus du replay'
    : '';
  return `Format v${recorded.version} · ${plural(events().length, 'événement')}${truncated}`;
}

export function viewportCaption(): string {
  if (selectedParticipantId() === 'all' && replayableParticipants().length > 1)
    return `${replayParticipantIds().length} viewports participants · lecture synchronisée`;
  const viewport = replayViewport() ?? session()?.viewport;
  return viewport
    ? `Viewport enregistré · ${viewport.width} × ${viewport.height} px · aperçu à ${Math.round(replayViewportScale() * 100)} %`
    : 'Viewport non enregistré · aperçu adaptatif';
}

import type { SendContextEvent } from '@craft-ts/core';
import { countdownLabel, plural, replayStateLabels, nextActionLabel } from './replay-model';
import {
  errorCount,
  events,
  nextActionDelayMs,
  replayableEvents,
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

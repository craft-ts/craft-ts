import { craftComputed, craftService } from '@craft-ts/core';
import { SessionArchive } from '../../shared/data-access/session-archive.service';
import {
  autoSkipDifferences,
  canForceRecovery,
  canSkipDifference,
  difference,
  differenceNoticeDismissed,
  hasDifference,
  loadError,
  partialReplay,
  pendingWarnings,
  status,
  activeRouteSessionId,
  connected,
  page,
  replayIndex,
  replaySkeletonVisible,
  replayState,
  replayableParticipants,
  replayableEvents,
  routeSessionId,
  seekTarget,
  session,
  diagnosticReplay,
} from '../../shared/state/replay-state';
import { i18n } from '../../shared/util/catalog';
import { plural } from '../../shared/util/replay-model';
import {
  currentNextActionLabel,
  nextActionTimingLabel,
  progressLabel,
  replayDurationMs,
  replayElapsedMs,
  scrubValueText,
  seekProgressLabel,
  timeProgressLabel,
  timeRemainingLabel,
} from '../../shared/util/replay-labels';
import {
  derivationLabel,
  shortUrl,
  sourceSessionIdOf,
} from '../../shared/util/session-lineage';
import { replaySessionTitle } from './replay-title';

function recordingFacts(recorded: ReturnType<typeof session>): string {
  if (!recorded) return '';
  return [
    shortUrl(recorded.startUrl),
    plural(recorded.participants?.length ?? 1, 'onglet'),
    plural(recorded.events.length, 'événement'),
  ].join(' · ');
}

function replayPlayLabel(state: string): string {
  switch (state) {
    case 'playing':
      return i18n.t('copy.copy129');
    case 'paused':
      return i18n.t('copy.copy130');
    case 'completed':
      return i18n.t('copy.copy131');
    default:
      return i18n.t('copy.copy132');
  }
}

function differenceMessageFor(
  currentDifference: ReturnType<typeof difference>,
): string {
  const transport = currentDifference?.transport;
  if (transport?.transportId.startsWith('network:')) {
    const api = transport.transportId.slice('network:'.length);
    const transportName =
      api === 'websocket'
        ? 'WebSocket'
        : api === 'fetch'
          ? 'fetch'
          : api === 'xhr'
            ? 'XMLHttpRequest'
            : api;
    const networkAction =
      api === 'websocket'
        ? i18n.t('networkActionWebSocket')
        : i18n.t('networkActionRequest', { detail: transportName });
    return i18n.t('copy.copy068') + networkAction + i18n.t('copy.copy069');
  }
  return i18n.t('copy.copy070');
}

/** The page title and visibility derived from the active replay route. */
export const { ReplayPageViewModel } = craftService(
  { name: 'replayPageViewModel', providedIn: 'global' },
  function* () {
    const archive = yield* SessionArchive();
    const savedSessions = archive.sessions.savedSessions;

    yield* craftComputed('titleText', function* () {
      const sessions = yield* savedSessions();
      return replaySessionTitle(
        sessions.find((item) => item.id === routeSessionId()),
        session(),
      );
    });
    yield* craftComputed('pageIsHidden', () => page() !== 'detail');
    yield* craftComputed('sessionFacts', () => recordingFacts(session()));
    const recipes = archive.recipeCatalog.resumeRecipeList;
    const summary = yield* craftComputed('summary', function* () {
      const sessions = yield* savedSessions();
      return sessions.find((item) => item.id === routeSessionId());
    });
    const summaryValue = summary;
    yield* craftComputed('derivation', function* () {
      const selected = yield* summaryValue();
      const sessions = yield* savedSessions();
      const resumeRecipes = yield* recipes();
      return selected
        ? i18n.t('derivationSummary', {
            derivation: derivationLabel(selected, sessions, resumeRecipes),
          })
        : '';
    });
    const sourceId = yield* craftComputed('sourceId', function* () {
      const selected = yield* summaryValue();
      return selected
        ? sourceSessionIdOf(selected, yield* recipes())
        : undefined;
    });
    const sourceIdValue = sourceId;
    yield* craftComputed('sourceKnown', function* () {
      const sessions = yield* savedSessions();
      const source = yield* sourceIdValue();
      return sessions.some((item) => item.id === source);
    });
    yield* craftComputed(
      'participantFilterHidden',
      () => replayableParticipants().length <= 1,
    );
    yield* craftComputed('fullscreenDisabled', () => !connected());
    yield* craftComputed('debugDisabled', () => !session());
    yield* craftComputed(
      'resumeDisabled',
      () => activeRouteSessionId() === undefined,
    );
    yield* craftComputed('skeletonHidden', () => !replaySkeletonVisible());
    yield* craftComputed('seekOverlayHidden', () => seekTarget() === undefined);
    yield* craftComputed('seekProgress', seekProgressLabel);
    yield* craftComputed(
      'canStep',
      () =>
        !connected() ||
        !replayableEvents()[replayIndex()] ||
        !['ready', 'paused'].includes(replayState()),
    );
    yield* craftComputed('playLabel', () => replayPlayLabel(replayState()));
    yield* craftComputed('diagnosticLabel', () =>
      diagnosticReplay() ? i18n.t('copy.copy135') : i18n.t('copy.copy136'),
    );
    yield* craftComputed(
      'playDisabled',
      () =>
        !['playing', 'completed'].includes(replayState()) &&
        (!connected() ||
          !replayableEvents()[replayIndex()] ||
          !['ready', 'paused'].includes(replayState())),
    );
    yield* craftComputed(
      'restartDisabled',
      () =>
        !['playing', 'paused', 'completed', 'error'].includes(replayState()),
    );
    yield* craftComputed('ariaValueMax', () =>
      Math.round(replayDurationMs() / 1000),
    );
    yield* craftComputed('ariaValueNow', () =>
      Math.round(replayElapsedMs() / 1000),
    );
    yield* craftComputed('ariaValueText', scrubValueText);
    yield* craftComputed('ariaDisabled', () =>
      replayableEvents().length === 0
        ? i18n.t('copy.copy146')
        : i18n.t('copy.copy147'),
    );
    yield* craftComputed('timeProgress', timeProgressLabel);
    yield* craftComputed('timeRemaining', timeRemainingLabel);
    yield* craftComputed('timelineProgress', progressLabel);
    yield* craftComputed('nextAction', currentNextActionLabel);
    yield* craftComputed(
      'nextActionTimingHidden',
      () => nextActionTimingLabel() === '',
    );
    yield* craftComputed(
      'nextActionTimingText',
      () => ` · ${nextActionTimingLabel()}`,
    );
    yield* craftComputed('partialMessage', () => {
      const skipped = partialReplay();
      return skipped
        ? i18n.t('copy.copy071') +
            skipped.from +
            i18n.t('copy.copy072') +
            skipped.to +
            i18n.t('copy.copy073') +
            skipped.checkpointEventId
        : '';
    });
    yield* craftComputed('problemMessage', () => loadError() ?? status());
    yield* craftComputed(
      'differenceHidden',
      () => !hasDifference() || differenceNoticeDismissed(),
    );
    yield* craftComputed('differenceMessage', () =>
      differenceMessageFor(difference()),
    );
    yield* craftComputed(
      'toleranceHidden',
      () => !difference()?.tolerances?.length,
    );
    yield* craftComputed('toleranceMessage', () => {
      const rules = difference()?.tolerances ?? [];
      return (
        i18n.t('copy.copy074') +
        rules
          .map((rule) => `${rule.kind} ${rule.path} (${rule.assertionId})`)
          .join(', ') +
        '.'
      );
    });
    yield* craftComputed(
      'skipCheckpointHidden',
      () => !canSkipDifference() || autoSkipDifferences(),
    );
    yield* craftComputed('forceRecoveryHidden', () => !canForceRecovery());
    yield* craftComputed('autoSkipHidden', () => !autoSkipDifferences());
    yield* craftComputed(
      'skipExplanationHidden',
      () => autoSkipDifferences() || !canSkipDifference(),
    );
    yield* craftComputed('partialHidden', () => partialReplay() === undefined);
    yield* craftComputed(
      'problemHidden',
      () => loadError() === undefined && replayState() !== 'error',
    );
    yield* craftComputed('visibleWarnings', () => pendingWarnings().slice(-2));
    yield* craftComputed(
      'warningsHidden',
      () => pendingWarnings().length === 0,
    );
    yield* craftComputed('toastBarHidden', () => pendingWarnings().length <= 1);
    yield* craftComputed('toastMessage', () => {
      const total = pendingWarnings().length;
      const hidden = total - 2;
      return hidden > 0
        ? i18n.t('copy.copy084') +
            hidden +
            i18n.t('copy.copy085') +
            total +
            i18n.t('copy.copy086')
        : i18n.t('copy.copy087') + total + i18n.t('copy.copy088');
    });
  },
);

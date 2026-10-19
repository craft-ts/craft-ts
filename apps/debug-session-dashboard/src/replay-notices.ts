import {
  button,
  content,
  craftComponent,
  details,
  div,
  p,
  pre,
  span,
  summary,
} from '@craft-ts/component';
import { ɵcomputed as computed } from '@craft-ts/core';
import { DocCallout } from '@craft-ts/ui';
import { buttonUi } from '@craft-ts/ui/style';
import { ui } from './dashboard.style';
import { forceReplayRecovery, skipToCheckpoint } from './replay-session';
import {
  canForceRecovery,
  canSkipDifference,
  difference,
  hasDifference,
  loadError,
  partialReplay,
  replayState,
  replayWarnings,
  status,
} from './replay-state';
import { lit } from './view-helpers';

/** What the replay has to say when it leaves the recording or cannot go on. */
export const ReplayNotices = craftComponent('ReplayNotices', {}, function* () {
  const diff = div(
    {
      class: ui.gap,
      'data-lab': 'diff',
      hidden: computed(() => !hasDifference()),
    },
    [
      DocCallout({
        tone: lit('warning'),
        caption: lit('Le replay s’écarte de l’enregistrement'),
        body: content(() => [
          div({ class: ui.gap }, [
            p(
              computed(() =>
                difference()?.transport
                  ? `Écart transport ${difference()!.transport!.transportId}, instance ${difference()!.transport!.instanceId}, ${difference()!.transport!.direction} ${difference()!.transport!.sequence}.`
                  : `Premier écart à l’événement ${difference()?.eventId ?? '?'}. La lecture est en pause.`,
              ),
            ),
            details([
              summary('Voir le détail'),
              div({ class: ui.compare }, [
                div([
                  span({ class: ui.compareLabel }, 'Attendu'),
                  pre(
                    { class: ui.code },
                    computed(() =>
                      JSON.stringify(difference()?.expected, null, 2),
                    ),
                  ),
                ]),
                div([
                  span({ class: ui.compareLabel }, 'Observé'),
                  pre(
                    { class: ui.code },
                    computed(() =>
                      JSON.stringify(difference()?.actual, null, 2),
                    ),
                  ),
                ]),
              ]),
            ]),
            div({ class: ui.gapActions }, [
              button(
                'forceReplayRecovery',
                {
                  type: 'button',
                  class: buttonUi.root,
                  'data-variant': 'primary',
                  'data-lab': 'force-recovery',
                  hidden: computed(() => !canForceRecovery()),
                  click: forceReplayRecovery,
                },
                'Forcer l’état attendu et continuer',
              ),
              button(
                'skipToCheckpoint',
                {
                  type: 'button',
                  class: buttonUi.root,
                  'data-variant': 'secondary',
                  'data-lab': 'force-recovery',
                  hidden: computed(() => !canSkipDifference()),
                  click: skipToCheckpoint,
                },
                'Ignorer jusqu’au prochain point de reprise',
              ),
            ]),
          ]),
        ]),
      }),
    ],
  );

  const partial = div(
    {
      class: ui.gap,
      'data-lab': 'partial',
      hidden: computed(() => partialReplay() === undefined),
    },
    [
      DocCallout({
        tone: lit('info'),
        caption: lit('Replay partiel'),
        body: content(() => [
          p(
            computed(() => {
              const skipped = partialReplay();
              return skipped
                ? `Replay partiel · portion ${skipped.from}–${skipped.to} ignorée · checkpoint ${skipped.checkpointEventId}`
                : '';
            }),
          ),
        ]),
      }),
    ],
  );

  const problem = div(
    {
      class: ui.gap,
      'data-lab': 'problem',
      hidden: computed(
        () => loadError() === undefined && replayState() !== 'error',
      ),
    },
    [
      DocCallout({
        tone: lit('danger'),
        caption: lit('Impossible de poursuivre'),
        body: content(() => [p(computed(() => loadError() ?? status()))]),
      }),
    ],
  );

  const warning = div(
    {
      class: ui.gap,
      'data-lab': 'replay-warning',
      hidden: computed(() => replayWarnings().length === 0),
    },
    [
      DocCallout({
        tone: lit('important'),
        caption: lit('À noter'),
        body: content(() => [p(computed(() => replayWarnings().join(' · ')))]),
      }),
    ],
  );

  return div({ class: ui.notices }, [diff, partial, problem, warning]);
});

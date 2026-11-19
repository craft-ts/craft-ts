import { i18n } from '../../../shared/util/catalog';
import {
  button,
  craftComponent,
  content,
  div,
  p,
  span,
  type Input,
} from '@craft-ts/component';
import { DocIcon, DocTooltip } from '@craft-ts/ui';
import { assign, unit } from '@craft-ts/style';
import { buttonUi } from '@craft-ts/ui/style';
import { progressVars, ui } from '../../../shared/ui/dashboard.style';
import { seekShare } from '../../../shared/util/replay-labels';
import { ReplaySession } from '../../../shared/state/replay-session';
import {
  diagnosticReplay,
  replayState,
  ReplayState,
} from '../../../shared/state/replay-state';
import { ReplayTimeline } from './replay-timeline';
import { lit } from '../../../shared/util/view-helpers';
import { ReplayPageViewModel } from '../replay-page-view-model.service';

/** Where the replayed pages are drawn, under a veil while they load, with their timeline over them. */
export const ReplayStage = craftComponent(
  'ReplayStage',
  {},
  function* (inputs: { readonly retryThumbnails: Input<() => void> }) {
    const { retryThumbnails } = inputs;
    const veil = div(
      {
        class: ui.skeleton,
        hidden: function* () {
          return yield* (yield* ReplayPageViewModel()).skeletonHidden();
        },
        'aria-hidden': 'true',
      },
      [div({ class: ui.skeletonBlock })],
    );

    // Going to a thumbnail's moment: the replay runs fast, without the recorded
    // delays, and the stage says so until it gets there.
    // The wrapper carries `hidden`: the overlay's own `display` would win over it.
    const seekOverlay = div(
      {
        hidden: function* () {
          return yield* (yield* ReplayPageViewModel()).seekOverlayHidden();
        },
      },
      [
        div({ class: ui.seekOverlay, 'data-lab': 'seek-overlay' }, [
          div({ class: ui.seekCard }, [
            div({ class: ui.seekIcons, 'aria-hidden': 'true' }, [
              DocIcon({ name: lit('fastForward'), size: lit('lg') }),
            ]),
            p({ class: ui.seekTitle, role: 'status' }, i18n.t('copy.copy133')),
            div({ class: ui.seekBar }, [
              div({ class: ui.progressTrack }, [
                div({
                  class: ui.progressFill,
                  style: function* () {
                    return assign(progressVars.done, unit.pct(seekShare()));
                  },
                }),
              ]),
            ]),
            p(
              { class: ui.progressLabel, 'data-lab': 'seek-progress' },
              function* () {
                return yield* (yield* ReplayPageViewModel()).seekProgress();
              },
            ),
            button(
              'cancelSeek',
              {
                type: 'button',
                class: buttonUi.root,
                'data-variant': 'secondary',
                'data-lab': 'seek-cancel',
                click: function* () {
                  (yield* ReplaySession()).cancelReplaySeek();
                },
              },
              [
                DocIcon({ name: lit('close'), size: lit('sm') }),
                span(i18n.t('copy.copy134')),
              ],
            ),
          ]),
        ]),
      ],
    );

    const stage = div({ class: ui.stage, id: 'replay-stage' }, [
      veil,
      seekOverlay,
      div({ class: ui.grid, id: 'replay-frame-grid' }),
    ]);

    // The pages and the timeline that moves through them are one player.
    return div({ class: ui.player }, [
      stage,
      ReplayTimeline({
        retryThumbnails,
      }),
    ]);
  },
);

/** The transport: play/pause, restart, step, and how far along it is. */
export const ReplayPlaybar = craftComponent('ReplayPlaybar', {}, function* () {
  const transport = div({ class: ui.transport }, [
    button(
      'play',
      {
        type: 'button',
        class: buttonUi.root,
        'data-variant': 'primary',
        'aria-label': () =>
          replayState() === 'playing'
            ? i18n.t('copy.copy137')
            : replayState() === 'paused'
              ? i18n.t('copy.copy138')
              : replayState() === 'completed'
                ? i18n.t('copy.copy139')
                : i18n.t('copy.copy140'),
        'aria-description': () =>
          replayState() === 'playing'
            ? 'Met en pause la lecture chronométrée.'
            : 'Rejoue les interactions en respectant les délais enregistrés.',
        'data-tooltip': () =>
          replayState() === 'playing'
            ? 'Met en pause le replay. Appuie de nouveau pour le reprendre.'
            : replayState() === 'paused'
              ? 'Reprend le replay en respectant les délais enregistrés.'
              : 'Lance le replay et respecte les délais réellement enregistrés entre les interactions.',
        click: function* () {
          (yield* ReplaySession()).toggleReplay();
        },
        disabled: function* () {
          return yield* (yield* ReplayPageViewModel()).playDisabled();
        },
      },
      function* () {
        return yield* (yield* ReplayPageViewModel()).playLabel();
      },
    ),
    button(
      'restart',
      {
        type: 'button',
        class: buttonUi.root,
        'data-variant': 'secondary',
        'data-lab': 'replay-restart',
        'aria-label': i18n.t('copy.copy141'),
        'aria-description':
          'Recharge les pages enregistrées et relance le replay depuis la première interaction.',
        'data-tooltip':
          'Recommence le replay depuis le début en rechargeant les pages enregistrées.',
        click: function* () {
          (yield* ReplaySession()).startReplay();
        },
        disabled: function* () {
          return yield* (yield* ReplayPageViewModel()).restartDisabled();
        },
      },
      i18n.t('copy.copy142'),
    ),
    button(
      'step',
      {
        type: 'button',
        class: buttonUi.root,
        'data-variant': 'tonal',
        'data-lab': 'action-next',
        'aria-description':
          'Exécute immédiatement l’interaction affichée à droite.',
        'data-tooltip':
          'Exécute tout de suite l’interaction affichée à droite, sans attendre le délai enregistré.',
        click: function* () {
          (yield* ReplaySession()).stepNextReplayAction();
        },
        disabled: function* () {
          return yield* (yield* ReplayPageViewModel()).canStep();
        },
      },
      i18n.t('copy.copy143'),
    ),
  ]);

  const diagnostic = button(
    'diagnostic-mode',
    {
      type: 'button',
      class: buttonUi.root,
      'data-variant': function* () {
        return diagnosticReplay() ? 'tonal' : 'secondary';
      },
      'aria-label': i18n.t('copy.copy144'),
      'aria-pressed': diagnosticReplay,
      'aria-describedby': 'replay-diagnostic-mode-tip',
      click: function* () {
        const current = diagnosticReplay();
        (yield* ReplayState()).imperative.setStates({
          diagnosticReplay: !current,
        });
      },
    },
    function* () {
      return yield* (yield* ReplayPageViewModel()).diagnosticLabel();
    },
  );

  return div({ class: ui.playbar }, [
    transport,
    div({ class: ui.playbarEnd }, [
      DocTooltip({
        tip: lit(
          'Ajoute une vérification des événements attendus : les écarts sont signalés, sans interrompre le replay.',
        ),
        tipId: lit('replay-diagnostic-mode-tip'),
        body: content(() => diagnostic),
      }),
    ]),
  ]);
});

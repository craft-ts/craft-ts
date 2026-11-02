import { i18n } from '../../../shared/util/catalog';
import {
  button,
  craftComponent,
  content,
  div,
  p,
  span,
  type Output,
} from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
import { DocIcon, DocTooltip } from '@craft-ts/ui';
import { assign, unit } from '@craft-ts/style';
import { buttonUi } from '@craft-ts/ui/style';
import { progressVars, ui } from '../../../shared/ui/dashboard.style';
import { seekProgressLabel, seekShare } from '../../../shared/util/replay-labels';
import { ReplayPlayback } from '../../../shared/state/replay-playback';
import { ReplaySession } from '../../../shared/state/replay-session';
import {
  connected,
  replayableEvents,
  replayIndex,
  replaySkeletonVisible,
  replayState,
  seekTarget,
  ReplayState,
} from '../../../shared/state/replay-state';
import { ReplayTimeline } from './replay-timeline';
import { lit } from '../../../shared/util/view-helpers';

function replayPlayLabel(state: string): string {
  switch (state) {
    case 'playing':
      return i18n.t("copy.copy129");
    case 'paused':
      return i18n.t("copy.copy130");
    case 'completed':
      return i18n.t("copy.copy131");
    default:
      return i18n.t("copy.copy132");
  }
}

function playPauseOrRestartReplay(
  state: string,
  actions: Readonly<{
    pause: () => void;
    play: () => void;
    restart: () => void;
  }>,
): void {
  if (state === 'playing') {
    actions.pause();
    return;
  }
  if (state === 'completed') actions.restart();
  else actions.play();
}

/** Where the replayed pages are drawn, under a veil while they load, with their timeline over them. */
export const ReplayStage = craftComponent(
  'ReplayStage',
  {},
  function* (inputs: { readonly retryThumbnails: Output<() => void> }) {
    const { retryThumbnails } = inputs;
    const replaySession = yield* ReplaySession();
    const skeletonHidden = yield* craftComputed(
      'skeletonHidden',
      () => !replaySkeletonVisible(),
    );
    const seekOverlayHidden = yield* craftComputed(
      'seekOverlayHidden',
      () => seekTarget() === undefined,
    );
    const seekProgress = yield* craftComputed(
      'seekProgress',
      seekProgressLabel,
    );

    const veil = div(
      {
        class: ui.skeleton,
        hidden: skeletonHidden,
        'aria-hidden': 'true',
      },
      [div({ class: ui.skeletonBlock })],
    );

    // Going to a thumbnail's moment: the replay runs fast, without the recorded
    // delays, and the stage says so until it gets there.
    // The wrapper carries `hidden`: the overlay's own `display` would win over it.
    const seekOverlay = div({ hidden: seekOverlayHidden }, [
      div({ class: ui.seekOverlay, 'data-lab': 'seek-overlay' }, [
        div({ class: ui.seekCard }, [
          div({ class: ui.seekIcons, 'aria-hidden': 'true' }, [
            DocIcon({ name: lit('fastForward'), size: lit('lg') }),
          ]),
          p(
            { class: ui.seekTitle, role: 'status' },
            i18n.t("copy.copy133"),
          ),
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
            seekProgress,
          ),
          button(
            'cancelSeek',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'secondary',
              'data-lab': 'seek-cancel',
              click: replaySession.cancelReplaySeek,
            },
            [DocIcon({ name: lit('close'), size: lit('sm') }), span(i18n.t("copy.copy134"))],
          ),
        ]),
      ]),
    ]);

    const stage = div({ class: ui.stage, id: 'replay-stage' }, [
      veil,
      seekOverlay,
      div({ class: ui.grid, id: 'replay-frame-grid' }),
    ]);

    // The pages and the timeline that moves through them are one player.
    return div({ class: ui.player }, [
      stage,
      ReplayTimeline({ retryThumbnails }),
    ]);
  },
);

/** The transport: play/pause, restart, step, and how far along it is. */
export const ReplayPlaybar = craftComponent('ReplayPlaybar', {}, function* () {
  const replaySession = yield* ReplaySession();
  const replayPlayback = yield* ReplayPlayback();
  const { diagnosticReplay, setStates } = (yield* ReplayState()).imperative;
  const canStep = yield* craftComputed(
    'canStep',
    () =>
      !connected() ||
      !replayableEvents()[replayIndex()] ||
      !['ready', 'paused'].includes(replayState()),
  );
  const playLabel = yield* craftComputed('playLabel', () =>
    replayPlayLabel(replayState()),
  );
  const diagnosticLabel = yield* craftComputed('diagnosticLabel', () =>
    diagnosticReplay() ? i18n.t("copy.copy135") : i18n.t("copy.copy136"),
  );
  const playDisabled = yield* craftComputed(
    'playDisabled',
    () =>
      !['playing', 'completed'].includes(replayState()) &&
      (!connected() ||
        !replayableEvents()[replayIndex()] ||
        !['ready', 'paused'].includes(replayState())),
  );
  const restartDisabled = yield* craftComputed(
    'restartDisabled',
    () => !['playing', 'paused', 'completed', 'error'].includes(replayState()),
  );
  const transport = div({ class: ui.transport }, [
    button(
      'play',
      {
        type: 'button',
        class: buttonUi.root,
        'data-variant': 'primary',
        'aria-label': () =>
          replayState() === 'playing'
            ? i18n.t("copy.copy137")
            : replayState() === 'paused'
              ? i18n.t("copy.copy138")
              : replayState() === 'completed'
                ? i18n.t("copy.copy139")
                : i18n.t("copy.copy140"),
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
        click: () =>
          playPauseOrRestartReplay(replayState(), {
            pause: replayPlayback.pauseReplay,
            play: replayPlayback.playReplay,
            restart: replaySession.startReplay,
          }),
        disabled: playDisabled,
      },
      playLabel,
    ),
    button(
      'restart',
      {
        type: 'button',
        class: buttonUi.root,
        'data-variant': 'secondary',
        'data-lab': 'replay-restart',
        'aria-label': i18n.t("copy.copy141"),
        'aria-description':
          'Recharge les pages enregistrées et relance le replay depuis la première interaction.',
        'data-tooltip':
          'Recommence le replay depuis le début en rechargeant les pages enregistrées.',
        click: replaySession.startReplay,
        disabled: restartDisabled,
      },
      i18n.t("copy.copy142"),
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
        click: replaySession.stepNextReplayAction,
        disabled: canStep,
      },
      i18n.t("copy.copy143"),
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
      'aria-label': i18n.t("copy.copy144"),
      'aria-pressed': diagnosticReplay,
      'aria-describedby': 'replay-diagnostic-mode-tip',
      click: () =>
        setStates({
          diagnosticReplay: !diagnosticReplay(),
        }),
    },
    diagnosticLabel,
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

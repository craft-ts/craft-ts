import { button, craftComponent, div, p, span } from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
import { DocIcon } from '@craft-ts/ui';
import { assign, unit } from '@craft-ts/style';
import { buttonUi } from '@craft-ts/ui/style';
import { progressVars, ui } from './dashboard.style';
import { AiChatBridge } from './replay-ai-bridge.service';
import { seekProgressLabel, seekShare } from './replay-labels';
import { pauseReplay, playReplay } from './replay-playback';
import {
  cancelReplaySeek,
  startReplay,
  stepNextReplayAction,
  stopReplay,
} from './replay-session';
import {
  connected,
  diagnosticReplay,
  replayableEvents,
  replayIndex,
  replaySkeletonVisible,
  replayState,
  seekTarget,
} from './replay-state';
import { ReplayTimeline } from './replay-timeline';
import { lit } from './view-helpers';

/** Where the replayed pages are drawn, under a veil while they load, with their timeline over them. */
export const ReplayStage = craftComponent('ReplayStage', {}, function* () {
  const skeletonHidden = yield* craftComputed(
    'skeletonHidden',
    () => !replaySkeletonVisible(),
  );
  const seekOverlayHidden = yield* craftComputed(
    'seekOverlayHidden',
    () => seekTarget() === undefined,
  );
  const seekProgress = yield* craftComputed('seekProgress', seekProgressLabel);

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
          'Retour accéléré à l’étape choisie',
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
            click: cancelReplaySeek,
          },
          [DocIcon({ name: lit('close'), size: lit('sm') }), span('Annuler')],
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
  return div({ class: ui.player }, [stage, ReplayTimeline({})]);
});

/** The transport: play, pause, restart, step, stop, and how far along it is. */
export const ReplayPlaybar = craftComponent('ReplayPlaybar', {}, function* () {
  const aiChat = yield* AiChatBridge();
  const canStep = yield* craftComputed(
    'canStep',
    () =>
      !connected() ||
      !replayableEvents()[replayIndex()] ||
      !['ready', 'paused'].includes(replayState()),
  );
  const diagnosticLabel = yield* craftComputed('diagnosticLabel', () =>
    diagnosticReplay() ? 'Diagnostic activé' : 'Diagnostic désactivé',
  );
  const pauseDisabled = yield* craftComputed(
    'pauseDisabled',
    () => !connected() || replayState() !== 'playing',
  );
  const restartDisabled = yield* craftComputed(
    'restartDisabled',
    () =>
      !['ready', 'playing', 'paused', 'completed', 'error'].includes(
        replayState(),
      ),
  );
  const stopDisabled = yield* craftComputed(
    'stopDisabled',
    () =>
      !connected() || !['ready', 'playing', 'paused'].includes(replayState()),
  );
  const assistantDisabled = yield* craftComputed(
    'assistantDisabled',
    function* () {
      return !(yield* aiChat.chat.available());
    },
  );

  const transport = div({ class: ui.transport }, [
    button(
      'play',
      {
        type: 'button',
        class: buttonUi.root,
        'data-variant': 'primary',
        'aria-label': 'Lecture à vitesse réelle',
        'aria-description':
          'Rejoue les interactions en respectant les délais enregistrés.',
        'data-tooltip':
          'Lance le replay et respecte les délais réellement enregistrés entre les interactions.',
        click: playReplay,
        disabled: canStep,
      },
      'Lecture',
    ),
    button(
      'diagnostic-mode',
      {
        type: 'button',
        class: buttonUi.root,
        'data-variant': 'tonal',
        'aria-label': 'Mode diagnostic du replay',
        'aria-pressed': diagnosticReplay,
        'data-tooltip':
          'Compare les observations exécutées au plan compilé et signale les écarts sans arrêter le replay.',
        click: () => diagnosticReplay.update((enabled) => !enabled),
      },
      diagnosticLabel,
    ),
    button(
      'pause',
      {
        type: 'button',
        class: buttonUi.root,
        'data-variant': 'secondary',
        'aria-description': 'Met en pause la lecture chronométrée.',
        'data-tooltip':
          'Met en pause le replay. Tu peux le reprendre avec Lecture à vitesse réelle ou avancer avec Action suivante.',
        click: pauseReplay,
        disabled: pauseDisabled,
      },
      'Pause',
    ),
    button(
      'restart',
      {
        type: 'button',
        class: buttonUi.root,
        'data-variant': 'secondary',
        'data-lab': 'replay-restart',
        'aria-label': 'Recommencer le replay depuis le début',
        'aria-description':
          'Recharge les pages enregistrées et relance le replay depuis la première interaction.',
        'data-tooltip':
          'Recommence le replay depuis le début en rechargeant les pages enregistrées.',
        click: startReplay,
        disabled: restartDisabled,
      },
      'Recommencer',
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
        click: stepNextReplayAction,
        disabled: canStep,
      },
      'Action suivante',
    ),
    button(
      'stop',
      {
        type: 'button',
        class: buttonUi.root,
        'data-variant': 'link',
        'aria-description':
          'Arrête le replay et revient à la première interaction.',
        'data-tooltip':
          'Arrête la reproduction en cours et remet le curseur à la première interaction.',
        click: stopReplay,
        disabled: stopDisabled,
      },
      'Arrêter',
    ),
  ]);

  const assistant = button(
    'aiChat',
    {
      type: 'button',
      class: buttonUi.root,
      'data-variant': 'secondary',
      'data-lab': 'ai-chat',
      'aria-description':
        'Ouvre le chat qui envoie le contexte de la session à une IA.',
      'data-tooltip':
        'Ouvre le chat pour envoyer à une IA le contexte de cette session.',
      click: aiChat.open,
      disabled: assistantDisabled,
    },
    [DocIcon({ name: lit('sparkle'), size: lit('sm') }), span('Contexte IA')],
  );

  return div({ class: ui.playbar }, [
    transport,
    div({ class: ui.playbarEnd }, [assistant]),
  ]);
});

import {
  button,
  craftComponent,
  div,
  p,
  span,
} from '@craft-ts/component';
import { ɵcomputed as computed } from '@craft-ts/core';
import { assign, unit } from '@craft-ts/style';
import { buttonUi } from '@craft-ts/ui/style';
import { progressVars, ui } from './dashboard.style';
import {
  currentNextActionLabel,
  nextActionTimingLabel,
  progressLabel,
} from './replay-labels';
import { pauseReplay, playReplay } from './replay-playback';
import { startReplay, stepNextReplayAction, stopReplay } from './replay-session';
import {
  connected,
  replayableEvents,
  replayIndex,
  replaySkeletonVisible,
  replayState,
} from './replay-state';

/** Where the replayed pages are drawn, under a veil while they load. */
export const ReplayStage = craftComponent('ReplayStage', {}, function* () {
  const veil = div(
    {
      class: ui.skeleton,
      hidden: computed(() => !replaySkeletonVisible()),
      'aria-hidden': 'true',
    },
    [div({ class: ui.skeletonBlock })],
  );

  return div({ class: ui.stage, id: 'replay-stage' }, [
    veil,
    div({ class: ui.grid, id: 'replay-frame-grid' }),
  ]);
});

/** The transport: play, pause, restart, step, stop, and how far along it is. */
export const ReplayPlaybar = craftComponent('ReplayPlaybar', {}, function* () {
  const canStep = computed(
    () =>
      !connected() ||
      !replayableEvents()[replayIndex()] ||
      !['ready', 'paused'].includes(replayState()),
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
      'pause',
      {
        type: 'button',
        class: buttonUi.root,
        'data-variant': 'secondary',
        'aria-description': 'Met en pause la lecture chronométrée.',
        'data-tooltip':
          'Met en pause le replay. Tu peux le reprendre avec Lecture à vitesse réelle ou avancer avec Action suivante.',
        click: pauseReplay,
        disabled: computed(() => !connected() || replayState() !== 'playing'),
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
        disabled: computed(
          () =>
            !['ready', 'playing', 'paused', 'completed', 'error'].includes(
              replayState(),
            ),
        ),
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
        disabled: computed(
          () =>
            !connected() ||
            !['ready', 'playing', 'paused'].includes(replayState()),
        ),
      },
      'Arrêter',
    ),
  ]);

  const progress = div({ class: ui.progress }, [
    div({ class: ui.progressTrack }, [
      div({
        class: ui.progressFill,
        style: function* () {
          const total = replayableEvents().length;
          return assign(
            progressVars.done,
            unit.pct(total ? (replayIndex() / total) * 100 : 0),
          );
        },
      }),
    ]),
    div({ class: ui.progressText }, [
      p(
        { 'data-lab': 'replay-progress', role: 'status' },
        computed(progressLabel),
      ),
      p({ class: ui.next }, [
        span({ 'data-lab': 'next-action-name' }, computed(currentNextActionLabel)),
        span(
          {
            'data-lab': 'next-action-timing',
            role: 'timer',
            hidden: computed(() => nextActionTimingLabel() === ''),
          },
          computed(() => ` · ${nextActionTimingLabel()}`),
        ),
      ]),
    ]),
  ]);

  return div({ class: ui.playbar }, [transport, progress]);
});

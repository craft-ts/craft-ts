import { button, craftComponent, div, p, span } from '@craft-ts/component';
import { ɵcomputed as computed } from '@craft-ts/core';
import { DocIcon } from '@craft-ts/ui';
import { assign, unit } from '@craft-ts/style';
import { buttonUi } from '@craft-ts/ui/style';
import { progressVars, ui } from './dashboard.style';
import {
  currentNextActionLabel,
  nextActionTimingLabel,
  progressLabel,
  replayElapsedShare,
  seekProgressLabel,
  seekShare,
  timeProgressLabel,
  timeRemainingLabel,
} from './replay-labels';
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
import { lit } from './view-helpers';

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

  // Going to a thumbnail's moment: the replay runs fast, without the recorded
  // delays, and the stage says so until it gets there.
  // The wrapper carries `hidden`: the overlay's own `display` would win over it.
  const seekOverlay = div(
    { hidden: computed(() => seekTarget() === undefined) },
    [
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
            computed(seekProgressLabel),
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
    ],
  );

  return div({ class: ui.stage, id: 'replay-stage' }, [
    veil,
    seekOverlay,
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
      computed(() =>
        diagnosticReplay() ? 'Diagnostic activé' : 'Diagnostic désactivé',
      ),
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
        {
          class: ui.progressLabel,
          'data-lab': 'replay-progress',
          role: 'status',
        },
        computed(progressLabel),
      ),
      p({ class: ui.next }, [
        span(
          { class: ui.nextName, 'data-lab': 'next-action-name' },
          computed(currentNextActionLabel),
        ),
        span(
          {
            class: ui.nextTiming,
            'data-lab': 'next-action-timing',
            role: 'timer',
            hidden: computed(() => nextActionTimingLabel() === ''),
          },
          computed(() => ` · ${nextActionTimingLabel()}`),
        ),
      ]),
    ]),
    div({ class: ui.progressTrack }, [
      div({
        class: ui.progressFill,
        'data-lab': 'replay-time-fill',
        style: function* () {
          return assign(progressVars.done, unit.pct(replayElapsedShare()));
        },
      }),
    ]),
    div({ class: ui.progressText }, [
      p(
        { class: ui.progressLabel, 'data-lab': 'replay-time' },
        computed(timeProgressLabel),
      ),
      p(
        { class: ui.progressLabel, 'data-lab': 'replay-time-remaining' },
        computed(timeRemainingLabel),
      ),
    ]),
  ]);

  return div({ class: ui.playbar }, [transport, progress]);
});

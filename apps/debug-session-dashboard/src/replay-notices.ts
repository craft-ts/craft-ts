import {
  button,
  content,
  craftComponent,
  details,
  div,
  forNode,
  li,
  p,
  pre,
  span,
  summary,
  ul,
} from '@craft-ts/component';
import { ɵcomputed as computed } from '@craft-ts/core';
import { DocCallout } from '@craft-ts/ui';
import { buttonUi } from '@craft-ts/ui/style';
import { ui } from './dashboard.style';
import {
  forceReplayRecovery,
  seekReplayToWarning,
  skipReplayWait,
  skipToCheckpoint,
} from './replay-session';
import {
  autoSkipDifferences,
  canForceRecovery,
  canSkipDifference,
  difference,
  differenceHistoryOpen,
  hasDifference,
  loadError,
  partialReplay,
  replayDifferences,
  rememberAutoSkipDifferences,
  replayState,
  replayWarnings,
  status,
  dismissAllWarnings,
  dismissedWarnings,
  dismissWarning,
  pendingWarnings,
  warningHistoryOpen,
} from './replay-state';
import { lit } from './view-helpers';

/** What the replay has to say when it leaves the recording or cannot go on. */
export const ReplayNotices = craftComponent('ReplayNotices', {}, function* () {
  const diff = div(
    {
      class: ui.snackbar,
      'data-lab': 'diff',
      role: 'region',
      'aria-label': 'Décalage du replay',
      hidden: computed(() => !hasDifference()),
    },
    [
      p(
        { 'aria-live': 'polite' },
        computed(() =>
          difference()?.transport
            ? `Décalage transport ${difference()!.transport!.transportId}, instance ${difference()!.transport!.instanceId}, ${difference()!.transport!.direction} ${difference()!.transport!.sequence}.`
            : `Décalage détecté à l’événement ${difference()?.eventId ?? '?'}.`,
        ),
      ),
      div({ class: ui.gapActions }, [
        button(
          'skipToCheckpoint',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'primary',
            'data-lab': 'skip-to-checkpoint',
            hidden: computed(
              () => !canSkipDifference() || autoSkipDifferences(),
            ),
            click: skipToCheckpoint,
          },
          'Aller à la suite',
        ),
        button(
          'forceReplayRecovery',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'secondary',
            'data-lab': 'force-recovery',
            hidden: computed(() => !canForceRecovery()),
            click: forceReplayRecovery,
          },
          'Forcer l’état attendu',
        ),
        span(
          { hidden: computed(() => !autoSkipDifferences()) },
          'Passage au checkpoint automatique activé.',
        ),
      ]),
      p(
        {
          hidden: computed(() => autoSkipDifferences() || !canSkipDifference()),
        },
        'Ce choix sera mémorisé pour les prochains replays.',
      ),
    ],
  );

  const differenceHistory = div(
    {
      class: ui.gap,
      'data-lab': 'difference-history',
      hidden: computed(() => !differenceHistoryOpen()),
    },
    [
      p(
        computed(
          () =>
            `${replayDifferences().length} décalage(s) détecté(s) dans ce replay.`,
        ),
      ),
      button(
        'disableAutoSkipDifferences',
        {
          type: 'button',
          class: buttonUi.root,
          'data-variant': 'secondary',
          hidden: computed(() => !autoSkipDifferences()),
          click: () => rememberAutoSkipDifferences(false),
        },
        'Désactiver le passage automatique',
      ),
      ul(
        { class: ui.events },
        forNode(replayDifferences, { track: (entry) => entry.id }, (entry) =>
          li({ class: ui.event, 'data-entry': 'difference' }, [
            span({ class: ui.eventName }, function* () {
              const item = yield* entry();
              return item.transport
                ? `Transport ${item.transport.transportId} · ${item.transport.direction} ${item.transport.sequence}`
                : `Événement ${item.eventId ?? '?'}`;
            }),
            span({ class: ui.eventMeta }, function* () {
              const item = yield* entry();
              return `${item.participantId} · ${item.resolution === 'pending' ? 'en attente' : item.resolution === 'skipped' ? 'checkpoint rejoint' : 'reprise forcée'}${item.checkpointEventId ? ` · checkpoint ${item.checkpointEventId}` : ''}`;
            }),
            details([
              summary('Attendu et observé'),
              div({ class: ui.compare }, [
                div([
                  span({ class: ui.compareLabel }, 'Attendu'),
                  pre({ class: ui.code }, function* () {
                    return JSON.stringify((yield* entry()).expected, null, 2);
                  }),
                ]),
                div([
                  span({ class: ui.compareLabel }, 'Observé'),
                  pre({ class: ui.code }, function* () {
                    return JSON.stringify((yield* entry()).actual, null, 2);
                  }),
                ]),
              ]),
            ]),
          ]),
        ),
      ),
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

  // Notes float over the page: one line each, put away one by one or all at
  // once. Nothing here takes room from the replay; the history keeps them all.
  const visibleWarnings = computed(() => pendingWarnings().slice(-2));
  const toasts = div(
    {
      class: ui.toasts,
      'data-lab': 'replay-warning',
      role: 'region',
      'aria-label': 'Notes du replay',
      hidden: computed(() => pendingWarnings().length === 0),
    },
    [
      forNode(visibleWarnings, { track: (warning) => warning }, (warning) =>
        div({ class: ui.toast, 'data-entry': 'warning' }, [
          span(
            {
              class: ui.toastText,
              title: warning,
            },
            warning,
          ),
          button(
            'dismissWarning',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'link',
              'aria-label': 'Ignorer cette note',
              'data-lab': 'dismiss-warning',
              'data-tooltip':
                'Ignore cette note et passe tout de suite à l’action suivante au lieu d’attendre le délai enregistré.',
              click: function* () {
                dismissWarning(yield* warning());
                skipReplayWait();
              },
            },
            '×',
          ),
        ]),
      ),
      div(
        {
          class: ui.toastBar,
          hidden: computed(() => pendingWarnings().length <= 1),
        },
        [
          span(
            computed(() => {
              const hidden = pendingWarnings().length - 2;
              return hidden > 0
                ? `+${hidden} plus ancienne(s) · ${pendingWarnings().length} notes`
                : `${pendingWarnings().length} notes`;
            }),
          ),
          button(
            'dismissAllWarnings',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'secondary',
              'data-lab': 'dismiss-all-warnings',
              'data-tooltip':
                'Ignore toutes les notes et passe tout de suite à l’action suivante.',
              click: () => {
                dismissAllWarnings();
                skipReplayWait();
              },
            },
            'Tout ignorer',
          ),
        ],
      ),
    ],
  );

  const history = div(
    {
      class: ui.noteHistory,
      'data-lab': 'warning-history',
      role: 'region',
      'aria-label': 'Toutes les notes du replay',
      hidden: computed(() => !warningHistoryOpen()),
    },
    [
      p(
        { class: ui.eventMeta },
        computed(() => `${replayWarnings().length} note(s) pour ce replay`),
      ),
      ul(
        { class: ui.events },
        forNode(
          computed(() => [...replayWarnings()].reverse()),
          { track: (warning) => warning },
          (warning) =>
            li(
              {
                class: ui.noteItem,
                'data-note': function* () {
                  return dismissedWarnings().includes(yield* warning())
                    ? 'dismissed'
                    : undefined;
                },
              },
              [
                span({ class: ui.noteText }, warning),
                button(
                  'seekToWarning',
                  {
                    type: 'button',
                    class: buttonUi.root,
                    'data-variant': 'secondary',
                    'data-lab': 'seek-to-warning',
                    'aria-label': 'Rejouer jusqu’à cette action',
                    'aria-description':
                      'Relance le replay depuis le début et s’arrête juste avant l’action à l’origine de cette note.',
                    'data-tooltip':
                      'Relance le replay depuis le début, sans attendre les délais, et s’arrête juste avant l’action à l’origine de cette note pour observer le décalage. « Action suivante » exécute ensuite cette action. Les notes sont conservées.',
                    click: function* () {
                      seekReplayToWarning(yield* warning());
                    },
                  },
                  span({ 'aria-hidden': 'true' }, '⏭'),
                ),
              ],
            ),
        ),
      ),
    ],
  );

  return div({ class: ui.notices }, [
    diff,
    differenceHistory,
    partial,
    problem,
    toasts,
    history,
  ]);
});

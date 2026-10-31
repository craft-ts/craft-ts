import {
  button,
  content,
  craftComponent,
  div,
  forNode,
  p,
  span,
} from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
import { DocCallout } from '@craft-ts/ui';
import { buttonUi } from '@craft-ts/ui/style';
import { ui } from './dashboard.style';
import {
  forceReplayRecovery,
  skipReplayWait,
  skipToCheckpoint,
} from './replay-session';
import {
  autoSkipDifferences,
  canForceRecovery,
  canSkipDifference,
  difference,
  hasDifference,
  loadError,
  partialReplay,
  replayState,
  status,
  differenceNoticeDismissed,
  dismissDifferenceNotice,
  dismissAllWarnings,
  dismissWarning,
  pendingWarnings,
  toggleSideTab,
} from './replay-state';
import { lit } from './view-helpers';

/** Best effort: a note goes to the clipboard when the browser lets it. */
export function copyReplayNote(text: string): void {
  const clipboard =
    typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  if (clipboard) void clipboard.writeText(text).catch(() => undefined);
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
        ? 'la connexion WebSocket demandée'
        : `la requête réseau (${transportName})`;
    return `Le replay a bloqué ${networkAction}, absente de l’enregistrement. Aucun appel réseau réel n’a été envoyé.`;
  }
  return 'Le replay a divergé de l’enregistrement. Le détail attendu / observé est dans « Écarts ».';
}

/** What the replay has to say when it leaves the recording or cannot go on. */
export const ReplayNotices = craftComponent('ReplayNotices', {}, function* () {
  const partialMessage = yield* craftComputed('partialMessage', () => {
    const skipped = partialReplay();
    return skipped
      ? `Replay partiel · portion ${skipped.from}–${skipped.to} ignorée · checkpoint ${skipped.checkpointEventId}`
      : '';
  });
  const problemMessage = yield* craftComputed(
    'problemMessage',
    () => loadError() ?? status(),
  );

  const diff = div(
    {
      class: ui.snackbar,
      'data-lab': 'diff',
      role: 'region',
      'aria-label': 'Décalage du replay',
      hidden: yield* craftComputed(
        'hidden',
        () => !hasDifference() || differenceNoticeDismissed(),
      ),
    },
    [
      p(
        { 'aria-live': 'polite' },
        yield* craftComputed('differenceMessage', () =>
          differenceMessageFor(difference()),
        ),
      ),
      p(
        {
          hidden: yield* craftComputed(
            'hidden',
            () => !difference()?.tolerances?.length,
          ),
          'data-lab': 'applied-tolerances',
        },
        yield* craftComputed('toleranceMessage', () => {
          const rules = difference()?.tolerances ?? [];
          return `Règles évaluées avant cet écart : ${rules
            .map((rule) => `${rule.kind} ${rule.path} (${rule.assertionId})`)
            .join(', ')}.`;
        }),
      ),
      div({ class: ui.gapActions }, [
        button(
          'skipToCheckpoint',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'primary',
            'data-lab': 'skip-to-checkpoint',
            hidden: yield* craftComputed(
              'hidden',
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
            hidden: yield* craftComputed('hidden', () => !canForceRecovery()),
            click: forceReplayRecovery,
          },
          'Forcer l’état attendu',
        ),
        button(
          'openDifferenceReview',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'secondary',
            'data-lab': 'open-difference-review',
            click: () => toggleSideTab('review'),
          },
          'Voir le détail',
        ),
        button(
          'dismissDifferenceNotice',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'link',
            'data-lab': 'dismiss-difference-notice',
            'aria-label': 'Masquer le message de décalage',
            click: dismissDifferenceNotice,
          },
          'Fermer',
        ),
        span(
          {
            hidden: yield* craftComputed(
              'hidden',
              () => !autoSkipDifferences(),
            ),
          },
          'Passage au checkpoint automatique activé.',
        ),
      ]),
      p(
        {
          hidden: yield* craftComputed(
            'hidden',
            () => autoSkipDifferences() || !canSkipDifference(),
          ),
        },
        'Ce choix sera mémorisé pour les prochains replays.',
      ),
    ],
  );

  const partial = div(
    {
      class: ui.gap,
      'data-lab': 'partial',
      hidden: yield* craftComputed(
        'hidden',
        () => partialReplay() === undefined,
      ),
    },
    [
      DocCallout({
        tone: lit('info'),
        caption: lit('Replay partiel'),
        body: content(() => [p(partialMessage)]),
      }),
    ],
  );

  const problem = div(
    {
      class: ui.gap,
      'data-lab': 'problem',
      hidden: yield* craftComputed(
        'hidden',
        () => loadError() === undefined && replayState() !== 'error',
      ),
    },
    [
      DocCallout({
        tone: lit('danger'),
        caption: lit('Impossible de poursuivre'),
        body: content(() => [p(problemMessage)]),
      }),
    ],
  );

  // Notes float over the page: one line each, put away one by one or all at
  // once. Nothing here takes room from the replay; the history keeps them all.
  const visibleWarnings = yield* craftComputed('visibleWarnings', () =>
    pendingWarnings().slice(-2),
  );
  const toasts = div(
    {
      class: ui.toasts,
      'data-lab': 'replay-warning',
      role: 'region',
      'aria-label': 'Notes du replay',
      hidden: yield* craftComputed(
        'hidden',
        () => pendingWarnings().length === 0,
      ),
    },
    [
      forNode(visibleWarnings, { track: (warning) => warning }, (warning) =>
        div({ class: ui.toast, 'data-entry': 'warning' }, [
          button(
            'copyReplayWarning',
            {
              type: 'button',
              class: [buttonUi.root, ui.toastText, ui.warningToastCopy],
              'data-variant': 'link',
              'data-lab': 'copy-replay-warning',
              'aria-label': 'Copier la note du replay',
              'data-tooltip': 'Copier cette note dans le presse-papiers.',
              title: warning,
              click: function* () {
                copyReplayNote(yield* warning());
              },
            },
            span({ class: ui.toastText }, warning),
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
          hidden: yield* craftComputed(
            'hidden',
            () => pendingWarnings().length <= 1,
          ),
        },
        [
          span(
            yield* craftComputed('toastMessage', () => {
              const hidden = pendingWarnings().length - 2;
              return hidden > 0
                ? `+${hidden} plus ancienne(s) · ${pendingWarnings().length} notes`
                : `${pendingWarnings().length} notes`;
            }),
          ),
          button(
            'openWarningHistory',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'link',
              click: () => toggleSideTab('review'),
            },
            'Tout voir',
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

  return div({ class: ui.notices }, [diff, partial, problem, toasts]);
});

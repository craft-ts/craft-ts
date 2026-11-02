import { i18n } from './i18n/catalog';
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
import { BrowserNavigator } from '@craft-ts/core';
import { DocCallout } from '@craft-ts/ui';
import { buttonUi } from '@craft-ts/ui/style';
import { ui } from './dashboard.style';
import { ReplaySession } from './replay-session';
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
export function* copyReplayNote(text: string) {
  yield* BrowserNavigator.writeClipboardText(text);
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
    return (i18n.t("copy.copy068") + (networkAction) + i18n.t("copy.copy069"));
  }
  return i18n.t("copy.copy070");
}

/** What the replay has to say when it leaves the recording or cannot go on. */
export const ReplayNotices = craftComponent('ReplayNotices', {}, function* () {
  const replaySession = yield* ReplaySession();
  const partialMessage = yield* craftComputed('partialMessage', () => {
    const skipped = partialReplay();
    return skipped
      ? (i18n.t("copy.copy071") + (skipped.from) + i18n.t("copy.copy072") + (skipped.to) + i18n.t("copy.copy073") + (skipped.checkpointEventId) + "")
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
          return (i18n.t("copy.copy074") + (rules
            .map((rule) => `${rule.kind} ${rule.path} (${rule.assertionId})`)
            .join(', ')) + ".");
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
            click: replaySession.skipToCheckpoint,
          },
          i18n.t("copy.copy075"),
        ),
        button(
          'forceReplayRecovery',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'secondary',
            'data-lab': 'force-recovery',
            hidden: yield* craftComputed('hidden', () => !canForceRecovery()),
            click: replaySession.forceReplayRecovery,
          },
          i18n.t("copy.copy076"),
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
          i18n.t("copy.copy077"),
        ),
        button(
          'dismissDifferenceNotice',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'link',
            'data-lab': 'dismiss-difference-notice',
            'aria-label': i18n.t("copy.copy078"),
            click: dismissDifferenceNotice,
          },
          i18n.t("copy.copy079"),
        ),
        span(
          {
            hidden: yield* craftComputed(
              'hidden',
              () => !autoSkipDifferences(),
            ),
          },
          i18n.t("copy.copy080"),
        ),
      ]),
      p(
        {
          hidden: yield* craftComputed(
            'hidden',
            () => autoSkipDifferences() || !canSkipDifference(),
          ),
        },
        i18n.t("copy.copy081"),
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
              'aria-label': i18n.t("copy.copy082"),
              'data-tooltip': 'Copier cette note dans le presse-papiers.',
              title: warning,
              click: function* () {
                yield* copyReplayNote(yield* warning());
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
              'aria-label': i18n.t("copy.copy083"),
              'data-lab': 'dismiss-warning',
              'data-tooltip':
                'Ignore cette note et passe tout de suite à l’action suivante au lieu d’attendre le délai enregistré.',
              click: function* () {
                dismissWarning(yield* warning());
                replaySession.skipReplayWait();
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
                ? (i18n.t("copy.copy084") + (hidden) + i18n.t("copy.copy085") + (pendingWarnings().length) + i18n.t("copy.copy086"))
                : (i18n.t("copy.copy087") + (pendingWarnings().length) + i18n.t("copy.copy088"));
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
            i18n.t("copy.copy089"),
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
                replaySession.skipReplayWait();
              },
            },
            i18n.t("copy.copy090"),
          ),
        ],
      ),
    ],
  );

  return div({ class: ui.notices }, [diff, partial, problem, toasts]);
});

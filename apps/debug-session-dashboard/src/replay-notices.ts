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
import { craftComputed, rawReactiveValue } from '@craft-ts/core';
import { DocCallout } from '@craft-ts/ui';
import { buttonUi } from '@craft-ts/ui/style';
import { ui } from './dashboard.style';
import { copyResumePrompt } from './resume-prompt';
import { openLinkedTab } from './replay-browser';
import { SessionArchive } from './session-archive.service';
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
  isReplayErrorNote,
  loadError,
  partialReplay,
  replayDifferences,
  rememberAutoSkipDifferences,
  replayState,
  replayWarnings,
  routeSessionId,
  status,
  differenceNoticeDismissed,
  dismissDifferenceNotice,
  dismissAllWarnings,
  dismissedWarnings,
  dismissWarning,
  pendingWarnings,
  warningHistoryOpen,
} from './replay-state';
import { lit } from './view-helpers';

function copyReplayNote(text: string): void {
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
  return 'Le replay a divergé de l’enregistrement. Consultez l’historique des décalages pour voir le détail.';
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
      hidden: yield* craftComputed('hidden',
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
          hidden: yield* craftComputed('hidden',
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
            hidden: yield* craftComputed('hidden',
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
            hidden: yield* craftComputed('hidden',
              () => !canForceRecovery(),
            ),
            click: forceReplayRecovery,
          },
          'Forcer l’état attendu',
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
            hidden: yield* craftComputed('hidden',
              () => !autoSkipDifferences(),
            ),
          },
          'Passage au checkpoint automatique activé.',
        ),
      ]),
      p(
        {
          hidden: yield* craftComputed('hidden',
            () => autoSkipDifferences() || !canSkipDifference(),
          ),
        },
        'Ce choix sera mémorisé pour les prochains replays.',
      ),
    ],
  );

  const differenceHistory = div(
    {
      class: ui.gap,
      'data-lab': 'difference-history',
      hidden: yield* craftComputed('hidden',
        () => !differenceHistoryOpen(),
      ),
    },
    [
      p(
        yield* craftComputed(
          'differenceHistoryCount',
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
          hidden: yield* craftComputed('hidden',
            () => !autoSkipDifferences(),
          ),
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
                    const item = yield* entry();
                    return JSON.stringify(item.expected, null, 2);
                  }),
                ]),
                div([
                  span({ class: ui.compareLabel }, 'Observé'),
                  pre({ class: ui.code }, function* () {
                    const item = yield* entry();
                    return JSON.stringify(item.actual, null, 2);
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
      hidden: yield* craftComputed('hidden',
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
      hidden: yield* craftComputed('hidden',
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

  // After « Reprendre ici »: the request is out, and what to give the AI.
  const archive = yield* SessionArchive();
  const resumeNotice = rawReactiveValue(archive.resumeNotice);
  const resumePromptText = yield* craftComputed(
    'resumePromptText',
    () => resumeNotice()?.prompt ?? '',
  );
  const resumeHandoffText = yield* craftComputed(
    'resumeHandoffText',
    () =>
      resumeNotice()?.appTabOpened
        ? 'Le replay reste ouvert ici ; un onglet dédié à la reprise vient de s’ouvrir. Colle la phrase dans la conversation de ton agent. Réponds à ses questions dans cette conversation.'
        : 'Le replay reste ouvert ici. Le navigateur a bloqué l’onglet dédié : ouvre-le avec le bouton ci-dessous, puis colle la phrase dans la conversation de ton agent. Réponds à ses questions dans cette conversation.',
  );
  const resumeRequestIdText = yield* craftComputed(
    'resumeRequestIdText',
    () =>
      `Demande ${resumeNotice()?.requestId ?? ''} · le point est figé pour cet événement.`,
  );
  const resumeAppUrlMissing = yield* craftComputed(
    'resumeAppUrlMissing',
    () => !resumeNotice()?.appUrl,
  );
  const resumed = div(
    {
      class: ui.gap,
      'data-lab': 'resume-requested',
      hidden: yield* craftComputed('hidden', () => {
        const notice = resumeNotice();
        return notice === undefined || notice.sessionId !== routeSessionId();
      }),
    },
    [
      DocCallout({
        tone: lit('tip'),
        caption: lit('Reprise demandée'),
        body: content(() => [
          p(resumeHandoffText),
          p({ 'aria-live': 'polite' }, resumeRequestIdText),
          pre(
            { class: ui.code, 'data-lab': 'resume-prompt' },
            resumePromptText,
          ),
          div({ class: ui.gapActions }, [
            button(
              'copyResumePromptAgain',
              {
                type: 'button',
                class: buttonUi.root,
                'data-variant': 'primary',
                click: () => copyResumePrompt(resumeNotice()?.prompt ?? ''),
              },
              'Copier le prompt',
            ),
            button(
              'openResumeAppTab',
              {
                type: 'button',
                class: buttonUi.root,
                'data-variant': 'secondary',
                hidden: resumeAppUrlMissing,
                click: () => {
                  const href = resumeNotice()?.appUrl;
                  if (href) openLinkedTab(href);
                },
              },
              'Ouvrir l’onglet de reprise',
            ),
            button(
              'dismissResumeNotice',
              {
                type: 'button',
                class: buttonUi.root,
                'data-variant': 'link',
                click: () => archive.resumeNotice.dismiss(),
              },
              'Fermer',
            ),
          ]),
        ]),
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
      hidden: yield* craftComputed('hidden',
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
          hidden: yield* craftComputed('hidden',
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
      hidden: yield* craftComputed('hidden',
        () => !warningHistoryOpen(),
      ),
    },
    [
      p(
        { class: ui.eventMeta },
        yield* craftComputed(
          'warningHistoryCount',
          () => `${replayWarnings().length} note(s) pour ce replay`,
        ),
      ),
      ul(
        { class: ui.events },
        forNode(
          yield* craftComputed('warningHistory', () =>
            [...replayWarnings()].reverse(),
          ),
          { track: (warning) => warning },
          (warning) =>
            li(
              {
                class: ui.noteItem,
                'data-note': function* () {
                  const text = yield* warning();
                  return isReplayErrorNote(text)
                    ? 'error'
                    : dismissedWarnings().includes(text)
                      ? 'dismissed'
                      : undefined;
                },
              },
              [
                button(
                  'copyReplayWarningHistory',
                  {
                    type: 'button',
                    class: [buttonUi.root, ui.noteText, ui.warningHistoryCopy],
                    'data-variant': 'link',
                    'data-lab': 'copy-replay-warning',
                    'aria-label': 'Copier la note du replay',
                    'data-tooltip': 'Copier cette note dans le presse-papiers.',
                    title: warning,
                    click: function* () {
                      copyReplayNote(yield* warning());
                    },
                  },
                  span({ class: ui.noteText }, warning),
                ),
                button(
                  'seekToWarning',
                  {
                    type: 'button',
                    class: buttonUi.root,
                    'data-variant': 'secondary',
                    'data-lab': 'seek-to-warning',
                    hidden: function* () {
                      return isReplayErrorNote(yield* warning());
                    },
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
    resumed,
    problem,
    toasts,
    history,
  ]);
});

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
      hidden: yield* craftComputed('hiddenSrcReplayNotices', () => !hasDifference()),
    },
    [
      p(
        { 'aria-live': 'polite' },
        yield* craftComputed('differenceMessage', () => {
          const currentDifference = difference();
          const transport = currentDifference?.transport;
          return transport
            ? `Décalage transport ${transport.transportId}, instance ${transport.instanceId}, ${transport.direction} ${transport.sequence}.`
            : `Décalage détecté à l’événement ${currentDifference?.eventId ?? '?'}.`;
        }),
      ),
      p(
        {
          hidden: yield* craftComputed(
            'hiddenSrcReplayNotices2',
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
              'hiddenSrcReplayNotices3',
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
            hidden: yield* craftComputed('hiddenSrcReplayNotices4', () => !canForceRecovery()),
            click: forceReplayRecovery,
          },
          'Forcer l’état attendu',
        ),
        span(
          {
            hidden: yield* craftComputed(
              'hiddenSrcReplayNotices5',
              () => !autoSkipDifferences(),
            ),
          },
          'Passage au checkpoint automatique activé.',
        ),
      ]),
      p(
        {
          hidden: yield* craftComputed(
            'hiddenSrcReplayNotices6',
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
      hidden: yield* craftComputed('hiddenSrcReplayNotices7', () => !differenceHistoryOpen()),
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
          hidden: yield* craftComputed('hiddenSrcReplayNotices8', () => !autoSkipDifferences()),
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
      hidden: yield* craftComputed(
        'hiddenSrcReplayNotices9',
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
        'hiddenSrcReplayNotices10',
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
  const resumed = div(
    {
      class: ui.gap,
      'data-lab': 'resume-requested',
      hidden: yield* craftComputed('resumeNoticeHidden', () => {
        const notice = resumeNotice();
        return notice === undefined || notice.sessionId !== routeSessionId();
      }),
    },
    [
      DocCallout({
        tone: lit('tip'),
        caption: lit('Reprise demandée'),
        body: content(() => [
          p(
            'Le point est publié pour l’IA. Colle cette phrase dans ton hôte IA (Claude Code, Codex…) connecté aux MCP de reprise, puis suis la reprise dans Journal › Reprise :',
          ),
          pre({ class: ui.code, 'data-lab': 'resume-prompt' }, resumePromptText),
          div({ class: ui.gapActions }, [
            button(
              'copyResumePromptAgain',
              {
                type: 'button',
                class: buttonUi.root,
                'data-variant': 'primary',
                click: () => copyResumePrompt(resumeNotice()?.prompt ?? ''),
              },
              'Copier la phrase',
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
      hidden: yield* craftComputed(
        'hiddenSrcReplayNotices11',
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
            'hiddenSrcReplayNotices12',
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
      hidden: yield* craftComputed('hiddenSrcReplayNotices13', () => !warningHistoryOpen()),
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

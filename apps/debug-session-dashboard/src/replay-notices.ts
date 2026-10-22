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
  type ReplayCommand,
} from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
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
  replayPlan,
  replayIndex,
  startMode,
  status,
  dismissAllWarnings,
  dismissedWarnings,
  dismissWarning,
  pendingWarnings,
  warningHistoryOpen,
} from './replay-state';
import { lit } from './view-helpers';

function replayPlanSummary(): string {
  const plan = replayPlan();
  if (!plan) return 'Plan de replay';
  const planState =
    plan.status === 'replayable'
      ? 'rejouable'
      : plan.status === 'partial'
        ? 'partiellement exploitable'
        : 'non rejouable';
  return `Plan de replay · ${planState} · ${plan.commands.length} commande(s)`;
}

function replayCommandStatus(item: ReplayCommand): string {
  const actionCommands = (replayPlan()?.commands ?? []).filter(
    (entry) => entry.kind !== 'restore-snapshot',
  );
  if (item.kind === 'restore-snapshot')
    return startMode() === 'snapshot'
      ? 'point de reprise sélectionné'
      : 'point de reprise disponible';
  const commandIndex = actionCommands.indexOf(item);
  const commandState =
    commandIndex < replayIndex()
      ? 'réussi'
      : commandIndex === replayIndex()
        ? 'en attente'
        : 'à venir';
  return `${commandState} · ${item.expected.length} observation(s) attendue(s)${item.dependsOn.length ? ` · après ${item.dependsOn.join(', ')}` : ''}`;
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
      hidden: yield* craftComputed('hidden', () => !hasDifference()),
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

  const differenceHistory = div(
    {
      class: ui.gap,
      'data-lab': 'difference-history',
      hidden: yield* craftComputed('hidden', () => !differenceHistoryOpen()),
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
          hidden: yield* craftComputed('hidden', () => !autoSkipDifferences()),
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
      hidden: yield* craftComputed('hidden', () => !warningHistoryOpen()),
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

  const orchestration = details({ 'data-lab': 'orchestration-plan' }, [
    summary(yield* craftComputed('orchestrationSummary', replayPlanSummary)),
    p(
      { class: ui.eventMeta },
      yield* craftComputed('orchestrationState', () => {
        const plan = replayPlan();
        return plan
          ? `${plan.observations.length} observation(s) à comparer · ${plan.issues.length} problème(s) de prévalidation`
          : 'Aucune archive chargée.';
      }),
    ),
    ul(
      { class: ui.events },
      forNode(
        yield* craftComputed(
          'orchestrationCommands',
          () => replayPlan()?.commands ?? [],
        ),
        { track: (command) => command.id },
        (command) =>
          li({ class: ui.event, 'data-entry': 'replay-command' }, [
            span({ class: ui.eventName }, function* () {
              const item = yield* command();
              return `${item.kind} · ${item.operationId}`;
            }),
            span({ class: ui.eventMeta }, function* () {
              return replayCommandStatus(yield* command());
            }),
          ]),
      ),
    ),
    ul(
      { class: ui.events },
      forNode(
        yield* craftComputed(
          'orchestrationIssues',
          () => replayPlan()?.issues ?? [],
        ),
        { track: (issue) => `${issue.code}:${issue.eventId ?? ''}` },
        (issue) =>
          li({ class: ui.event, 'data-entry': 'replay-plan-issue' }, [
            span({ class: ui.eventName }, function* () {
              const item = yield* issue();
              return item.code;
            }),
            span({ class: ui.eventMeta }, function* () {
              const item = yield* issue();
              return item.message;
            }),
          ]),
      ),
    ),
  ]);

  return div({ class: ui.notices }, [
    orchestration,
    diff,
    differenceHistory,
    partial,
    problem,
    toasts,
    history,
  ]);
});

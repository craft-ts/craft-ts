import { i18n } from '../../../shared/util/catalog';
import {
  craftComponent,
  details,
  forNode,
  li,
  p,
  span,
  summary,
  ul,
  type ReplayCommand,
} from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
import { ui } from '../../../shared/ui/dashboard.style';
import {
  replayIndex,
  replayPlan,
  startMode,
} from '../../../shared/state/replay-state';

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

function replayPlanStateMessage(
  plan: ReturnType<typeof replayPlan>,
): string {
  return plan
    ? i18n.t('replayPlanSummary', {
        observationCount: plan.observations.length,
        issueCount: plan.issues.length,
      })
    : i18n.t("copy.copy094");
}

function replayCommandStatus(item: ReplayCommand): string {
  const actionCommands = (replayPlan()?.commands ?? []).filter(
    (entry) => entry.kind !== 'restore-snapshot',
  );
  if (item.kind === 'restore-snapshot')
    return startMode() === 'snapshot'
      ? i18n.t("copy.copy095")
      : i18n.t("copy.copy096");
  const commandIndex = actionCommands.indexOf(item);
  const commandState =
    commandIndex < replayIndex()
      ? 'réussi'
      : commandIndex === replayIndex()
        ? 'en attente'
        : 'à venir';
  const dependencyText = item.dependsOn.length
    ? ` · après ${item.dependsOn.join(', ')}`
    : '';
  return i18n.t('replayCommandSummary', {
    commandState,
    expectedCount: item.expected.length,
    dependencyText,
  });
}

/** The compiled replay plan and its commands, grouped with the journal. */
export const ReplayOrchestration = craftComponent(
  'ReplayOrchestration',
  {},
  function* () {
    return details({ 'data-lab': 'orchestration-plan' }, [
      summary(yield* craftComputed('orchestrationSummary', replayPlanSummary)),
      p(
        { class: ui.eventMeta },
        yield* craftComputed('orchestrationState', () =>
          replayPlanStateMessage(replayPlan()),
        ),
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
  },
);

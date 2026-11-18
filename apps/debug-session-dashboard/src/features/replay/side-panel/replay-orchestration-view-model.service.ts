import { craftComputed, craftService } from '@craft-ts/core';
import type { ReplayCommand } from '@craft-ts/component';
import {
  replayIndex,
  replayPlan,
  startMode,
} from '../../../shared/state/replay-state';
import { i18n } from '../../../shared/util/catalog';

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
    : i18n.t('copy.copy094');
}

function replayCommandStatus(
  item: ReplayCommand,
  actionCommands: readonly ReplayCommand[],
  currentIndex: number,
  snapshotMode: boolean,
): string {
  if (item.kind === 'restore-snapshot')
    return snapshotMode ? i18n.t('copy.copy095') : i18n.t('copy.copy096');
  const commandIndex = actionCommands.indexOf(item);
  const commandState =
    commandIndex < currentIndex
      ? 'réussi'
      : commandIndex === currentIndex
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

/** Reactive labels and rows for the replay orchestration panel. */
export const { ReplayOrchestrationViewModel } = craftService(
  { name: 'replayOrchestrationViewModel', providedIn: 'global' },
  function* () {
    yield* craftComputed('summary', replayPlanSummary);
    yield* craftComputed('stateMessage', () =>
      replayPlanStateMessage(replayPlan()),
    );
    yield* craftComputed('commands', () => {
      const commands = replayPlan()?.commands ?? [];
      const actionCommands = commands.filter(
        (entry) => entry.kind !== 'restore-snapshot',
      );
      const currentIndex = replayIndex();
      const snapshotMode = startMode() === 'snapshot';
      return commands.map((item) => ({
        ...item,
        statusLabel: replayCommandStatus(
          item,
          actionCommands,
          currentIndex,
          snapshotMode,
        ),
      }));
    });
    yield* craftComputed('issues', () => replayPlan()?.issues ?? []);
  },
);

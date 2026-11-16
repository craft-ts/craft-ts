import {
  craftComponent,
  details,
  forNode,
  li,
  p,
  span,
  summary,
  ul,
} from '@craft-ts/component';
import { ui } from '../../../shared/ui/dashboard.style';
import { ReplayOrchestrationViewModel } from './replay-orchestration-view-model.service';

/** The compiled replay plan and its commands, grouped with the journal. */
export const ReplayOrchestration = craftComponent(
  'ReplayOrchestration',
  {},
  function* () {
    return details({ 'data-lab': 'orchestration-plan' }, [
      summary(function* () {
        return yield* (yield* ReplayOrchestrationViewModel()).summary();
      }),
      p(
        { class: ui.eventMeta },
        function* () {
          return yield* (yield* ReplayOrchestrationViewModel()).stateMessage();
        },
      ),
      ul(
        { class: ui.events },
        forNode(
          function* () {
            return yield* (yield* ReplayOrchestrationViewModel()).commands();
          },
          { track: (command) => command.id },
          (command) =>
            li({ class: ui.event, 'data-entry': 'replay-command' }, [
              span({ class: ui.eventName }, function* () {
                const item = yield* command();
                return `${item.kind} · ${item.operationId}`;
              }),
              span({ class: ui.eventMeta }, function* () {
                return (yield* command()).statusLabel;
              }),
            ]),
        ),
      ),
      ul(
        { class: ui.events },
        forNode(
          function* () {
            return yield* (yield* ReplayOrchestrationViewModel()).issues();
          },
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

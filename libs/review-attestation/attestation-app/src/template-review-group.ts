import {
  article,
  button,
  craftComponent,
  details,
  div,
  forNode,
  heading,
  headingSection,
  header,
  ifNode,
  input,
  label,
  li,
  p,
  section,
  small,
  span,
  strong,
  summary,
  textarea,
  ul,
  type Input,
  type Output,
  withComponentProviders,
} from '@craft-ts/component';
import { craftService, craftPrivate, craftComputed } from '@craft-ts/core';
import type { ReviewApiQueue } from '@craft-ts/style-testing/review';
import type { Messages } from './messages';
import { eventValue } from './annotation-text';
import type { Locale } from './preferences';
import {
  pendingTemplateCards,
  type TemplateReviewGroup,
} from './template-review-groups';
import {
  componentLabelOf,
  conditionText,
  stateText,
  templateStatementOf,
  templateVariableStatementOf,
} from './card-presentation';
import { reviewBits, templateReviewGroup } from './review-card.style';

export const { TemplateReviewGroupState, provideTemplateReviewGroupState } =
  craftService(
    { name: 'templateReviewGroupState', providedIn: 'toProvide' },
    function* (serviceInputs: {
      readonly $provided: {
        group: Input<TemplateReviewGroup>;
        selectedIds: Input<readonly string[]>;
        note: Input<string>;
        rejectionOpen: Input<boolean>;
        busy: Input<boolean>;
        agentAvailable: Input<boolean>;
        agentBusy: Input<boolean>;
        agentFailed: Input<boolean>;
        agentResults: Input<
          NonNullable<ReviewApiQueue['templateAgentResults']>
        >;
        groupIndex: Input<number>;
        groupTotal: Input<number>;
        toggleCard: Output<(id: string) => void>;
        selectAll: Output<() => void>;
        selectHuman: Output<() => void>;
        clearSelection: Output<() => void>;
        requestReject: Output<() => void>;
        cancelReject: Output<() => void>;
        submitReject: Output<() => void>;
        accept: Output<() => void>;
        delegate: Output<() => void>;
        previousGroup: Output<() => void>;
        nextGroup: Output<() => void>;
        writeNote: Output<(value: string) => void>;
        locale: Input<Locale>;
        t: Input<Messages>;
      };
    }) {
      const inputs = serviceInputs.$provided;
      const {
        group,
        selectedIds,
        rejectionOpen,
        busy,
        agentAvailable,
        agentBusy,
        agentFailed,
        agentResults,
        groupIndex,
        groupTotal,
        locale,
        t,
      } = inputs;
      const selectedCount = yield* craftPrivate(
        craftComputed('selectedCount', function* () {
          const ids = new Set(yield* selectedIds());
          return pendingTemplateCards(yield* group()).filter((card) =>
            ids.has(card.id),
          ).length;
        }),
      );
      const allSelected = yield* craftComputed('allSelected', function* () {
        const pending = pendingTemplateCards(yield* group());
        const ids = yield* selectedIds();
        return (
          pending.length > 0 && pending.every((card) => ids.includes(card.id))
        );
      });
      const actionDisabled = yield* craftComputed(
        'actionDisabled',
        function* () {
          return (yield* busy()) || (yield* selectedCount()) === 0;
        },
      );
      yield* craftComputed('showReject', function* () {
        return yield* rejectionOpen();
      });
      yield* craftComputed('showActions', function* () {
        return !(yield* rejectionOpen());
      });
      yield* craftComputed('showAgentBusy', function* () {
        return yield* agentBusy();
      });
      yield* craftComputed('showAgentFailed', function* () {
        return yield* agentFailed();
      });
      yield* craftComputed('noAgent', function* () {
        return !(yield* agentAvailable());
      });
      const view = yield* craftComputed('view', function* () {
        const value = yield* group();
        const say = yield* t();
        const count = yield* selectedCount();
        const working = yield* busy();
        const index = yield* groupIndex();
        const total = yield* groupTotal();
        return {
          title: componentLabelOf(value.component),
          context: value.conditions.length
            ? say.templateWhen(conditionText(value.conditions, say))
            : say.templateGroupNoConditions,
          lead: say.templateGroupLead(value.direction),
          progress: say.templateProgress(index + 1, total),
          previousDisabled: working || index <= 0,
          nextDisabled: working || index >= total - 1,
          remaining: say.templateRemaining(pendingTemplateCards(value).length),
          selectLabel: (yield* allSelected())
            ? say.templateGroupClear
            : say.templateGroupSelect,
          selected: say.templateGroupSelected(count),
          acceptLabel: say.templateGroupAcceptSelected(count),
          rejectLabel: say.templateGroupRejectSelected(count),
          delegateDisabled:
            (yield* actionDisabled()) || !(yield* agentAvailable()),
        };
      });
      yield* craftComputed('viewTitle', function* () {
        return (yield* view()).title;
      });
      yield* craftComputed('templateReviewGroupRows', function* () {
        const value = yield* group();
        const say = yield* t();
        const language = yield* locale();
        const selected = new Set(yield* selectedIds());
        const working = yield* busy();
        const results = yield* agentResults();
        return value.cards.map((card) => {
          const previous = card.previousDecision;
          const result = results.find(
            (candidate) =>
              candidate.id === card.id && candidate.revision === card.revision,
          );
          return {
            id: card.id,
            selected: card.state !== 'removed' && selected.has(card.id),
            disabled: working || card.state === 'removed',
            status:
              card.state === 'removed'
                ? 'removed'
                : previous?.verdict === 'rejected'
                  ? 'rejected'
                  : 'pending',
            selectionLabel: `${say.templateGroupSelectObligation} ${card.subject}`,
            variable: templateVariableStatementOf(
              card.statementParts,
              card.statement,
            ),
            policy:
              card.validationPolicy === 'agent-allowed'
                ? say.templateAgentAllowed
                : say.templateHumanRequired,
            state: stateText(card.state, say),
            author: previous
              ? say.templateReviewedBy(previous.by, !!previous.agentReview)
              : '',
            hideResult: !result,
            resultLabel:
              result?.outcome === 'accepted'
                ? say.templateAgentAccepted
                : result?.outcome === 'contradiction'
                  ? say.templateAgentContradiction
                  : say.templateAgentNeedsHuman,
            rationale: result?.rationale ?? '',
            references: result?.references.join(' · ') ?? '',
            statement: templateStatementOf(
              card.statementParts,
              card.statement,
              say,
              language,
            ),
            subject: card.subject,
            changes: card.changes.join(' · ') || card.reason,
            previousNote: previous?.note ?? '',
            previousReferences:
              previous?.agentReview?.references.join(' · ') ?? '',
          };
        });
      });
    },
  );

export const TemplateReviewGroupView = craftComponent(
  'TemplateReviewGroupView',
  {},
  (inputs: {
    group: Input<TemplateReviewGroup>;
    selectedIds: Input<readonly string[]>;
    note: Input<string>;
    rejectionOpen: Input<boolean>;
    busy: Input<boolean>;
    agentAvailable: Input<boolean>;
    agentBusy: Input<boolean>;
    agentFailed: Input<boolean>;
    agentResults: Input<NonNullable<ReviewApiQueue['templateAgentResults']>>;
    groupIndex: Input<number>;
    groupTotal: Input<number>;
    toggleCard: Output<(id: string) => void>;
    selectAll: Output<() => void>;
    selectHuman: Output<() => void>;
    clearSelection: Output<() => void>;
    requestReject: Output<() => void>;
    cancelReject: Output<() => void>;
    submitReject: Output<() => void>;
    accept: Output<() => void>;
    delegate: Output<() => void>;
    previousGroup: Output<() => void>;
    nextGroup: Output<() => void>;
    writeNote: Output<(value: string) => void>;
    locale: Input<Locale>;
    t: Input<Messages>;
  }) => article({ class: templateReviewGroup.root, 'aria-busy': inputs.busy }, [
      header(
        {
          class: templateReviewGroup.header,
          'data-testid': 'template-group-header',
        },
        [
          div({ class: templateReviewGroup.headerCopy }, [
            small({ class: reviewBits.eyebrow }, function* () {
              return (yield* inputs.t()).templateGroupEyebrow;
            }),
            headingSection(heading(function* () {
              return yield* (yield* TemplateReviewGroupState()).viewTitle();
            })),
            p(function* () {
              return (yield* (yield* TemplateReviewGroupState()).view()).context;
            }),
            strong(function* () {
              return (yield* (yield* TemplateReviewGroupState()).view()).lead;
            }),
          ]),
          div({ class: templateReviewGroup.headerControls }, [
            small(function* () {
              return (yield* (yield* TemplateReviewGroupState()).view()).progress;
            }),
            button(
              'PreviousTemplateGroup',
              {
                class: reviewBits.button,
                type: 'button',
                click: inputs.previousGroup,
                disabled: function* () {
                  return (yield* (yield* TemplateReviewGroupState()).view()).previousDisabled;
                },
              },
              function* () {
                return (yield* inputs.t()).templatePreviousGroup;
              },
            ),
            button(
              'NextTemplateGroup',
              {
                class: reviewBits.button,
                type: 'button',
                click: inputs.nextGroup,
                disabled: function* () {
                  return (yield* (yield* TemplateReviewGroupState()).view()).nextDisabled;
                },
              },
              function* () {
                return (yield* inputs.t()).templateNextGroup;
              },
            ),
            span({ class: reviewBits.chip }, function* () {
              return (yield* (yield* TemplateReviewGroupState()).view()).remaining;
            }),
          ]),
        ],
      ),
      section(
        {
          class: templateReviewGroup.selection,
          'aria-label': 'Group selection',
        },
        [
          label([
            input('SelectTemplateGroup', {
              type: 'checkbox',
              checked: function* () {
                return yield* (yield* TemplateReviewGroupState()).allSelected();
              },
              disabled: inputs.busy,
              'aria-label': function* () {
                return (yield* inputs.t()).templateGroupSelect;
              },
              *change() {
                if (yield* (yield* TemplateReviewGroupState()).allSelected()) inputs.clearSelection();
                else inputs.selectAll();
              },
            }),
            span(function* () {
              return (yield* (yield* TemplateReviewGroupState()).view()).selectLabel;
            }),
          ]),
          button(
            'SelectHumanTemplateObligations',
            {
              class: reviewBits.button,
              type: 'button',
              click: inputs.selectHuman,
              disabled: inputs.busy,
            },
            function* () {
              return (yield* inputs.t()).templateSelectHuman;
            },
          ),
          small({ 'aria-live': 'polite' }, function* () {
            return (yield* (yield* TemplateReviewGroupState()).view()).selected;
          }),
        ],
      ),
      ul(
        {
          class: templateReviewGroup.list,
          'data-testid': 'template-obligation-list',
          'aria-label': 'Template obligations',
        },
        forNode(
          function* () {
            return yield* (yield* TemplateReviewGroupState()).templateReviewGroupRows();
          },
          { track: (row) => row.id },
          (row) =>
          li(
            {
              class: templateReviewGroup.obligation,
              'data-review-status': function* () {
                return (yield* row()).status;
              },
            },
            [
              input('SelectTemplateObligation', {
                class: templateReviewGroup.obligationCheckbox,
                type: 'checkbox',
                checked: function* () {
                  return (yield* row()).selected;
                },
                disabled: function* () {
                  return (yield* row()).disabled;
                },
                'aria-label': function* () {
                  return (yield* row()).selectionLabel;
                },
                *change() {
                  inputs.toggleCard((yield* row()).id);
                },
              }),
              div(
                {
                  class: templateReviewGroup.obligationCopy,
                  'data-testid': 'template-obligation-copy',
                },
                [
                  strong(function* () {
                    return (yield* row()).variable;
                  }),
                  div({ class: templateReviewGroup.obligationMeta }, [
                    span({ class: reviewBits.chip }, function* () {
                      return (yield* row()).policy;
                    }),
                    span({ class: reviewBits.chip }, function* () {
                      return (yield* row()).state;
                    }),
                    small(function* () {
                      return (yield* row()).author;
                    }),
                  ]),
                  div(
                    {
                      class: templateReviewGroup.agentResult,
                      'data-testid': 'template-agent-result',
                      'aria-live': 'polite',
                      hidden: function* () {
                        return (yield* row()).hideResult;
                      },
                    },
                    [
                      strong(function* () {
                        return (yield* row()).resultLabel;
                      }),
                      p(function* () {
                        return (yield* row()).rationale;
                      }),
                      small(function* () {
                        return (yield* row()).references;
                      }),
                    ],
                  ),
                  details({ class: templateReviewGroup.obligationDetails }, [
                    summary(function* () {
                      return (yield* inputs.t()).templateDetails;
                    }),
                    p(function* () {
                      return (yield* row()).statement;
                    }),
                    small({ class: reviewBits.code }, function* () {
                      return (yield* row()).subject;
                    }),
                    p(function* () {
                      return (yield* row()).changes;
                    }),
                    p(function* () {
                      return (yield* row()).previousNote;
                    }),
                    small(function* () {
                      return (yield* row()).previousReferences;
                    }),
                  ]),
                ],
              ),
            ],
          ),
        ),
      ),
      section({ class: templateReviewGroup.actions }, [
        ifNode('showAgentBusy', inputs.agentBusy, () =>
          p({ role: 'status' }, function* () {
            return (yield* inputs.t()).templateAgentBusy;
          }),
        ),
        ifNode('showAgentFailed', inputs.agentFailed, () =>
          p({ role: 'alert' }, function* () {
            return (yield* inputs.t()).templateAgentFailed;
          }),
        ),
        ifNode('showReject', inputs.rejectionOpen, () =>
          div([
            label({ htmlFor: 'template-group-note' }, function* () {
              return (yield* inputs.t()).templateGroupReason;
            }),
            textarea('TemplateGroupNote', {
              id: 'template-group-note',
              value: inputs.note,
              rows: 3,
              'aria-label': function* () {
                return (yield* inputs.t()).templateGroupReason;
              },
              *input(event: Event) {
                inputs.writeNote(eventValue(event));
              },
            }),
            div([
              button(
                'CancelTemplateGroupReject',
                { type: 'button', click: inputs.cancelReject, disabled: inputs.busy },
                function* () {
                  return (yield* inputs.t()).cancel;
                },
              ),
              button(
                'SubmitTemplateGroupReject',
                {
                  type: 'button',
                  class: reviewBits.button,
                  'data-reviewAction': 'danger',
                  disabled: function* () {
                    return yield* (yield* TemplateReviewGroupState()).actionDisabled();
                  },
                  click: inputs.submitReject,
                },
                function* () {
                  return (yield* (yield* TemplateReviewGroupState()).view()).rejectLabel;
                },
              ),
            ]),
          ]),
        ),
        div(
          {
            class: templateReviewGroup.actionButtons,
            hidden: inputs.rejectionOpen,
          }, [
            button(
              'DelegateTemplateGroup',
              {
                class: reviewBits.button,
                type: 'button',
                click: inputs.delegate,
                disabled: function* () {
                  return (yield* (yield* TemplateReviewGroupState()).view()).delegateDisabled;
                },
              },
              function* () {
                return (yield* inputs.t()).templateDelegate;
              },
            ),
            button(
              'RejectTemplateGroup',
              {
                type: 'button',
                class: reviewBits.button,
                'data-reviewAction': 'danger',
                disabled: function* () {
                  return yield* (yield* TemplateReviewGroupState()).actionDisabled();
                },
                click: inputs.requestReject,
              },
              function* () {
                return (yield* (yield* TemplateReviewGroupState()).view()).rejectLabel;
              },
            ),
            button(
              'AcceptTemplateGroup',
              {
                type: 'button',
                class: reviewBits.button,
                'data-reviewAction': 'primary',
                disabled: function* () {
                  return yield* (yield* TemplateReviewGroupState()).actionDisabled();
                },
                click: inputs.accept,
              },
              [
                function* () {
                  return (yield* (yield* TemplateReviewGroupState()).view()).acceptLabel;
                },
                span({ class: reviewBits.key, 'data-testid': 'key' }, 'A'),
              ],
            ),
          ]),
        ifNode(
          'agentAvailable',
          inputs.agentAvailable,
          () => null,
          () =>
            small(function* () {
              return (yield* inputs.t()).templateAgentUnavailable;
            }),
        ),
      ]),
    ]),
).pipe(
  withComponentProviders((inputs) => [provideTemplateReviewGroupState(inputs)]),
);

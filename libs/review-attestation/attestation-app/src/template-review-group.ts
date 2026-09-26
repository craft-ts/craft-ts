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
} from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
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

export const TemplateReviewGroupView = craftComponent(
  'TemplateReviewGroupView',
  {},
  ({
    group,
    selectedIds,
    note,
    rejectionOpen,
    busy,
    agentAvailable,
    agentBusy,
    agentFailed,
    agentResults,
    groupIndex,
    groupTotal,
    toggleCard,
    selectAll,
    selectHuman,
    clearSelection,
    requestReject,
    cancelReject,
    submitReject,
    accept,
    delegate,
    previousGroup,
    nextGroup,
    writeNote,
    locale,
    t,
  }: {
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
  }) => {
    const selectedCount = craftComputed('selectedCount', function* () {
      const ids = new Set(yield* selectedIds());
      return pendingTemplateCards(yield* group()).filter((card) =>
        ids.has(card.id),
      ).length;
    });
    const allSelected = craftComputed('allSelected', function* () {
      const pending = pendingTemplateCards(yield* group());
      const ids = yield* selectedIds();
      return (
        pending.length > 0 && pending.every((card) => ids.includes(card.id))
      );
    });
    const actionDisabled = craftComputed('actionDisabled', function* () {
      return (yield* busy()) || (yield* selectedCount()) === 0;
    });
    const showReject = craftComputed('showReject', function* () {
      return yield* rejectionOpen();
    });
    const showActions = craftComputed('showActions', function* () {
      return !(yield* rejectionOpen());
    });
    const showAgentBusy = craftComputed('showAgentBusy', function* () {
      return yield* agentBusy();
    });
    const showAgentFailed = craftComputed('showAgentFailed', function* () {
      return yield* agentFailed();
    });
    const noAgent = craftComputed('noAgent', function* () {
      return !(yield* agentAvailable());
    });
    const view = craftComputed('view', function* () {
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
    const viewTitle = craftComputed('viewTitle', function* () {
      return (yield* view()).title;
    });
    const rows = craftComputed('rows', function* () {
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
    return {
      view,
      viewTitle,
      rows,
      note,
      busy,
      toggleCard,
      selectAll,
      selectHuman,
      clearSelection,
      requestReject,
      cancelReject,
      submitReject,
      accept,
      delegate,
      previousGroup,
      nextGroup,
      writeNote,
      t,
      allSelected,
      actionDisabled,
      showReject,
      showActions,
      showAgentBusy,
      showAgentFailed,
      noAgent,
    };
  },
  ({
    view,
    viewTitle,
    rows,
    note,
    busy,
    toggleCard,
    selectAll,
    selectHuman,
    clearSelection,
    requestReject,
    cancelReject,
    submitReject,
    accept,
    delegate,
    previousGroup,
    nextGroup,
    writeNote,
    t,
    allSelected,
    actionDisabled,
    showReject,
    showActions,
    showAgentBusy,
    showAgentFailed,
    noAgent,
  }) =>
    article({ class: templateReviewGroup.root, 'aria-busy': busy }, [
      header(
        {
          class: templateReviewGroup.header,
          'data-testid': 'template-group-header',
        },
        [
          div({ class: templateReviewGroup.headerCopy }, [
            small({ class: reviewBits.eyebrow }, function* () {
              return (yield* t()).templateGroupEyebrow;
            }),
            headingSection(heading(viewTitle)),
            p(function* () {
              return (yield* view()).context;
            }),
            strong(function* () {
              return (yield* view()).lead;
            }),
          ]),
          div({ class: templateReviewGroup.headerControls }, [
            small(function* () {
              return (yield* view()).progress;
            }),
            button(
              'PreviousTemplateGroup',
              {
                class: reviewBits.button,
                type: 'button',
                click: previousGroup,
                disabled: function* () {
                  return (yield* view()).previousDisabled;
                },
              },
              function* () {
                return (yield* t()).templatePreviousGroup;
              },
            ),
            button(
              'NextTemplateGroup',
              {
                class: reviewBits.button,
                type: 'button',
                click: nextGroup,
                disabled: function* () {
                  return (yield* view()).nextDisabled;
                },
              },
              function* () {
                return (yield* t()).templateNextGroup;
              },
            ),
            span({ class: reviewBits.chip }, function* () {
              return (yield* view()).remaining;
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
              checked: allSelected,
              disabled: busy,
              'aria-label': function* () {
                return (yield* t()).templateGroupSelect;
              },
              *change() {
                if (yield* allSelected()) yield* clearSelection();
                else yield* selectAll();
              },
            }),
            span(function* () {
              return (yield* view()).selectLabel;
            }),
          ]),
          button(
            'SelectHumanTemplateObligations',
            {
              class: reviewBits.button,
              type: 'button',
              click: selectHuman,
              disabled: busy,
            },
            function* () {
              return (yield* t()).templateSelectHuman;
            },
          ),
          small({ 'aria-live': 'polite' }, function* () {
            return (yield* view()).selected;
          }),
        ],
      ),
      ul(
        {
          class: templateReviewGroup.list,
          'data-testid': 'template-obligation-list',
          'aria-label': 'Template obligations',
        },
        forNode(rows, { track: (row) => row.id }, (row) =>
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
                  yield* toggleCard((yield* row()).id);
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
                      return (yield* t()).templateDetails;
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
        ifNode(showAgentBusy, () =>
          p({ role: 'status' }, function* () {
            return (yield* t()).templateAgentBusy;
          }),
        ),
        ifNode(showAgentFailed, () =>
          p({ role: 'alert' }, function* () {
            return (yield* t()).templateAgentFailed;
          }),
        ),
        ifNode(showReject, () =>
          div([
            label({ htmlFor: 'template-group-note' }, function* () {
              return (yield* t()).templateGroupReason;
            }),
            textarea('TemplateGroupNote', {
              id: 'template-group-note',
              value: note,
              rows: 3,
              'aria-label': function* () {
                return (yield* t()).templateGroupReason;
              },
              *input(event: Event) {
                yield* writeNote(eventValue(event));
              },
            }),
            div([
              button(
                'CancelTemplateGroupReject',
                { type: 'button', click: cancelReject, disabled: busy },
                function* () {
                  return (yield* t()).cancel;
                },
              ),
              button(
                'SubmitTemplateGroupReject',
                {
                  type: 'button',
                  class: reviewBits.button,
                  'data-reviewAction': 'danger',
                  disabled: actionDisabled,
                  click: submitReject,
                },
                function* () {
                  return (yield* view()).rejectLabel;
                },
              ),
            ]),
          ]),
        ),
        ifNode(showActions, () =>
          div({ class: templateReviewGroup.actionButtons }, [
            button(
              'DelegateTemplateGroup',
              {
                class: reviewBits.button,
                type: 'button',
                click: delegate,
                disabled: function* () {
                  return (yield* view()).delegateDisabled;
                },
              },
              function* () {
                return (yield* t()).templateDelegate;
              },
            ),
            button(
              'RejectTemplateGroup',
              {
                type: 'button',
                class: reviewBits.button,
                'data-reviewAction': 'danger',
                disabled: actionDisabled,
                click: requestReject,
              },
              function* () {
                return (yield* view()).rejectLabel;
              },
            ),
            button(
              'AcceptTemplateGroup',
              {
                type: 'button',
                class: reviewBits.button,
                'data-reviewAction': 'primary',
                disabled: actionDisabled,
                click: accept,
              },
              [
                function* () {
                  return (yield* view()).acceptLabel;
                },
                span({ class: reviewBits.key, 'data-testid': 'key' }, 'A'),
              ],
            ),
          ]),
        ),
        ifNode(noAgent, () =>
          small(function* () {
            return (yield* t()).templateAgentUnavailable;
          }),
        ),
      ]),
    ]),
);

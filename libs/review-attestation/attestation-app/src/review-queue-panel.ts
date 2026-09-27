import {
  aside,
  button,
  craftComponent,
  div,
  forNode,
  heading,
  header,
  ifNode,
  li,
  p,
  section,
  small,
  span,
  strong,
  ul,
  type Input,
  type Output,
} from '@craft-ts/component';
import type {
  ReviewApiQueue,
  ReviewSessionDecision,
} from '@craft-ts/style-testing/review';
import { craftComputed, craftMethod, deepYieldable } from '@craft-ts/core';
import type { DevtoolView } from './devtool-view-state';
import type { Messages } from './messages';
import { ThemeLocalePicker } from './theme-locale-picker';
import { FilterBarActions, FilterBarFields } from './filter-bar';
import { ViewTabs } from './view-tabs';
import { reasonText, scenarioOf } from './card-presentation';
import { reviewBits } from './review-card.style';
import { viewTabs } from './view-tabs.style';
import { shell } from './review-shell.style';
import { filters } from './review-controls.style';

type ReviewCard = ReviewApiQueue['cards'][number];
type Inputs = {
  queueValue: Input<ReviewApiQueue | undefined>;
  regenerationAvailable: Input<boolean>;
  regenerating: Input<boolean>;
  openRegenerationDialog: Output<() => unknown>;
  iterationHandoffAvailable: Input<boolean>;
  handoffBusy: Input<boolean>;
  openIterationDialog: Output<() => unknown>;
  devtoolView: Input<DevtoolView>;
  chooseDevtoolView: Output<(view: DevtoolView) => unknown>;
  visualTests: Input<ReviewApiQueue['visualTests']>;
  templateObligations: Input<ReviewApiQueue['templateObligations']>;
  folderLayouts: Input<NonNullable<ReviewApiQueue['folderLayouts']>>;
  bypasses: Input<NonNullable<ReviewApiQueue['bypasses']>>;
  reviewCards: Input<readonly ReviewCard[]>;
  t: Input<Messages>;
  cards: Input<readonly ReviewCard[]>;
  reviewFailed: Input<boolean>;
  activeIndex: Input<number>;
  selectCard: Output<(index: number) => unknown>;
  sessionHistory: Input<ReviewApiQueue['history']>;
  reopening: Input<boolean>;
  reopenDecision: Output<(entry: ReviewSessionDecision) => void>;
  movePrevious: Output<() => unknown>;
  moveNext: Output<() => unknown>;
};

/** The review queue, filters, session history, and card navigation. */
export const ReviewQueuePanel = craftComponent(
  'ReviewQueuePanel',
  {},
  function* (inputs: Inputs) {
    const {
      queueValue,
      regenerating,
      openRegenerationDialog,
      handoffBusy,
      openIterationDialog,
      devtoolView,
      chooseDevtoolView,
      visualTests,
      templateObligations,
      folderLayouts,
      bypasses,
      reviewCards,
      t,
      cards,
      reviewFailed,
      activeIndex,
      selectCard,
      sessionHistory,
      reopening,
      movePrevious,
      moveNext,
    } = inputs;
    const canRegenerate = yield* craftComputed('canRegenerate', function* () {
      return yield* inputs.regenerationAvailable();
    });
    const canStartHandoff = yield* craftComputed('canStartHandoff', function* () {
      return yield* inputs.iterationHandoffAvailable();
    });
    const queueTitle = yield* craftComputed('queueTitle', function* () {
      const queue = yield* inputs.queueValue();
      const unified =
        (queue?.templateObligations.length ?? 0) > 0 ||
        queue?.cards.some((card) => card.kind !== 'visual');
      const messages = yield* inputs.t();
      return unified ? messages.attestationTitle : messages.appTitle;
    });
    const regeneratingLabel = yield* craftComputed('regeneratingLabel', function* () {
      const messages = yield* inputs.t();
      return (yield* inputs.regenerating())
        ? messages.regeneratingEvidence
        : messages.regenerateEvidence;
    });
    const reopeningLabel = yield* craftComputed('reopeningLabel', function* () {
      const messages = yield* inputs.t();
      return (yield* inputs.reopening())
        ? messages.reopeningDecision
        : messages.reopenDecision;
    });
    const queueItems = deepYieldable(
      yield* craftComputed('queueItems', function* () {
        const queue = yield* inputs.cards();
        const messages = yield* inputs.t();
        return queue.map((card) => ({
          card,
          scenario: scenarioOf(card.subject),
          hint:
            card.cluster.length > 1
              ? messages.identicalChanges(card.cluster.length)
              : reasonText(card.reason, messages),
        }));
      }),
    );
    const historyItems = deepYieldable(
      yield* craftComputed('historyItems', function* () {
        return (yield* inputs.sessionHistory()).map((entry, index) => ({
          index,
          shape: entry.decision.shape,
          id: entry.decision.id ?? '',
          cardSubject: entry.card.subject,
          verdict: entry.decision.verdict,
        }));
      }),
    );
    const reopenHistoryItem = yield* craftMethod(
      'reopenHistoryItem',
      function* (index: number) {
        const entry = (yield* inputs.sessionHistory())[index];
        if (entry) {
          inputs.reopenDecision(entry);
        }
      },
    );
    return aside(
      {
        class: shell.queuePanel,
        'data-testid': 'queue-panel',
        'aria-label': 'Review queue',
      },
      [
        // In the sidebar rather than across the top. A full-width banner
        // repeating the name of the tool cost a band of height on every
        // card, and height is the thing a tall capture has none of.
        header({ class: shell.brand, 'data-testid': 'brand' }, [
          small(
            { class: [reviewBits.eyebrow, shell.brandEyebrow] },
            function* () {
              return (yield* t()).brand;
            },
          ),
          heading({ class: shell.brandTitle }, queueTitle),
          div(
            { class: shell.queueSummary, 'aria-live': 'polite' },
            function* () {
              const queue = yield* queueValue();
              return (yield* t()).queueSummary(
                queue?.items ?? 0,
                queue?.decisions ?? 0,
              );
            },
          ),
          ifNode(canRegenerate, () =>
            button(
              'OpenRegenerationDialog',
              {
                type: 'button',
                class: shell.regenerate,
                disabled: regenerating,
                click: openRegenerationDialog,
              },
              [span({ 'aria-hidden': 'true' }, '↻'), regeneratingLabel],
            ),
          ),
          ifNode(canStartHandoff, () =>
            button(
              'GenerateIterationHandoff',
              {
                type: 'button',
                class: shell.iterate,
                disabled: handoffBusy,
                click: openIterationDialog,
              },
              [
                span({ 'aria-hidden': 'true' }, '↗'),
                function* () {
                  return (yield* t()).iterationHandoff;
                },
              ],
            ),
          ),
          // The two choices about the tool rather than about a render. In
          // the sidebar with the name, because neither belongs beside the
          // evidence: a reviewer sets them once and then judges renders.
          ThemeLocalePicker({}),
        ]),
        div(
          {
            class: viewTabs.root,
            role: 'navigation',
            'aria-label': function* () {
              return (yield* t()).viewNavigation;
            },
          },
          [
            div({ class: viewTabs.heading }, [
              heading({ class: viewTabs.headingTitle }, function* () {
                return (yield* t()).viewNavigation;
              }),
              small({ class: viewTabs.headingHint }, function* () {
                return (yield* t()).viewNavigationDescription;
              }),
            ]),
            ViewTabs({
              devtoolView,
              chooseDevtoolView,
              visualTestsCount: function* () {
                return (yield* visualTests()).length;
              },
              templateObligationsCount: function* () {
                return (yield* templateObligations()).length;
              },
              folderLayoutCount: function* () {
                return (yield* folderLayouts()).length;
              },
              bypassesCount: function* () {
                return (yield* bypasses()).length;
              },
              cardsCount: function* () {
                return (yield* reviewCards()).length;
              },
              t,
            }),
          ],
        ),
        section(
          {
            class: filters.panel,
            'data-testid': 'shared-filters',
            hidden: function* () {
              return (yield* devtoolView()) === 'review';
            },
            'aria-label': function* () {
              return (yield* t()).filters;
            },
          },
          [
            div({ class: filters.heading }, [
              div([
                heading({ class: filters.title }, function* () {
                  return (yield* t()).filters;
                }),
                small({ class: filters.hint }, function* () {
                  return (yield* t()).filtersDescription;
                }),
              ]),
              FilterBarActions({}),
            ]),
            FilterBarFields({}),
          ],
        ),
        div(
          {
            class: shell.panelHeading,
            hidden: function* () {
              return (yield* devtoolView()) !== 'review';
            },
          },
          [
            heading(function* () {
              return (yield* t()).queue;
            }),
            small({ class: shell.panelHint }, function* () {
              return (yield* t()).queueSubtitle;
            }),
          ],
        ),
        div(
          {
            class: shell.queueList,
            hidden: function* () {
              return (yield* devtoolView()) !== 'review';
            },
          },
          forNode(
            queueItems,
            {
              track: (item) => item.card.shape,
              empty: () =>
                div(
                  {
                    class: shell.emptyQueue,
                    // A failed request is not an empty review. Keep the
                    // completion message from masking the error banner.
                    hidden: reviewFailed,
                  },
                  [
                    strong(function* () {
                      return (yield* t()).reviewComplete;
                    }),
                    p({ class: shell.emptyQueueBody }, function* () {
                      return (yield* t()).reviewCompleteBody;
                    }),
                  ],
                ),
            },
            (item, index) =>
              button(
                'SelectReviewCard',
                {
                  type: 'button',
                  class: shell.queueItem,
                  'aria-current': function* () {
                    return String(index === (yield* activeIndex()));
                  },
                  *click() {
                    selectCard(index);
                  },
                },
                [
                  span({ class: shell.scenarioName }, item.scenario),
                  small({ class: shell.queueItemHint }, item.hint),
                ],
              ),
          ),
        ),
        section(
          {
            class: shell.history,
            hidden: function* () {
              return (yield* sessionHistory()).length === 0;
            },
            'aria-label': function* () {
              return (yield* t()).sessionHistoryTitle;
            },
          },
          [
            heading(function* () {
              return (yield* t()).sessionHistoryTitle;
            }),
            small({ class: shell.historyHint }, function* () {
              return (yield* t()).sessionHistoryDescription;
            }),
            ul(
              { class: shell.historyList },
              forNode(
                historyItems,
                {
                  track: (entry) => `${entry.shape}:${entry.id}`,
                },
                (entry, index) =>
                  li([
                    button(
                      'ReopenReviewDecision',
                      {
                        type: 'button',
                        disabled: reopening,
                        class: shell.historyItem,
                        *click() {
                          reopenHistoryItem(yield* entry.index());
                        },
                      },
                      [
                        strong({ class: shell.historyTitle }, function* () {
                          return `${index + 1}. ${scenarioOf(yield* entry.cardSubject())}`;
                        }),
                        small({ class: shell.historyVerdict }, function* () {
                          return (yield* t()).previousVerdict(
                            yield* entry.verdict(),
                          );
                        }),
                        span({ class: shell.historyAction }, reopeningLabel),
                      ],
                    ),
                  ]),
              ),
            ),
          ],
        ),
        div(
          {
            class: shell.navigation,
            hidden: function* () {
              return (yield* devtoolView()) !== 'review';
            },
          },
          [
            button(
              'PreviousReviewCard',
              {
                type: 'button',
                class: reviewBits.button,
                'data-hotkey': 'k',
                disabled: function* () {
                  return (yield* activeIndex()) === 0;
                },
                click: movePrevious,
              },
              [
                function* () {
                  return (yield* t()).previous;
                },
                span({ class: reviewBits.key, 'data-testid': 'key' }, 'K'),
              ],
            ),
            button(
              'NextReviewCard',
              {
                type: 'button',
                class: reviewBits.button,
                'data-hotkey': 'j',
                disabled: function* () {
                  return (yield* activeIndex()) >= (yield* cards()).length - 1;
                },
                click: moveNext,
              },
              [
                function* () {
                  return (yield* t()).next;
                },
                span({ class: reviewBits.key, 'data-testid': 'key' }, 'J'),
              ],
            ),
          ],
        ),
      ],
    );
  },
);

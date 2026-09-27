import { button, craftComponent, div, heading, label, p, section, small, span, type Input, type Output } from '@craft-ts/component';
import type { ReviewApiQueue } from '@craft-ts/style-testing/review';
import { craftComputed } from '@craft-ts/core';
import { RetirementReasonPicker } from './retirement-reason-picker';
import type { Messages } from './messages';
import { annotation } from './annotation.style';
import { decision as decisionStyles } from './review-app.style';
import { decisionColumn, notice, reviewBits, reviewCard } from './review-card.style';

type ReviewCard = ReviewApiQueue['cards'][number];
type DecisionVerdict = 'ok' | 'ok-with-note' | 'rejected' | 'known-issue' | 'blocked';
const NOTE_ID = 'review-note';
type Inputs = {
  card: Input<ReviewCard>;
  current: Input<ReviewCard | undefined>;
  t: Input<Messages>;
  degraded: Input<boolean>;
  selection: Input<readonly string[]>;
  noteState: Input<string | null>;
  rejectionReasonMissing: Input<boolean>;
  handleNoteInput: Output<(event: Event) => unknown>;
  previewMentionFromEvent: Output<(event: Event) => unknown>;
  previewMention: Output<(id: number | undefined) => unknown>;
  rememberCaret: Output<() => unknown>;
  pasteReasonText: Output<(event: Event) => unknown>;
  isDeciding: Input<boolean>;
  retire: Output<() => unknown>;
  decide: Output<(verdict: DecisionVerdict) => unknown>;
  hasNote: Input<boolean>;
};

/** Decision controls and the reason field for the selected review card. */
export const ReviewDecisionPanel = craftComponent(
  'ReviewDecisionPanel',
  {},
  (inputs: Inputs) => ({
    ...inputs,
    previousRejectionVisible: craftComputed(
      'previousRejectionVisible',
      function* () {
        const value = yield* inputs.card();
        return (
          value.kind === 'visual' &&
          (Boolean(value.previousDecision) || Boolean(value.rejectionReason))
        );
      },
    ),
    previousRejectionText: craftComputed(
      'previousRejectionText',
      function* () {
        const value = yield* inputs.card();
        const previous = value.previousDecision;
        if (!previous) return value.rejectionReason ?? '';
        const messages = yield* inputs.t();
        return `${messages.previousVerdict(previous.verdict)} · ${previous.by} · ${previous.at}${previous.note ? ` — ${previous.note}` : ''}`;
      },
    ),
    degradedVisible: craftComputed('degradedVisible', function* () {
      return yield* inputs.degraded();
    }),
    rejectionMissingVisible: craftComputed(
      'rejectionMissingVisible',
      function* () {
        return yield* inputs.rejectionReasonMissing();
      },
    ),
    retirementVisible: craftComputed('retirementVisible', function* () {
      return (yield* inputs.current())?.kind === 'removal';
    }),
    acceptWithNoteDisabled: craftComputed(
      'acceptWithNoteDisabled',
      function* () {
        return (yield* inputs.isDeciding()) || !(yield* inputs.hasNote());
      },
    ),
  }),
  ({ card, t, selection, noteState, rejectionReasonMissing, handleNoteInput, previewMentionFromEvent, previewMention, rememberCaret, pasteReasonText, isDeciding, retire, decide, previousRejectionVisible, previousRejectionText, degradedVisible, rejectionMissingVisible, retirementVisible, acceptWithNoteDisabled }) =>
    
div({ class: reviewCard.decision }, [
                      section(
                        {
                          class: decisionColumn.previousRejection,
                          hidden: function* () {
                            return Boolean(yield* previousRejectionVisible()) === false;
                          },
                        },
                        [
                          heading(
                            { class: decisionColumn.previousRejectionTitle },
                            function* () {
                              return (yield* t()).previousDecisionLabel;
                            },
                          ),
                          p(
                            { class: decisionColumn.previousRejectionBody },
                            previousRejectionText,
                          ),
                        ],
                      ),
                      section({ class: decisionColumn.panel }, [
                        p(
                          {
                            class: notice.root,
                            'data-reviewNotice': 'degraded',
                            hidden: function* () {
                              return Boolean(yield* degradedVisible()) === false;
                            },
                          },
                          // Written into the attestation, not just shown: judging a
                          // photograph and judging the document are different claims.
                          function* () {
                            return (yield* t()).degraded;
                          },
                        ),
                        div({ class: decisionColumn.fieldRow }, [
                          label(
                            { class: decisionColumn.label, htmlFor: NOTE_ID },
                            function* () {
                              return (yield* t()).reason;
                            },
                          ),
                          // The count of what is outlined, next to the field that is
                          // about to name it. A reviewer who dragged a box needs to
                          // see what they caught without looking back at the page.
                          span(
                            {
                              class: decisionColumn.selectionTag,
                              'data-testid': 'selection-tag',
                              hidden: function* () {
                                return (yield* selection()).length === 0;
                              },
                            },
                            function* () {
                              return (yield* t()).selected(
                                (yield* selection()).length,
                              );
                            },
                          ),
                        ]),
                        // Uncontrolled on purpose. Re-rendering the field from
                        // the state on every keystroke would rebuild its children
                        // and throw the caret to the start; the state follows the
                        // field instead, and only the insertion writes into it.
                        div('ReviewNote', {
                          id: NOTE_ID,
                          class: annotation.reason,
                          'data-reasonNote': noteState,
                          contenteditable: 'true',
                          role: 'textbox',
                          tabIndex: 0,
                          'aria-multiline': 'true',
                          'aria-label': 'Decision note',
                          'aria-describedby':
                            'review-note-help review-note-error',
                          'aria-invalid': rejectionReasonMissing,
                          'data-placeholder': function* () {
                            return (yield* t()).reasonPlaceholder;
                          },
                          input: handleNoteInput,
                          // Delegated, because the references are built by hand
                          // rather than rendered: a listener per chip would have
                          // to be attached and removed on every edit.
                          mouseover: previewMentionFromEvent,
                          *mouseleave() {
                            yield* previewMention(undefined);
                          },
                          keyup: rememberCaret,
                          mouseup: rememberCaret,
                          blur: rememberCaret,
                          // Pasted markup would arrive with its own styling and,
                          // worse, its own elements — including things that look
                          // like references and point at nothing.
                          paste: pasteReasonText,
                        }),
                        small(
                          {
                            id: 'review-note-help',
                            class: decisionColumn.help,
                          },
                          function* () {
                            return (yield* t()).reasonHelp;
                          },
                        ),
                        small(
                          {
                            id: 'review-note-error',
                            class: decisionColumn.error,
                            role: 'alert',
                            hidden: function* () {
                              return Boolean(yield* rejectionMissingVisible()) === false;
                            },
                          },
                          function* () {
                            return (yield* t()).reasonMissing;
                          },
                        ),
                        section(
                          {
                            class: decisionColumn.retirement,
                            hidden: function* () {
                              return Boolean(yield* retirementVisible()) === false;
                            },
                          },
                          [
                            RetirementReasonPicker({}),
                            button(
                              'RetireObligation',
                              {
                                type: 'button',
                                class: reviewBits.button,
                                'data-reviewAction': 'danger',
                                disabled: isDeciding,
                                click: retire,
                              },
                              function* () {
                                return (yield* t()).retire;
                              },
                            ),
                          ],
                        ),
                        div(
                          {
                            class: decisionColumn.actions,
                            'data-reviewKind': function* () {
                              return (yield* card()).kind;
                            },
                          },
                          [
                            button(
                              'RejectReviewCard',
                              {
                                type: 'button',
                                'data-hint': function* () {
                                  return (yield* t()).hintReject;
                                },
                                class: [
                                  reviewBits.button,
                                  decisionColumn.decisionButton,
                                  annotation.hinted,
                                ],
                                'data-reviewAction': 'danger',
                                'data-hotkey': 'r',
                                disabled: isDeciding,
                                *click() {
                                  yield* decide('rejected');
                                },
                              },
                              [
                                function* () {
                                  return (yield* t()).reject;
                                },
                                span(
                                  {
                                    class: reviewBits.key,
                                    'data-testid': 'key',
                                  },
                                  'R',
                                ),
                              ],
                            ),
                            button(
                              'BlockReviewCard',
                              {
                                type: 'button',
                                class: [
                                  reviewBits.button,
                                  decisionColumn.decisionButton,
                                  annotation.hinted,
                                ],
                                'data-hint': function* () {
                                  return (yield* t()).hintBlock;
                                },
                                disabled: isDeciding,
                                *click() {
                                  yield* decide('blocked');
                                },
                              },
                              function* () {
                                return (yield* t()).block;
                              },
                            ),
                            button(
                              'KnownIssueReviewCard',
                              {
                                type: 'button',
                                class: [
                                  reviewBits.button,
                                  decisionColumn.decisionButton,
                                  annotation.hinted,
                                ],
                                'data-hint': function* () {
                                  return (yield* t()).hintKnownIssue;
                                },
                                disabled: isDeciding,
                                *click() {
                                  yield* decide('known-issue');
                                },
                              },
                              function* () {
                                return (yield* t()).knownIssue;
                              },
                            ),
                            button(
                              'AcceptWithNoteReviewCard',
                              {
                                type: 'button',
                                class: [
                                  reviewBits.button,
                                  decisionColumn.decisionButton,
                                  annotation.hinted,
                                ],
                                'data-hint': function* () {
                                  return (yield* t()).hintAcceptWithNote;
                                },
                                'data-hotkey': 'n',
                                disabled: acceptWithNoteDisabled,
                                *click() {
                                  yield* decide('ok-with-note');
                                },
                              },
                              [
                                function* () {
                                  return (yield* t()).acceptWithNote;
                                },
                                span(
                                  {
                                    class: reviewBits.key,
                                    'data-testid': 'key',
                                  },
                                  'N',
                                ),
                              ],
                            ),
                            button(
                              'AcceptReviewCard',
                              {
                                type: 'button',
                                'data-hint': function* () {
                                  return (yield* t()).hintAccept;
                                },
                                class: [
                                  reviewBits.button,
                                  decisionColumn.decisionButton,
                                  annotation.hinted,
                                  decisionStyles.primary,
                                ],
                                'data-reviewAction': 'primary',
                                'data-hotkey': 'a',
                                disabled: isDeciding,
                                *click() {
                                  yield* decide('ok');
                                },
                              },
                              [
                                function* () {
                                  return (yield* t()).accept;
                                },
                                span(
                                  {
                                    class: [reviewBits.key, decisionStyles.key],
                                    'data-testid': 'key',
                                  },
                                  'A',
                                ),
                              ],
                            ),
                          ],
                        ),
                      ]),
                    ]),
);

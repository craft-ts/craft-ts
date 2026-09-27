import {
  a,
  article,
  craftComponent,
  div,
  forNode,
  heading,
  headingSection,
  header,
  ifNode,
  li,
  main,
  p,
  section,
  small,
  span,
  strong,
  ul,
  safeUrl,
} from '@craft-ts/component';



import { ReviewAppModel } from './review-app.model';




import { reviewTheme } from './review-app.style';

import { TemplateReviewGroupView } from './template-review-group';

import { ReviewQueuePanel } from './review-queue-panel';
import { ReviewActionDialogs } from './review-action-dialogs';
import { ReviewInventoryPanels } from './review-inventory-panels';
import { ReviewDecisionPanel } from './review-decision-panel';
import { ReviewTemplateEvidence } from './review-template-evidence';
import { ReviewLiveEvidence } from './review-live-evidence';


import { scenarioOf } from './card-presentation';
import {
  notice,
  reviewBits,
  reviewCard,
} from './review-card.style';
import { shell } from './review-shell.style';

export const ReviewApp = craftComponent(
  'ReviewApp',
  {},
  function* () {
    return yield* ReviewAppModel();
  },
  ({
    themeAttribute,
    noteState,
    review,
    decision,
    reopen,
    regenerate,
    iterationHandoff,
    applyFolderLayout,
    closeReview,
    reviewCards,
    cards,
    visualAssets,
    visualTests,
    selectedVisualTest,
    selectedVisualAsset,
    visualReviewCard,
    templateObligations,
    templateGroupCount,
    activeTemplateGroupIndex,
    activeTemplateGroup,
    templateAgentAvailable,
    templateGroupVisible,
    selectedTemplateIds,
    templateAgentReview,
    toggleTemplateCard,
    selectAllTemplateCards,
    clearTemplateSelection,
    selectHumanTemplateCards,
    acceptTemplateSelection,
    requestTemplateReject,
    submitTemplateReject,
    delegateTemplateSelection,
    navigateTemplateGroup,
    writeTemplateGroupNote,
    rejectionAttempted,
    cancelTemplateReject,
    folderLayouts,
    bypasses,
    styleAdoption,
    activeIndex,
    sessionHistory,
    zoom,
    note,
    hasNote,
    rejectionReasonMissing,
    reviewFailed,
    inspectFailed,
    decisionFailed,
    reopenFailed,
    regenerationAvailable,
    iterationHandoffAvailable,
    iterationHandoffFailed,
    iterationPreparationNotStarted,
    iterationHandoffReady,
    closeReviewFailed,
    regenerationDialogOpen,
    iterationDialogOpen,
    folderLayoutApplyDialogOpen,
    folderLayoutApplyCopied,
    iterationPromptCopied,
    previousRegenerationDecisions,
    regenerationFailed,
    openRegenerationDialog,
    closeRegenerationDialog,
    confirmRegeneration,
    openIterationDialog,
    closeIterationDialog,
    confirmIterationHandoff,
    closeReviewSession,
    copyIterationPrompt,
    dismissFolderLayoutApply,
    confirmFolderLayoutApply,
    copyFolderLayoutCommand,
    movePrevious,
    moveNext,
    selectCard,
    reopenDecision,
    decide,
    retire,
    devtoolView,
    chooseDevtoolView,
    inspectApplicationCapture,
    decideApplicationCaptures,
    applicationCaptures,
    selectVisualTest,
    openVisualReview,
    current,
    activeCardForPanel,
    activeSubjectLabel,
    activeReasonLabel,
    clusterMembersLabel,
    activeSourceUrl,
    sourceLinkHidden,
    workspaceInert,
    reviewPanelHidden,
    sourceDetail,
    visualEvidence,
    folderLayoutEvidence,
    bypassEvidence,
    evidenceView,
    rememberCaret,
    previewMention,
    changeZoomFromEvent,
    handleNoteInput,
    previewMentionFromEvent,
    pasteReasonText,
    locale,
    fileUrl,
    sourceUrl,
    t,
    fidelitySentence,
    hideChrome,
    member,
    coveredCount,
    canReplay,
    replay,
    showingReplay,
    fellBack,
    chrome,
    selection,
    band,
    degraded,
    overlayLabel,
    overlayHint,
    inspectFrame,
    toggleChrome,
  }) =>
    div({ class: reviewTheme.root, 'data-reviewTheme': themeAttribute }, [
      ifNode(reviewFailed, () =>
        section('ReviewQueueError', { class: notice.root, role: 'alert' }, [
          span({ class: notice.icon, 'aria-hidden': 'true' }, '!'),
          div({ class: notice.copy }, [
            strong({ class: notice.title }, function* () {
              return (yield* t()).queueErrorTitle;
            }),
            p({ class: notice.body }, function* () {
              return (yield* t()).queueFailed;
            }),
          ]),
        ]),
      ),
      ifNode(decisionFailed, () =>
        section('ReviewDecisionError', { class: notice.root, role: 'alert' }, [
          span({ class: notice.icon, 'aria-hidden': 'true' }, '!'),
          div({ class: notice.copy }, [
            strong({ class: notice.title }, function* () {
              return (yield* t()).decisionErrorTitle;
            }),
            p({ class: notice.body }, function* () {
              return (yield* t()).decisionFailed;
            }),
          ]),
        ]),
      ),
      ifNode(reopenFailed, () =>
        section('ReviewReopenError', { class: notice.root, role: 'alert' }, [
          span({ class: notice.icon, 'aria-hidden': 'true' }, '!'),
          div({ class: notice.copy }, [
            strong({ class: notice.title }, function* () {
              return (yield* t()).reopenErrorTitle;
            }),
            p({ class: notice.body }, function* () {
              return (yield* t()).reopenFailed;
            }),
          ]),
        ]),
      ),
      ifNode(regenerationFailed, () =>
        section(
          'ReviewRegenerationError',
          { class: notice.root, role: 'alert' },
          [
            span({ class: notice.icon, 'aria-hidden': 'true' }, '!'),
            div({ class: notice.copy }, [
              strong({ class: notice.title }, function* () {
                return (yield* t()).regenerationErrorTitle;
              }),
              p({ class: notice.body }, function* () {
                return (yield* t()).regenerationFailed;
              }),
            ]),
          ],
        ),
      ),
      ifNode(iterationHandoffFailed, () =>
        section(
          'ReviewIterationHandoffError',
          { class: notice.root, role: 'alert' },
          [
            span({ class: notice.icon, 'aria-hidden': 'true' }, '!'),
            div({ class: notice.copy }, [
              strong({ class: notice.title }, function* () {
                return (yield* t()).iterationHandoffErrorTitle;
              }),
              p({ class: notice.body }, function* () {
                return (yield* t()).iterationHandoffFailed;
              }),
            ]),
          ],
        ),
      ),
      ifNode(closeReviewFailed, () =>
        section('ReviewCloseError', { class: notice.root, role: 'alert' }, [
          span({ class: notice.icon, 'aria-hidden': 'true' }, '!'),
          div({ class: notice.copy }, [
            strong({ class: notice.title }, function* () {
              return (yield* t()).closeReviewErrorTitle;
            }),
            p({ class: notice.body }, function* () {
              return (yield* t()).closeReviewFailed;
            }),
          ]),
        ]),
      ),
      div(
        {
          class: shell.workspace,
          inert: workspaceInert,
        },
        [
          headingSection(ReviewQueuePanel({
                queueValue: review.value,
                regenerationAvailable,
                regenerating: regenerate.isLoading,
                openRegenerationDialog,
                iterationHandoffAvailable,
                handoffBusy: iterationHandoff.isLoading,
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
                reopening: reopen.isLoading,
                reopenDecision,
                movePrevious,
                moveNext,
              })),
            main(
            {
              class: reviewCard.panel,
              hidden: reviewPanelHidden,
            },
            [
            // Keep one review card in the DOM. Rendering the complete queue and
            // hiding all but the active article left stale scenario content in
            // the central panel while a queue click was settling.
            ifNode(templateGroupVisible, () =>
              TemplateReviewGroupView({
                group: activeTemplateGroup,
                selectedIds: selectedTemplateIds,
                note,
                rejectionOpen: rejectionAttempted,
                busy: templateAgentReview.isLoading,
                agentAvailable: templateAgentAvailable,
                agentBusy: templateAgentReview.isLoading,
                agentFailed: function* () {
                  return (yield* templateAgentReview.status()) === 'exception';
                },
                agentResults: function* () {
                  return (
                    (yield* review.value())?.templateAgentResults ??
                    (yield* templateAgentReview.value())?.templateAgentResults ??
                    []
                  );
                },
                groupIndex: activeTemplateGroupIndex,
                groupTotal: templateGroupCount,
                toggleCard: toggleTemplateCard,
                selectAll: selectAllTemplateCards,
                selectHuman: selectHumanTemplateCards,
                clearSelection: clearTemplateSelection,
                requestReject: requestTemplateReject,
                cancelReject: cancelTemplateReject,
                submitReject: submitTemplateReject,
                accept: acceptTemplateSelection,
                delegate: delegateTemplateSelection,
                previousGroup: function* () {
                  yield* navigateTemplateGroup(-1);
                },
                nextGroup: function* () {
                  yield* navigateTemplateGroup(1);
                },
                writeNote: writeTemplateGroupNote,
                locale,
                t,
              }),
            ),
            forNode(
              activeCardForPanel,
              { track: (card) => card.shape },
              (card) =>
                article(
                  {
                    class: reviewCard.card,
                    'data-testid': 'review-card',
                    'data-kind': card.kind,
                  },
                  [
                    header(
                      {
                        class: [reviewCard.heading, reviewCard.fullRow],
                        'data-testid': 'review-heading',
                      },
                      [
                        div([
                          small({ class: reviewBits.eyebrow }, function* () {
                            return (yield* t()).scenario;
                          }),
                          heading(function* () {
                            return scenarioOf(yield* card.subject());
                          }),
                          span(
                            {
                              class: reviewBits.subject,
                              'data-testid': 'subject',
                            },
                            activeSubjectLabel,
                          ),
                          a(
                            'cardSource',
                            {
                              class: reviewBits.sourceLink,
                              'data-navigation': 'external',
                              'data-testid': 'source-link',
                              href: function* () {
                                return safeUrl(yield* activeSourceUrl());
                              },
                              hidden: sourceLinkHidden,
                            },
                            function* () {
                              return (yield* t()).openInIde;
                            },
                          ),
                        ]),
                        span({ class: reviewCard.reason }, activeReasonLabel),
                      ],
                    ),
                    p(
                      {
                        class: [notice.root, reviewCard.fullRow],
                        'data-reviewNotice': 'cluster',
                        hidden: function* () {
                          return (yield* card.cluster()).length <= 1;
                        },
                      },
                      function* () {
                        return (yield* t()).clusterNotice(
                          (yield* card.cluster()).length,
                        );
                      },
                    ),
                    section(
                      {
                        class: [reviewCard.members, reviewCard.fullRow],
                        hidden: function* () {
                          return (yield* card.members()).length <= 1;
                        },
                      },
                      [
                        heading(clusterMembersLabel),
                        ul(
                          { class: reviewBits.list },
                          forNode(
                            card.members,
                            { track: (member) => member.subject },
                            (member) =>
                              li(function* () {
                                return scenarioOf((yield* member()).subject);
                              }),
                          ),
                        ),
                      ],
                    ),
                    div({ class: reviewCard.evidence }, [
                      headingSection(ReviewTemplateEvidence({ card, sourceDetail: sourceDetail.value, fileUrl, t, locale })),
                      headingSection(ReviewLiveEvidence({
                        card, current, t, bypassEvidence, folderLayoutEvidence, visualEvidence, showingReplay, replay, canReplay, inspectFailed, fellBack, fidelitySentence, band, overlayHint, overlayLabel, chrome, hideChrome, toggleChrome, zoom, changeZoomFromEvent, member, coveredCount, inspectFrame, chooseReplay: evidenceView.chooseReplay, chooseImage: evidenceView.chooseImage,
                      })),
                    ]),
                    headingSection(ReviewDecisionPanel({
                        card,
                        current,
                        t,
                        degraded,
                        selection,
                        noteState,
                        rejectionReasonMissing,
                        handleNoteInput,
                        previewMentionFromEvent,
                        previewMention,
                        rememberCaret,
                        pasteReasonText,
                        isDeciding: decision.isLoading,
                        retire,
                        decide,
                        hasNote,
                      })),
                  ],
                ),
            ),
          ],
        ),
          headingSection(ReviewInventoryPanels({
                devtoolView,
                t,
                applicationCaptures,
                decideApplicationCaptures,
                inspectApplicationCapture,
                bypasses,
                styleAdoption,
                visualAssets,
                visualTests,
                selectedVisualTest,
                selectVisualTest,
                selectedVisualAsset,
                sourceUrl,
                visualReviewCard,
                openVisualReview,
                templateObligations,
                queueValue: review.value,
                fileUrl,
                locale,
              })),
        ],
      ),
      headingSection(ReviewActionDialogs({
                regenerationDialogOpen,
                previousRegenerationDecisions,
                queueValue: review.value,
                t,
                regenerating: regenerate.isLoading,
                closeRegenerationDialog,
                confirmRegeneration,
                folderLayoutApplyDialogOpen,
                applyStatus: applyFolderLayout.status,
                folderLayoutApplyCopied,
                applyingLayout: applyFolderLayout.isLoading,
                dismissFolderLayoutApply,
                copyFolderLayoutCommand,
                confirmFolderLayoutApply,
                iterationDialogOpen,
                iterationPreparationNotStarted,
                closeIterationDialog,
                confirmIterationHandoff,
                handoffBusy: iterationHandoff.isLoading,
                iterationHandoffReady,
                handoffValue: iterationHandoff.value,
                copyIterationPrompt,
                closing: closeReview.isLoading,
                closeReviewSession,
                iterationPromptCopied,
              })),
    ]),
);

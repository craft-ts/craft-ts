import {
  button,
  craftComponent,
  details,
  div,
  heading,
  ifNode,
  li,
  p,
  pre,
  section,
  small,
  summary,
  textarea,
  ul,
  type Input,
  type Output,
} from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
import type {
  ReviewApiQueue,
  ReviewIterationHandoffResponse,
} from '@craft-ts/style-testing/review';
import type { Messages } from './messages';
import { dialog, reviewBits } from './review-card.style';

type Inputs = {
  regenerationDialogOpen: Input<boolean>;
  previousRegenerationDecisions: Input<number>;
  queueValue: Input<ReviewApiQueue | undefined>;
  t: Input<Messages>;
  regenerating: Input<boolean>;
  closeRegenerationDialog: Output<() => unknown>;
  confirmRegeneration: Output<() => unknown>;
  folderLayoutApplyDialogOpen: Input<boolean>;
  applyStatus: Input<string>;
  folderLayoutApplyCopied: Input<boolean>;
  applyingLayout: Input<boolean>;
  dismissFolderLayoutApply: Output<() => unknown>;
  copyFolderLayoutCommand: Output<() => unknown>;
  confirmFolderLayoutApply: Output<() => unknown>;
  iterationDialogOpen: Input<boolean>;
  iterationPreparationNotStarted: Input<boolean>;
  closeIterationDialog: Output<() => unknown>;
  confirmIterationHandoff: Output<() => unknown>;
  handoffBusy: Input<boolean>;
  iterationHandoffReady: Input<boolean>;
  handoffValue: Input<ReviewIterationHandoffResponse | undefined>;
  copyIterationPrompt: Output<() => unknown>;
  closing: Input<boolean>;
  closeReviewSession: Output<() => unknown>;
  iterationPromptCopied: Input<boolean>;
};

/** Dialogs for regeneration, applying folder layouts, and handoff. */
export const ReviewActionDialogs = craftComponent(
  'ReviewActionDialogs',
  {},
  function* (inputs: Inputs) {
    const {
      queueValue,
      t,
      regenerating,
      closeRegenerationDialog,
      confirmRegeneration,
      applyingLayout,
      dismissFolderLayoutApply,
      copyFolderLayoutCommand,
      confirmFolderLayoutApply,
      closeIterationDialog,
      confirmIterationHandoff,
      handoffBusy,
      handoffValue,
      copyIterationPrompt,
      closing,
      closeReviewSession,
    } = inputs;
    const isRegenerationOpen = yield* craftComputed(
      'isRegenerationOpen',
      function* () {
        return yield* inputs.regenerationDialogOpen();
      },
    );
    const isFolderApplyOpen = yield* craftComputed('isFolderApplyOpen', function* () {
      return yield* inputs.folderLayoutApplyDialogOpen();
    });
    const isIterationOpen = yield* craftComputed('isIterationOpen', function* () {
      return yield* inputs.iterationDialogOpen();
    });
    const isIterationSetup = yield* craftComputed('isIterationSetup', function* () {
      return yield* inputs.iterationPreparationNotStarted();
    });
    const isHandoffReady = yield* craftComputed('isHandoffReady', function* () {
      return yield* inputs.iterationHandoffReady();
    });
    const isHandoffBusy = yield* craftComputed('isHandoffBusy', function* () {
      return yield* inputs.handoffBusy();
    });
    const isRegenerating = yield* craftComputed('isRegenerating', function* () {
      return yield* inputs.regenerating();
    });
    const isApplyCopied = yield* craftComputed('isApplyCopied', function* () {
      return yield* inputs.folderLayoutApplyCopied();
    });
    const isHandoffCopied = yield* craftComputed('isHandoffCopied', function* () {
      return yield* inputs.iterationPromptCopied();
    });
    const isApplyError = yield* craftComputed('isApplyError', function* () {
      return (yield* inputs.applyStatus()) === 'exception';
    });
    const regenerationHistoryText = yield* craftComputed(
      'regenerationHistoryText',
      function* () {
        const count = yield* inputs.previousRegenerationDecisions();
        const messages = yield* inputs.t();
        return count > 0
          ? messages.regenerationPreservesHistory(count)
          : messages.regenerationFirstGeneration;
      },
    );
    const folderApplyDescription = yield* craftComputed(
      'folderApplyDescription',
      function* () {
        const apply = (yield* inputs.queueValue())?.folderLayoutApply;
        if (!apply) return '';
        return (yield* inputs.t()).folderLayoutApplyDescription(
          apply.moves,
          apply.deletions,
          apply.manualReviews,
        );
      },
    );
    const folderApplyLabel = yield* craftComputed('folderApplyLabel', function* () {
      const messages = yield* inputs.t();
      return (yield* inputs.applyingLayout())
        ? messages.folderLayoutApplyRunning
        : messages.folderLayoutApplyRun;
    });
    const rejectedIterationDescription = yield* craftComputed(
      'rejectedIterationDescription',
      function* () {
        const rejected =
          (yield* inputs.queueValue())?.cards.filter(
            (card) => card.previousDecision?.verdict === 'rejected',
          ).length ?? 0;
        return (yield* inputs.t()).iterationModalDescription(rejected);
      },
    );
    const handoffFilesDescription = yield* craftComputed(
      'handoffFilesDescription',
      function* () {
        const value = yield* inputs.handoffValue();
        if (!value) return '';
        return (yield* inputs.t()).iterationHandoffFiles(
          value.rejectedCards,
          value.feedbackPath,
          value.promptPath,
        );
      },
    );
    const closeReviewLabel = yield* craftComputed('closeReviewLabel', function* () {
      const messages = yield* inputs.t();
      return (yield* inputs.closing())
        ? messages.iterationModalClosing
        : messages.closeReview;
    });
    return [
      ifNode(isRegenerationOpen, () =>
        div({ class: dialog.backdrop }, [
          section(
            'RegenerationDialog',
            {
              class: [dialog.root, dialog.narrow],
              role: 'dialog',
              'aria-modal': 'true',
              'aria-labelledby': 'regeneration-dialog-title',
              'aria-describedby': 'regeneration-dialog-description',
            },
            [
              small({ class: reviewBits.eyebrow }, function* () {
                return (yield* t()).regenerationEyebrow;
              }),
              heading(
                { class: dialog.title, id: 'regeneration-dialog-title' },
                function* () {
                  return (yield* t()).regenerationTitle;
                },
              ),
              p(
                { class: dialog.body, id: 'regeneration-dialog-description' },
                function* () {
                  const queue = yield* queueValue();
                  return (yield* t()).regenerationScope(
                    queue?.visualTests.length ?? 0,
                    queue?.templateObligations.length ?? 0,
                  );
                },
              ),
              ul({ class: dialog.consequences }, [
                li(function* () {
                  return (yield* t()).regenerationReplacesArtifacts;
                }),
                li(regenerationHistoryText),
                li(function* () {
                  return (yield* t()).regenerationRebuildsQueue;
                }),
                li(function* () {
                  return (yield* t()).regenerationDropsDraft;
                }),
              ]),
              div({ class: dialog.actions }, [
                button(
                  'CancelRegeneration',
                  {
                    type: 'button',
                    class: dialog.button,
                    'data-hotkey': 'escape',
                    autofocus: true,
                    click: closeRegenerationDialog,
                  },
                  function* () {
                    return (yield* t()).cancelRegeneration;
                  },
                ),
                button(
                  'ConfirmRegeneration',
                  {
                    type: 'button',
                    class: dialog.button,
                    'data-reviewAction': 'primary',
                    disabled: regenerating,
                    click: confirmRegeneration,
                  },
                  function* () {
                    return (yield* t()).confirmRegeneration;
                  },
                ),
              ]),
            ],
          ),
        ]),
      ),
      ifNode(isFolderApplyOpen, () =>
        div({ class: dialog.backdrop }, [
          section(
            'FolderLayoutApplyDialog',
            {
              class: dialog.root,
              role: 'dialog',
              'aria-modal': 'true',
              'aria-labelledby': 'folder-layout-apply-title',
              'aria-describedby': 'folder-layout-apply-description',
            },
            [
              small({ class: reviewBits.eyebrow }, 'Git'),
              heading(
                { class: dialog.title, id: 'folder-layout-apply-title' },
                function* () {
                  return (yield* t()).folderLayoutApplyTitle;
                },
              ),
              p(
                { class: dialog.body, id: 'folder-layout-apply-description' },
                folderApplyDescription,
              ),
              p({ class: dialog.staged }, function* () {
                return (yield* t()).folderLayoutApplyStaged;
              }),
              small({ class: dialog.commandLabel }, function* () {
                return (yield* t()).folderLayoutApplyCommand;
              }),
              pre({ class: dialog.command }, function* () {
                return (yield* queueValue())?.folderLayoutApply?.command ?? '';
              }),
              details({ class: dialog.disclosure }, [
                summary({ class: dialog.disclosureSummary }, function* () {
                  return (yield* t()).folderLayoutApplyCommands;
                }),
                pre({ class: dialog.command }, function* () {
                  return (
                    (yield* queueValue())?.folderLayoutApply?.gitCommands ?? ''
                  );
                }),
              ]),
              ifNode(isApplyError, () =>
                p(
                  {
                    class: dialog.error,
                    role: 'alert',
                  },
                  function* () {
                    return (yield* t()).folderLayoutApplyFailed;
                  },
                ),
              ),
              ifNode(isApplyCopied, () =>
                p(
                  { class: dialog.status, 'aria-live': 'polite' },
                  function* () {
                    return (yield* t()).folderLayoutApplyCopied;
                  },
                ),
              ),
              div({ class: dialog.actions }, [
                button(
                  'CancelFolderLayoutApply',
                  {
                    type: 'button',
                    class: dialog.button,
                    'data-hotkey': 'escape',
                    autofocus: true,
                    click: dismissFolderLayoutApply,
                  },
                  function* () {
                    return (yield* t()).folderLayoutApplyCancel;
                  },
                ),
                button(
                  'CopyFolderLayoutGitCommands',
                  {
                    type: 'button',
                    class: dialog.copy,
                    click: copyFolderLayoutCommand,
                  },
                  function* () {
                    return (yield* t()).folderLayoutApplyCopy;
                  },
                ),
                button(
                  'RunFolderLayoutGitCommands',
                  {
                    type: 'button',
                    class: dialog.button,
                    'data-reviewAction': 'primary',
                    disabled: applyingLayout,
                    click: confirmFolderLayoutApply,
                  },
                  folderApplyLabel,
                ),
              ]),
            ],
          ),
        ]),
      ),
      ifNode(isIterationOpen, () =>
        div({ class: dialog.backdrop }, [
          section(
            {
              class: dialog.root,
              role: 'dialog',
              'aria-modal': 'true',
              'aria-labelledby': 'iteration-dialog-title',
              'aria-describedby': 'iteration-dialog-description',
            },
            [
              small({ class: reviewBits.eyebrow }, function* () {
                return (yield* t()).iterationModalEyebrow;
              }),
              ifNode(isIterationSetup, () => [
                heading(
                  { class: dialog.title, id: 'iteration-dialog-title' },
                  function* () {
                    return (yield* t()).iterationModalTitle;
                  },
                ),
                p(
                  { class: dialog.body, id: 'iteration-dialog-description' },
                  rejectedIterationDescription,
                ),
                ul({ class: dialog.consequences }, [
                  li(function* () {
                    return (yield* t()).iterationModalWritesFiles;
                  }),
                  li(function* () {
                    return (yield* t()).iterationModalStaysOpen;
                  }),
                  li(function* () {
                    return (yield* t()).iterationModalStopsServer;
                  }),
                ]),
                div({ class: dialog.actions }, [
                  button(
                    'CancelIteration',
                    {
                      type: 'button',
                      class: dialog.button,
                      'data-hotkey': 'escape',
                      autofocus: true,
                      click: closeIterationDialog,
                    },
                    function* () {
                      return (yield* t()).cancelRegeneration;
                    },
                  ),
                  button(
                    'ConfirmIterationHandoff',
                    {
                      type: 'button',
                      class: dialog.button,
                      'data-reviewAction': 'primary',
                      disabled: handoffBusy,
                      click: confirmIterationHandoff,
                    },
                    function* () {
                      return (yield* t()).iterationConfirm;
                    },
                  ),
                ]),
              ]),
              ifNode(isHandoffBusy, () =>
                p(
                  { class: dialog.status, 'aria-live': 'polite' },
                  function* () {
                    return (yield* t()).iterationModalPreparing;
                  },
                ),
              ),
              ifNode(isHandoffReady, () => [
                heading(
                  { class: dialog.title, id: 'iteration-dialog-title' },
                  function* () {
                    return (yield* t()).iterationHandoffReady;
                  },
                ),
                p(
                  { class: dialog.body, id: 'iteration-dialog-description' },
                  handoffFilesDescription,
                ),
                p({ class: dialog.status }, function* () {
                  return (yield* t()).iterationModalReady;
                }),
                textarea('IterationPrompt', {
                  class: dialog.prompt,
                  id: 'iteration-prompt',
                  readOnly: true,
                  value: function* () {
                    return (yield* handoffValue())?.prompt ?? '';
                  },
                  'aria-label': function* () {
                    return (yield* t()).iterationPrompt;
                  },
                }),
                div({ class: dialog.actions }, [
                  button(
                    'CopyIterationPrompt',
                    {
                      type: 'button',
                      class: dialog.copy,
                      click: copyIterationPrompt,
                    },
                    function* () {
                      return (yield* t()).copyIterationPrompt;
                    },
                  ),
                  button(
                    'CloseReview',
                    {
                      type: 'button',
                      class: dialog.button,
                      'data-reviewAction': 'primary',
                      disabled: closing,
                      click: closeReviewSession,
                    },
                    closeReviewLabel,
                  ),
                ]),
                ifNode(isHandoffCopied, () =>
                  p(
                    { class: dialog.status, 'aria-live': 'polite' },
                    function* () {
                      return (yield* t()).iterationPromptCopied;
                    },
                  ),
                ),
              ]),
            ],
          ),
        ]),
      ),
    ];
  },
);

// Generated. Do not edit.
export const architectureCatalog = {
  "version": 1,
  "graphHash": "6bf2bac3163367dc",
  "routes": [],
  "services": [
    "CraftFieldCheckboxControl",
    "CraftFieldValueControl",
    "CraftLogServerUrl",
    "GlobalPersisterHandlerService",
    "MiddlewareExecutionScope",
    "ServerFunctionTransport",
    "StoragePersister",
    "StorageService",
    "aiChatBridge",
    "aiContextMenuDismissal",
    "aiSendContextChatState",
    "aiSendDialogState",
    "craftRouterOutletState",
    "docCopyView",
    "docMenuView",
    "docModeView",
    "docSeasonView",
    "docTabsView",
    "docToastQueue",
    "replayRoute",
    "replayState",
    "sessionArchive",
    "thumbnailArchive"
  ],
  "components": [
    "AiChatLauncherBridge",
    "AiContextMenu",
    "AiSendContextChat",
    "AiSendContextLauncher",
    "AiSendDialog",
    "AnonymousComponent@setupCraftDirectiveTemplateTestImpl/synthetic",
    "CraftRouterOutlet",
    "DebugSessionDashboard",
    "DocBadge",
    "DocButton",
    "DocCallout",
    "DocCode",
    "DocCodeGroup",
    "DocContours",
    "DocCopyButton",
    "DocDialog",
    "DocField",
    "DocForest",
    "DocIcon",
    "DocIconButton",
    "DocLinkButton",
    "DocLogo",
    "DocMenu",
    "DocModeToggle",
    "DocPlate",
    "DocSeasonPicker",
    "DocSwitch",
    "DocTabs",
    "DocToast",
    "DocToastRegion",
    "DocTooltip",
    "ImportDialog",
    "ReplayDetails",
    "ReplayHead",
    "ReplayJournal",
    "ReplayNotices",
    "ReplayPage",
    "ReplayPlaybar",
    "ReplaySidePanel",
    "ReplayStage",
    "ReplayThumbnailMarks",
    "ReplayThumbnailsStatus",
    "ReplayTimeline",
    "SessionsPage",
    "craftPending"
  ],
  "primitives": [
    "activeReplayEventIdState",
    "activeReplayParticipantId",
    "archived",
    "ariaDisabled",
    "ariaValueMax",
    "ariaValueNow",
    "ariaValueText",
    "assistantDisabled",
    "autoSkipDifferences",
    "available",
    "busy",
    "canForceRecoveryState",
    "canSkipDifferenceState",
    "canStep",
    "captureError",
    "captureInProgress",
    "chat",
    "choice",
    "clearAllCache",
    "closeRemovedSession",
    "closed",
    "connected",
    "continuationsState",
    "copied",
    "currentEntryIndex",
    "debugDisabled",
    "deleteSession",
    "diagnosticLabel",
    "diagnosticReplay",
    "difference",
    "differenceCount",
    "differenceHistoryCount",
    "differenceHistoryOpen",
    "differenceMessage",
    "dismissedWarnings",
    "emptyHidden",
    "environmentWarningHidden",
    "environmentWarningState",
    "error",
    "errorCountState",
    "errorSummary",
    "eventTimelinePage",
    "eventTimelinePageCountState",
    "events",
    "failArchivedSession",
    "fullscreenDisabled",
    "hasDifferenceState",
    "hidden",
    "importOpen",
    "instruction",
    "journalEventsState",
    "journalSummaryText",
    "loadError",
    "loadErrorHidden",
    "loadErrorText",
    "marks",
    "mode",
    "nextAction",
    "nextActionDelayMs",
    "nextActionTimingHidden",
    "nextActionTimingText",
    "nextDisabled",
    "notesHidden",
    "open",
    "openArchivedSession",
    "openEntryIndex",
    "orchestrationCommands",
    "orchestrationIssues",
    "orchestrationState",
    "orchestrationSummary",
    "page",
    "pageHidden",
    "pageIsHidden",
    "pageLabel",
    "pagerHidden",
    "panelOffset",
    "partialMessage",
    "partialReplay",
    "participantFilterHidden",
    "pauseDisabled",
    "pendingDeleteSessionId",
    "pendingWarningsState",
    "persistAutoSkipPreference",
    "prepareThumbnails",
    "previousDisabled",
    "problemEventsState",
    "problemMessage",
    "promptOptions",
    "reachable",
    "recordingLabel",
    "renderedMarks",
    "replayActionOffsetsMsState",
    "replayDifferences",
    "replayIndex",
    "replayJson",
    "replayPlanState",
    "replaySkeletonVisible",
    "replayState",
    "replayStatus",
    "replayViewport",
    "replayViewportScale",
    "replayWarnings",
    "replayableEventsState",
    "replayableParticipantsState",
    "restartDisabled",
    "retryHidden",
    "savedSessions",
    "seekOverlayHidden",
    "seekProgress",
    "seekTarget",
    "selected",
    "selectedParticipantId",
    "sendContextToAi",
    "session",
    "sessionParticipants",
    "sessionStartUrl",
    "sessionText",
    "sessionTitleText",
    "sessions",
    "sessionsSummary",
    "setBusy",
    "setCaptureError",
    "setCaptureInProgress",
    "setCopied",
    "setError",
    "setPanelOffset",
    "setReplayStatus",
    "setStatus",
    "showAllEvents",
    "showPreparedThumbnails",
    "showThumbnailManifest",
    "sidePanelOpen",
    "skeletonHidden",
    "startMode",
    "startUrl",
    "status",
    "stopDisabled",
    "summary",
    "summaryHidden",
    "targetUrl",
    "thumbnailManifest",
    "timeProgress",
    "timeRemaining",
    "timelineProgress",
    "toastMessage",
    "toasts",
    "toleranceMessage",
    "viewportLabel",
    "visibleEventPageState",
    "visibleEventsState",
    "visibleWarnings",
    "warningCount",
    "warningHistory",
    "warningHistoryCount",
    "warningHistoryOpen"
  ],
  "sources": [
    "refreshRequested$ (source$)",
    "set$ (source$)",
    "signalSource (signalSource)",
    "source$ (source$)",
    "update$ (source$)"
  ],
  "serverFunctionFamilies": [],
  "httpEndpoints": [
    {
      "method": "DELETE",
      "url": "*/sessions/*"
    },
    {
      "method": "GET",
      "url": "*/sessions"
    },
    {
      "method": "GET",
      "url": "*/sessions/*"
    },
    {
      "method": "GET",
      "url": "*/sessions/*/thumbnails"
    },
    {
      "method": "POST",
      "url": "*/sessions/*/thumbnails*"
    },
    {
      "method": "POST",
      "url": "<unresolved:ai-send-context-chat.ts:271>"
    }
  ],
  "uniques": [],
  "providers": [
    "aiContextMenuDismissal",
    "aiSendContextChatState",
    "aiSendDialogState",
    "craftRouterOutletState",
    "docCopyView",
    "docMenuView",
    "docModeView",
    "docSeasonView",
    "docTabsView"
  ],
  "routeProviders": {},
  "componentProviders": {
    "DebugSessionDashboard": [
      "docModeView",
      "docSeasonView"
    ],
    "AiContextMenu": [
      "aiContextMenuDismissal"
    ],
    "AiSendContextChat": [
      "aiSendContextChatState"
    ],
    "AiSendDialog": [
      "aiSendDialogState"
    ],
    "CraftRouterOutlet": [
      "craftRouterOutletState"
    ],
    "DocSeasonPicker": [
      "docMenuView"
    ],
    "DocCopyButton": [
      "docCopyView"
    ],
    "DocMenu": [
      "docMenuView"
    ],
    "DocTabs": [
      "docTabsView"
    ]
  },
  "providedOn": {
    "docModeView": [
      {
        "kind": "component",
        "name": "DebugSessionDashboard",
        "file": "apps/debug-session-dashboard/src/dashboard.ts"
      }
    ],
    "docSeasonView": [
      {
        "kind": "component",
        "name": "DebugSessionDashboard",
        "file": "apps/debug-session-dashboard/src/dashboard.ts"
      }
    ],
    "aiContextMenuDismissal": [
      {
        "kind": "component",
        "name": "AiContextMenu",
        "file": "libs/component/src/lib/ai/ai-context-menu.ts"
      }
    ],
    "aiSendContextChatState": [
      {
        "kind": "component",
        "name": "AiSendContextChat",
        "file": "libs/component/src/lib/ai/ai-send-context-chat.ts"
      }
    ],
    "aiSendDialogState": [
      {
        "kind": "component",
        "name": "AiSendDialog",
        "file": "libs/component/src/lib/ai/ai-send-dialog.ts"
      }
    ],
    "craftRouterOutletState": [
      {
        "kind": "component",
        "name": "CraftRouterOutlet",
        "file": "libs/component/src/lib/craft-router-outlet.ts"
      }
    ],
    "docMenuView": [
      {
        "kind": "component",
        "name": "DocSeasonPicker",
        "file": "libs/ui/src/appearance/season-picker.ts"
      },
      {
        "kind": "component",
        "name": "DocMenu",
        "file": "libs/ui/src/menu/menu.ts"
      }
    ],
    "docCopyView": [
      {
        "kind": "component",
        "name": "DocCopyButton",
        "file": "libs/ui/src/code/copy-button.ts"
      }
    ],
    "docTabsView": [
      {
        "kind": "component",
        "name": "DocTabs",
        "file": "libs/ui/src/tabs/tabs.ts"
      }
    ]
  },
  "collisions": {
    "services": {
      "MiddlewareExecutionScope": [
        "libs/core/src/lib/server-function-middleware.ts",
        "libs/core/src/lib/server-function-middleware.ts"
      ]
    },
    "components": {},
    "routes": {}
  },
  "browserBoundaryServices": [],
  "scopes": {
    "aiChatBridge": "global",
    "replayRoute": "global",
    "replayState": "global",
    "sessionArchive": "global",
    "thumbnailArchive": "global",
    "aiContextMenuDismissal": "toProvide",
    "aiSendContextChatState": "toProvide",
    "aiSendDialogState": "toProvide",
    "craftRouterOutletState": "toProvide",
    "StorageService": "abstract",
    "CraftLogServerUrl": "abstract",
    "CraftFieldCheckboxControl": "abstract",
    "CraftFieldValueControl": "abstract",
    "GlobalPersisterHandlerService": "toProvide",
    "ServerFunctionTransport": "abstract",
    "StoragePersister": "abstract",
    "docModeView": "toProvide",
    "docSeasonView": "toProvide",
    "docCopyView": "toProvide",
    "docMenuView": "toProvide",
    "docTabsView": "toProvide",
    "docToastQueue": "toProvide"
  }
} as const;
export type ArchitectureCatalog = typeof architectureCatalog;

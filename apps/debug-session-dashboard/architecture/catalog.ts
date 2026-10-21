// Generated. Do not edit.
export const architectureCatalog = {
  "version": 1,
  "graphHash": "00475d4e228c08d8",
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
    "archived",
    "busy",
    "captureError",
    "captureInProgress",
    "choice",
    "clearAllCache",
    "closeRemovedSession",
    "copied",
    "deleteSession",
    "error",
    "failArchivedSession",
    "instruction",
    "mode",
    "open",
    "openArchivedSession",
    "panelOffset",
    "prepareThumbnails",
    "promptOptions",
    "reachable",
    "replayJson",
    "replayStatus",
    "savedSessions",
    "selected",
    "sendContextToAi",
    "sessions",
    "setBusy",
    "setCaptureError",
    "setCaptureInProgress",
    "setCopied",
    "setError",
    "setPanelOffset",
    "setReplayStatus",
    "setStatus",
    "showPreparedThumbnails",
    "showThumbnailManifest",
    "status",
    "thumbnailManifest",
    "toasts"
  ],
  "sources": [
    "refreshRequested$ (source$)",
    "signalSource (signalSource)",
    "source$ (source$)"
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
    "replayRoute": "global",
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

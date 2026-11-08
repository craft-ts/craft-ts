// Generated. Do not edit.
export const architectureCatalog = {
  "version": 1,
  "graphHash": "35050ee667e6a7a3",
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
    "TaskRepositoryService",
    "aiContextMenuDismissal",
    "aiSendContextChatState",
    "aiSendDialogState",
    "craftRouterOutletState",
    "quickstartTaskPageView"
  ],
  "components": [
    "AiContextMenu",
    "AiSendContextChat",
    "AiSendContextLauncher",
    "AiSendDialog",
    "AnonymousComponent@setupCraftDirectiveTemplateTestImpl/synthetic",
    "CraftRouterOutlet",
    "QuickstartTaskPage",
    "craftPending"
  ],
  "primitives": [
    "busy",
    "captureError",
    "captureInProgress",
    "clearAllCache",
    "error",
    "exception",
    "exceptionTag",
    "hasTask",
    "hasTaskException",
    "panelOffset",
    "sendContextInstruction",
    "sendContextPromptOptions",
    "sendContextToAi",
    "sendDialogCopied",
    "sendDialogInstruction",
    "sendDialogPromptOptions",
    "setBusy",
    "setCaptureError",
    "setCaptureInProgress",
    "setCopied",
    "setError",
    "setPanelOffset",
    "setStatus",
    "setTimelineExpanded",
    "status",
    "taskQuery",
    "taskStatus",
    "timelineExpanded",
    "title"
  ],
  "sources": [
    "signalSource (signalSource)",
    "source$ (source$)"
  ],
  "serverFunctionFamilies": [],
  "httpEndpoints": [
    {
      "method": "POST",
      "url": "<unresolved:ai-send-context-chat.ts:255>"
    }
  ],
  "uniques": [],
  "providers": [
    "aiContextMenuDismissal",
    "aiSendContextChatState",
    "aiSendDialogState",
    "craftRouterOutletState",
    "quickstartTaskPageView"
  ],
  "routeProviders": {},
  "componentProviders": {
    "QuickstartTaskPage": [
      "quickstartTaskPageView"
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
    ]
  },
  "providedOn": {
    "quickstartTaskPageView": [
      {
        "kind": "component",
        "name": "QuickstartTaskPage",
        "file": "apps/quickstart-effect/src/app/task-page.ts"
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
    ]
  },
  "collisions": {
    "services": {
      "MiddlewareExecutionScope": [
        "libs/core/src/lib/server-function-middleware.ts",
        "libs/core/src/lib/server-function-middleware.ts"
      ],
      "TaskRepositoryService": [
        "apps/quickstart-effect/src/app/task-domain.ts",
        "apps/quickstart-effect/src/app/task-domain.ts"
      ]
    },
    "components": {},
    "routes": {}
  },
  "browserBoundaryServices": [],
  "scopes": {
    "quickstartTaskPageView": "toProvide",
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
    "StoragePersister": "abstract"
  }
} as const;
export type ArchitectureCatalog = typeof architectureCatalog;

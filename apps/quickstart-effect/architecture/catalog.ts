// Generated. Do not edit.
export const architectureCatalog = {
  "version": 1,
  "graphHash": "6749760e2d8a789d",
  "routes": [],
  "services": [
    "BrowserCryptoService",
    "BrowserDocumentService",
    "BrowserHistoryService",
    "BrowserLocationService",
    "BrowserNavigatorService",
    "BrowserPerformanceService",
    "BrowserWindowService",
    "ConsoleService",
    "CookiesService",
    "CraftLogServerUrl",
    "GlobalPersisterHandlerService",
    "HostName",
    "LocalStoragePersister",
    "LocalStorageService",
    "MiddlewareExecutionScope",
    "ServerFunctionTransport",
    "SessionStoragePersister",
    "SessionStorageService",
    "StoragePersister",
    "StorageService",
    "TaskRepositoryService",
    "api"
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
    "copied",
    "error",
    "exception",
    "exceptionTag",
    "hasTask",
    "hasTaskException",
    "instruction",
    "panelOffset",
    "promptOptions",
    "sendContextToAi",
    "setBusy",
    "setCaptureError",
    "setCaptureInProgress",
    "setCopied",
    "setError",
    "setPanelOffset",
    "setStatus",
    "status",
    "taskQuery",
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
      "url": "<unresolved:ai-send-context-chat.ts:520>"
    }
  ],
  "uniques": [],
  "providers": [],
  "routeProviders": {},
  "componentProviders": {},
  "providedOn": {},
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
  "browserBoundaryServices": [
    "BrowserCryptoService",
    "BrowserDocumentService",
    "BrowserHistoryService",
    "BrowserLocationService",
    "BrowserNavigatorService",
    "BrowserPerformanceService",
    "BrowserWindowService",
    "ConsoleService",
    "CookiesService",
    "LocalStorageService",
    "SessionStorageService"
  ],
  "scopes": {}
} as const;
export type ArchitectureCatalog = typeof architectureCatalog;

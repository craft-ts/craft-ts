// Generated. Do not edit.
export const architectureCatalog = {
  "version": 1,
  "graphHash": "4b5dda1ddab68255",
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
    "AiSendDialog",
    "AnonymousComponent@setupCraftDirectiveTemplateTestImpl/synthetic",
    "CraftRouterOutlet",
    "QuickstartTaskPage",
    "craftPending"
  ],
  "primitives": [
    "captureError",
    "captureInProgress",
    "copied",
    "exception",
    "exceptionTag",
    "hasTask",
    "hasTaskException",
    "instruction",
    "promptOptions",
    "setCaptureError",
    "setCaptureInProgress",
    "setCopied",
    "taskQuery",
    "title"
  ],
  "sources": [
    "signalSource (signalSource)",
    "source$ (source$)"
  ],
  "serverFunctionFamilies": [],
  "httpEndpoints": [],
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

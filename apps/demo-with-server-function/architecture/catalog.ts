// Generated. Do not edit.
export const architectureCatalog = {
  "version": 1,
  "graphHash": "c2d02d88b8253708",
  "routes": [
    "",
    "access-denied",
    "authenticated-list",
    "effect-middleware",
    "portable",
    "session-required",
    "session-revoked",
    "simple-list",
    "users-not-found"
  ],
  "services": [
    "BrowserCryptoService",
    "BrowserDocumentService",
    "BrowserHistoryService",
    "BrowserLocationService",
    "BrowserNavigatorService",
    "BrowserPerformanceService",
    "BrowserWindowService",
    "ClaimedUserId",
    "ClientSession",
    "ConsoleService",
    "CookiesService",
    "CraftLogServerUrl",
    "CurrentSession",
    "CurrentUser",
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
    "UserRepository",
    "api"
  ],
  "components": [
    "AiContextMenu",
    "AiSendContextChat",
    "AiSendContextLauncher",
    "AiSendDialog",
    "AnonymousComponent@setupCraftDirectiveTemplateTestImpl/synthetic",
    "AnonymousComponent@statusPage",
    "AppShell",
    "CraftRouterOutlet",
    "EffectServerMiddlewareDemo",
    "PortableServerFunctionDemo",
    "PublicProductsDemo",
    "ServerFunctionDemo",
    "SimpleListDemo",
    "craftPending"
  ],
  "primitives": [
    "busy",
    "captureError",
    "captureInProgress",
    "copied",
    "craftComputed",
    "currentUser",
    "currentUserQuery",
    "effectMiddlewareFilter",
    "effectMiddlewareHasServerError",
    "effectMiddlewareHasUsers",
    "effectMiddlewareIsEmpty",
    "effectMiddlewareServerError",
    "effectMiddlewareServerErrorText",
    "effectMiddlewareUsersQuery",
    "error",
    "hasProducts",
    "hasUsers",
    "instruction",
    "isAdmin",
    "isEmpty",
    "notFound",
    "notFoundMessage",
    "panelOffset",
    "portableAuditId",
    "portableHasUsers",
    "portableIsEmpty",
    "portableNormalizedFilter",
    "portableResultCount",
    "portableScannedCount",
    "portableSearchInput",
    "portableUsers",
    "portableUsersQuery",
    "productsIsEmpty",
    "productsRequestDetail",
    "productsRequestTitle",
    "productsResultCount",
    "promptOptions",
    "publicProductsQuery",
    "requestDetail",
    "requestTitle",
    "resultCount",
    "searchInput",
    "sendContextToAi",
    "setBusy",
    "setCaptureError",
    "setCaptureInProgress",
    "setCopied",
    "setError",
    "setPanelOffset",
    "setStatus",
    "status",
    "submitPortableSearch",
    "submitSearch",
    "users",
    "usersFilter",
    "usersQuery"
  ],
  "sources": [
    "signalSource (signalSource)",
    "source$ (source$)"
  ],
  "serverFunctionFamilies": [
    "demo.products.list",
    "demo.users.authenticated-list",
    "demo.users.effect-middleware-list",
    "demo.users.list",
    "demo.users.portable-list"
  ],
  "httpEndpoints": [
    {
      "method": "POST",
      "url": "<unresolved:ai-send-context-chat.ts:520>"
    }
  ],
  "uniques": [
    "\"demo.products.list\"",
    "\"demo.users.effect-middleware-list\"",
    "\"demo.users.list\"",
    "\"demo.users.portable-list\""
  ],
  "providers": [],
  "routeProviders": {},
  "componentProviders": {},
  "providedOn": {},
  "collisions": {
    "services": {
      "CurrentSession": [
        "apps/demo-with-server-function/src/shared/authenticated-user.ts",
        "apps/demo-with-server-function/src/shared/authenticated-user.ts"
      ],
      "CurrentUser": [
        "apps/demo-with-server-function/src/shared/authenticated-user.ts",
        "apps/demo-with-server-function/src/shared/authenticated-user.ts"
      ],
      "MiddlewareExecutionScope": [
        "libs/core/src/lib/server-function-middleware.ts",
        "libs/core/src/lib/server-function-middleware.ts"
      ],
      "UserRepository": [
        "apps/demo-with-server-function/src/server/database.ts",
        "apps/demo-with-server-function/src/server/database.ts"
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

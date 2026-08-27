// Generated. Do not edit.
export const architectureCatalog = {
  "version": 1,
  "graphHash": "c7cd07e9601bb621",
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
    "AiSendDialog",
    "AnonymousComponent@31",
    "AnonymousComponent@800",
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
    "hasProducts",
    "hasUsers",
    "instruction",
    "isAdmin",
    "isEmpty",
    "notFound",
    "notFoundMessage",
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
    "publicProductsQuery",
    "requestDetail",
    "requestTitle",
    "resultCount",
    "searchInput",
    "setCopied",
    "setInstruction",
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
  "httpEndpoints": [],
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

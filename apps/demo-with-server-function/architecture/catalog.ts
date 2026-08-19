// Generated. Do not edit.
export const architectureCatalog = {
  "version": 1,
  "graphHash": "121b83b1419ab0dd",
  "routes": [
    "",
    "effect-middleware",
    "portable",
    "simple-list"
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
    "CurrentUser",
    "GlobalPersisterHandlerService",
    "HostName",
    "LocalStoragePersister",
    "LocalStorageService",
    "ServerFunctionTransport",
    "SessionStoragePersister",
    "SessionStorageService",
    "StoragePersister",
    "UserRepository",
    "api"
  ],
  "components": [
    "AiContextMenu",
    "AiSendDialog",
    "AnonymousComponent@800",
    "AppShell",
    "CraftRouterOutlet",
    "EffectServerMiddlewareDemo",
    "PortableServerFunctionDemo",
    "ServerFunctionDemo",
    "SimpleListDemo",
    "craftPending"
  ],
  "primitives": [
    "accessDenied",
    "copied",
    "currentUser",
    "currentUserQuery",
    "effectMiddlewareFilter",
    "effectMiddlewareHasServerError",
    "effectMiddlewareHasUsers",
    "effectMiddlewareIsEmpty",
    "effectMiddlewareServerError",
    "effectMiddlewareServerErrorText",
    "effectMiddlewareUsersQuery",
    "hasUsers",
    "instruction",
    "isAdmin",
    "isEmpty",
    "notFound",
    "notFoundMessage",
    "portableHasUsers",
    "portableIsEmpty",
    "portableResultCount",
    "portableSearchInput",
    "portableUsersQuery",
    "requestDetail",
    "requestTitle",
    "resultCount",
    "runEffectMiddlewareScenario",
    "searchInput",
    "setCopied",
    "setInstruction",
    "submitEffectMiddlewareSearch",
    "submitPortableSearch",
    "submitSearch",
    "usersQuery"
  ],
  "sources": [
    "signalSource (signalSource)",
    "source$ (source$)"
  ],
  "serverFunctionFamilies": [
    "demo.users.authenticated-list",
    "demo.users.effect-middleware-list",
    "demo.users.list",
    "demo.users.portable-list"
  ],
  "httpEndpoints": [],
  "uniques": [
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

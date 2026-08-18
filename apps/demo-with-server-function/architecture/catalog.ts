// Generated. Do not edit.
export const architectureCatalog = {
  "version": 1,
  "graphHash": "fd99ccb4b6c23310",
  "routes": [
    "",
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
    "ServerFunctionDemo",
    "SimpleListDemo",
    "craftPending"
  ],
  "primitives": [
    "accessDenied",
    "copied",
    "currentUser",
    "currentUserQuery",
    "hasUsers",
    "instruction",
    "isAdmin",
    "isEmpty",
    "requestDetail",
    "requestTitle",
    "resultCount",
    "searchInput",
    "setCopied",
    "setInstruction",
    "submitSearch",
    "usersQuery"
  ],
  "sources": [
    "signalSource (signalSource)",
    "source$ (source$)"
  ],
  "serverFunctionFamilies": [
    "demo.users.authenticated-list",
    "demo.users.list"
  ],
  "httpEndpoints": [],
  "uniques": [
    "\"demo.users.authenticated-list\"",
    "\"demo.users.list\""
  ],
  "providers": [],
  "routeProviders": {},
  "componentProviders": {},
  "providedOn": {},
  "collisions": {
    "services": {},
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

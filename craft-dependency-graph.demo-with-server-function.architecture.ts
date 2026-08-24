export const architectureCatalog = {
  "version": 1,
  "graphHash": "6360eb8164812537",
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
    "CraftRouterOutlet",
    "ServerFunctionDemo",
    "craftPending"
  ],
  "primitives": [
    "accessDenied",
    "copied",
    "currentUser",
    "hasUsers",
    "instruction",
    "isAdmin",
    "isEmpty",
    "requestDetail",
    "requestTitle",
    "resultCount",
    "searchInput",
    "searchTerm",
    "setCopied",
    "setInstruction",
    "submitSearch"
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

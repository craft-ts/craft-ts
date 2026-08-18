export const architectureCatalog = {
  "version": 1,
  "graphHash": "58498e779c7a6da6",
  "routes": [
    "",
    "layer-scope",
    "shared-service"
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
    "GlobalLayerService",
    "GlobalPersisterHandlerService",
    "GreetingService",
    "HostName",
    "LocalStoragePersister",
    "LocalStorageService",
    "RouteLayerService",
    "ServerFunctionTransport",
    "SessionStoragePersister",
    "SessionStorageService",
    "StoragePersister",
    "api"
  ],
  "components": [
    "AiContextMenu",
    "AiSendDialog",
    "AnonymousComponent@800",
    "App",
    "CraftRouterOutlet",
    "EffectLayerScopeComponent",
    "EffectSharedServiceComponent",
    "EffectYieldComponent",
    "craftPending"
  ],
  "primitives": [
    "copied",
    "globalLabel",
    "greeting",
    "hasUser",
    "instruction",
    "request",
    "routeLabel",
    "setCopied",
    "setInstruction",
    "userExceptionLoader",
    "userIsLoading",
    "userName"
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

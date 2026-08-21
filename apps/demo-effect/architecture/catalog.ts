// Generated. Do not edit.
export const architectureCatalog = {
  "version": 1,
  "graphHash": "59fbf7c4139a13b3",
  "routes": [
    "",
    "access",
    "effect-function",
    "team"
  ],
  "services": [
    "AccessPolicyService",
    "BrowserCryptoService",
    "BrowserDocumentService",
    "BrowserHistoryService",
    "BrowserLocationService",
    "BrowserNavigatorService",
    "BrowserPerformanceService",
    "BrowserWindowService",
    "ConsoleService",
    "CookiesService",
    "Database",
    "GlobalPersisterHandlerService",
    "HostName",
    "LocalStoragePersister",
    "LocalStorageService",
    "ServerFunctionTransport",
    "SessionService",
    "SessionStoragePersister",
    "SessionStorageService",
    "StoragePersister",
    "StorageService",
    "TeamContextService",
    "api"
  ],
  "components": [
    "AiContextMenu",
    "AiSendDialog",
    "AnonymousComponent@800",
    "App",
    "CraftRouterOutlet",
    "EffectFunctionComponent",
    "EffectLayerScopeComponent",
    "EffectSharedServiceComponent",
    "EffectYieldComponent",
    "craftPending"
  ],
  "primitives": [
    "accessLabel",
    "accessQuery",
    "accessReason",
    "copied",
    "effectFunctionQuery",
    "hasDecision",
    "hasProfile",
    "instruction",
    "memberNames",
    "profileName",
    "profileQuery",
    "setCopied",
    "setInstruction",
    "showUnknown",
    "teamName",
    "teamOverviewQuery",
    "userName",
    "viewerAccess",
    "viewerName"
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
      "AccessPolicyService": [
        "apps/demo-effect/src/app/shared/access-domain.ts",
        "apps/demo-effect/src/app/shared/access-domain.ts"
      ],
      "Database": [
        "apps/demo-effect/src/app/examples/effect/effect-database.ts",
        "apps/demo-effect/src/app/examples/effect/effect-database.ts"
      ],
      "SessionService": [
        "apps/demo-effect/src/app/shared/access-domain.ts",
        "apps/demo-effect/src/app/shared/access-domain.ts"
      ],
      "TeamContextService": [
        "apps/demo-effect/src/app/shared/access-domain.ts",
        "apps/demo-effect/src/app/shared/access-domain.ts"
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

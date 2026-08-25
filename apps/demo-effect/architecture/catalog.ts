// Generated. Do not edit.
export const architectureCatalog = {
  "version": 1,
  "graphHash": "df45f30105b9ca7b",
  "routes": [
    "",
    "access",
    "effect-function",
    "sync-members",
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
    "CartPricing",
    "ConsoleService",
    "CookiesService",
    "CraftLogServerUrl",
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
    "EffectSyncMembersComponent",
    "EffectYieldComponent",
    "craftPending"
  ],
  "primitives": [
    "accessLabel",
    "accessQuery",
    "accessReason",
    "copied",
    "effectFunctionQuery",
    "hasData",
    "hasDecision",
    "hasProfile",
    "instruction",
    "lines",
    "memberNames",
    "profileName",
    "profileQuery",
    "qty",
    "quoteLabel",
    "setCopied",
    "setInstruction",
    "shippingQuery",
    "showUnknown",
    "summary",
    "teamName",
    "teamOverviewQuery",
    "totalLabel",
    "userName",
    "viewerAccess",
    "viewerName",
    "weightLabel"
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
      "CartPricing": [
        "apps/demo-effect/src/app/examples/effect/effect-pricing-domain.ts",
        "apps/demo-effect/src/app/examples/effect/effect-pricing-domain.ts"
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

// Generated. Do not edit.
export const architectureCatalog = {
  "version": 1,
  "graphHash": "aec021ef0c852399",
  "routes": [
    "",
    "access",
    "effect-function",
    "playground",
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
    "TodoStore",
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
    "EffectPlaygroundComponent",
    "EffectSharedServiceComponent",
    "EffectSyncMembersComponent",
    "EffectYieldComponent",
    "craftPending"
  ],
  "primitives": [
    "accessLabel",
    "accessQuery",
    "accessReason",
    "addTodo",
    "copied",
    "effectFunctionQuery",
    "hasData",
    "hasDecision",
    "hasProfile",
    "headingText",
    "instruction",
    "lines",
    "memberNames",
    "profileName",
    "profileQuery",
    "qty",
    "quoteLabel",
    "removeTodo",
    "setCopied",
    "setInstruction",
    "shippingQuery",
    "showUnknown",
    "summary",
    "teamName",
    "teamOverviewQuery",
    "titleInput",
    "todos",
    "toggleTodo",
    "totalLabel",
    "userName",
    "viewerAccess",
    "viewerName",
    "visibleTodos",
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
      ],
      "TodoStore": [
        "apps/demo-effect/src/app/examples/effect/effect-playground-domain.ts",
        "apps/demo-effect/src/app/examples/effect/effect-playground-domain.ts"
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

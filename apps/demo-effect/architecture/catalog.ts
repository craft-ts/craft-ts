// Generated. Do not edit.
export const architectureCatalog = {
  "version": 1,
  "graphHash": "6154f59655a7c43d",
  "routes": [
    "",
    "access",
    "effect-function",
    "i18n",
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
    "I18nEffectService",
    "LocalStoragePersister",
    "LocalStorageService",
    "MiddlewareExecutionScope",
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
    "AiSendContextChat",
    "AiSendContextLauncher",
    "AiSendDialog",
    "AnonymousComponent@setupCraftDirectiveTemplateTestImpl/synthetic",
    "App",
    "CraftRouterOutlet",
    "EffectFunctionComponent",
    "EffectI18nComponent",
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
    "add",
    "addTodo",
    "busy",
    "captureError",
    "captureInProgress",
    "copied",
    "effectFunctionQuery",
    "englishPressed",
    "error",
    "formattedPreview",
    "frenchPressed",
    "hasData",
    "hasDecision",
    "hasProfile",
    "heading",
    "headingText",
    "instruction",
    "lines",
    "locale",
    "memberNames",
    "panelOffset",
    "placed",
    "profileName",
    "profileQuery",
    "promptOptions",
    "qty",
    "quoteLabel",
    "receiptQuery",
    "removeTodo",
    "sendContextToAi",
    "setBusy",
    "setCaptureError",
    "setCaptureInProgress",
    "setCopied",
    "setError",
    "setPanelOffset",
    "setStatus",
    "shippingQuery",
    "showUnknown",
    "status",
    "summary",
    "teamName",
    "teamOverviewQuery",
    "titleInput",
    "todos",
    "toggleTodo",
    "total",
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
  "httpEndpoints": [
    {
      "method": "POST",
      "url": "configuredEndpoint"
    }
  ],
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
      "I18nEffectService": [
        "libs/i18n-effect/src/lib/i18n-effect.ts",
        "libs/i18n-effect/src/lib/i18n-effect.ts"
      ],
      "MiddlewareExecutionScope": [
        "libs/core/src/lib/server-function-middleware.ts",
        "libs/core/src/lib/server-function-middleware.ts"
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

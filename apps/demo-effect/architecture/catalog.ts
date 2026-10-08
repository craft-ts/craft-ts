// Generated. Do not edit.
export const architectureCatalog = {
  "version": 1,
  "graphHash": "094794f2129e2d4d",
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
    "CartPricing",
    "CraftFieldCheckboxControl",
    "CraftFieldValueControl",
    "CraftLogServerUrl",
    "Database",
    "GlobalPersisterHandlerService",
    "I18nEffectService",
    "MiddlewareExecutionScope",
    "ServerFunctionTransport",
    "SessionService",
    "StoragePersister",
    "StorageService",
    "TeamContextService",
    "TodoStore",
    "aiContextMenuDismissal",
    "aiSendContextChatState",
    "aiSendDialogState",
    "appView",
    "craftRouterOutletState",
    "effectFunctionView",
    "effectI18nView",
    "effectLayerScopeView",
    "effectPlaygroundView",
    "effectSharedServiceView",
    "effectSyncMembersView",
    "effectYieldView"
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
    "clearAllCache",
    "copied",
    "dataQuery",
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
    "removeTodoMutation",
    "replayJson",
    "replayStatus",
    "sendContextToAi",
    "setBusy",
    "setCaptureError",
    "setCaptureInProgress",
    "setCopied",
    "setError",
    "setPanelOffset",
    "setReplayStatus",
    "setStatus",
    "shippingQuery",
    "showUnknown",
    "status",
    "summary",
    "teamName",
    "teamOverviewQuery",
    "titleInput",
    "todosQuery",
    "toggleTodoMutation",
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
      "url": "<unresolved:ai-send-context-chat.ts:311>"
    }
  ],
  "uniques": [],
  "providers": [
    "aiContextMenuDismissal",
    "aiSendContextChatState",
    "aiSendDialogState",
    "appView",
    "craftRouterOutletState",
    "effectFunctionView",
    "effectI18nView",
    "effectLayerScopeView",
    "effectPlaygroundView",
    "effectSharedServiceView",
    "effectSyncMembersView",
    "effectYieldView"
  ],
  "routeProviders": {},
  "componentProviders": {
    "App": [
      "appView"
    ],
    "EffectSharedServiceComponent": [
      "effectSharedServiceView"
    ],
    "EffectFunctionComponent": [
      "effectFunctionView"
    ],
    "EffectI18nComponent": [
      "effectI18nView"
    ],
    "EffectPlaygroundComponent": [
      "effectPlaygroundView"
    ],
    "EffectYieldComponent": [
      "effectYieldView"
    ],
    "EffectSyncMembersComponent": [
      "effectSyncMembersView"
    ],
    "EffectLayerScopeComponent": [
      "effectLayerScopeView"
    ],
    "AiContextMenu": [
      "aiContextMenuDismissal"
    ],
    "AiSendContextChat": [
      "aiSendContextChatState"
    ],
    "AiSendDialog": [
      "aiSendDialogState"
    ],
    "CraftRouterOutlet": [
      "craftRouterOutletState"
    ]
  },
  "providedOn": {
    "appView": [
      {
        "kind": "component",
        "name": "App",
        "file": "apps/demo-effect/src/app/app.ts"
      }
    ],
    "effectSharedServiceView": [
      {
        "kind": "component",
        "name": "EffectSharedServiceComponent",
        "file": "apps/demo-effect/src/app/examples/effect/effect-access-check-shared-service.ts"
      }
    ],
    "effectFunctionView": [
      {
        "kind": "component",
        "name": "EffectFunctionComponent",
        "file": "apps/demo-effect/src/app/examples/effect/effect-function.ts"
      }
    ],
    "effectI18nView": [
      {
        "kind": "component",
        "name": "EffectI18nComponent",
        "file": "apps/demo-effect/src/app/examples/effect/effect-i18n.ts"
      }
    ],
    "effectPlaygroundView": [
      {
        "kind": "component",
        "name": "EffectPlaygroundComponent",
        "file": "apps/demo-effect/src/app/examples/effect/effect-playground.ts"
      }
    ],
    "effectYieldView": [
      {
        "kind": "component",
        "name": "EffectYieldComponent",
        "file": "apps/demo-effect/src/app/examples/effect/effect-profile-lookup.ts"
      }
    ],
    "effectSyncMembersView": [
      {
        "kind": "component",
        "name": "EffectSyncMembersComponent",
        "file": "apps/demo-effect/src/app/examples/effect/effect-sync-members.ts"
      }
    ],
    "effectLayerScopeView": [
      {
        "kind": "component",
        "name": "EffectLayerScopeComponent",
        "file": "apps/demo-effect/src/app/examples/effect/effect-team-overview-layer-scope.ts"
      }
    ],
    "aiContextMenuDismissal": [
      {
        "kind": "component",
        "name": "AiContextMenu",
        "file": "libs/component/src/lib/ai/ai-context-menu.ts"
      }
    ],
    "aiSendContextChatState": [
      {
        "kind": "component",
        "name": "AiSendContextChat",
        "file": "libs/component/src/lib/ai/ai-send-context-chat.ts"
      }
    ],
    "aiSendDialogState": [
      {
        "kind": "component",
        "name": "AiSendDialog",
        "file": "libs/component/src/lib/ai/ai-send-dialog.ts"
      }
    ],
    "craftRouterOutletState": [
      {
        "kind": "component",
        "name": "CraftRouterOutlet",
        "file": "libs/component/src/lib/craft-router-outlet.ts"
      }
    ]
  },
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
  "browserBoundaryServices": [],
  "scopes": {}
} as const;
export type ArchitectureCatalog = typeof architectureCatalog;

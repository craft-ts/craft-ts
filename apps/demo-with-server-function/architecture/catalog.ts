// Generated. Do not edit.
export const architectureCatalog = {
  "version": 1,
  "graphHash": "b4873b92fce70f2b",
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
    "ClaimedUserId",
    "ClientSession",
    "CraftFieldCheckboxControl",
    "CraftFieldValueControl",
    "CraftLogServerUrl",
    "CurrentSession",
    "CurrentUser",
    "GlobalPersisterHandlerService",
    "MiddlewareExecutionScope",
    "ServerFunctionTransport",
    "StoragePersister",
    "StorageService",
    "UserRepository",
    "aiContextMenuDismissal",
    "aiSendContextChatState",
    "aiSendDialogState",
    "appShellView",
    "craftRouterOutletState",
    "effectServerMiddlewareDemoView",
    "portableServerFunctionDemoView",
    "publicProductsDemoView",
    "serverFunctionDemoView",
    "simpleListDemoView"
  ],
  "components": [
    "AiContextMenu",
    "AiSendContextChat",
    "AiSendContextLauncher",
    "AiSendDialog",
    "AnonymousComponent@setupCraftDirectiveTemplateTestImpl/synthetic",
    "AnonymousComponent@statusPage",
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
    "accessDenied",
    "auditId",
    "busy",
    "captureError",
    "captureInProgress",
    "clearAllCache",
    "copied",
    "currentUser",
    "currentUserQuery",
    "effectMiddlewareServerError",
    "error",
    "filter",
    "hasProducts",
    "hasServerError",
    "hasUsers",
    "instruction",
    "isAdmin",
    "isEmpty",
    "normalizedFilter",
    "notFound",
    "notFoundMessage",
    "panelOffset",
    "portableUsers",
    "productsIsEmpty",
    "productsQuery",
    "productsRequestDetail",
    "productsRequestTitle",
    "productsResultCount",
    "promptOptions",
    "replayJson",
    "replayStatus",
    "requestDetail",
    "requestTitle",
    "resultCount",
    "scannedCount",
    "searchInput",
    "sendContextToAi",
    "serverErrorText",
    "setBusy",
    "setCaptureError",
    "setCaptureInProgress",
    "setCopied",
    "setError",
    "setPanelOffset",
    "setReplayStatus",
    "setStatus",
    "status",
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
  "httpEndpoints": [
    {
      "method": "POST",
      "url": "<unresolved:ai-send-context-chat.ts:311>"
    }
  ],
  "uniques": [
    "\"demo.products.list\"",
    "\"demo.users.effect-middleware-list\"",
    "\"demo.users.list\"",
    "\"demo.users.portable-list\""
  ],
  "providers": [
    "aiContextMenuDismissal",
    "aiSendContextChatState",
    "aiSendDialogState",
    "appShellView",
    "craftRouterOutletState",
    "effectServerMiddlewareDemoView",
    "portableServerFunctionDemoView",
    "publicProductsDemoView",
    "serverFunctionDemoView",
    "simpleListDemoView"
  ],
  "routeProviders": {},
  "componentProviders": {
    "AppShell": [
      "appShellView"
    ],
    "EffectServerMiddlewareDemo": [
      "effectServerMiddlewareDemoView"
    ],
    "PortableServerFunctionDemo": [
      "portableServerFunctionDemoView"
    ],
    "PublicProductsDemo": [
      "publicProductsDemoView"
    ],
    "ServerFunctionDemo": [
      "serverFunctionDemoView"
    ],
    "SimpleListDemo": [
      "simpleListDemoView"
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
    "appShellView": [
      {
        "kind": "component",
        "name": "AppShell",
        "file": "apps/demo-with-server-function/src/client/app-shell.ts"
      }
    ],
    "effectServerMiddlewareDemoView": [
      {
        "kind": "component",
        "name": "EffectServerMiddlewareDemo",
        "file": "apps/demo-with-server-function/src/client/effect-server-middleware-demo.ts"
      }
    ],
    "portableServerFunctionDemoView": [
      {
        "kind": "component",
        "name": "PortableServerFunctionDemo",
        "file": "apps/demo-with-server-function/src/client/portable-server-function-demo.ts"
      }
    ],
    "publicProductsDemoView": [
      {
        "kind": "component",
        "name": "PublicProductsDemo",
        "file": "apps/demo-with-server-function/src/client/public-products-demo.ts"
      }
    ],
    "serverFunctionDemoView": [
      {
        "kind": "component",
        "name": "ServerFunctionDemo",
        "file": "apps/demo-with-server-function/src/client/server-function-demo.ts"
      }
    ],
    "simpleListDemoView": [
      {
        "kind": "component",
        "name": "SimpleListDemo",
        "file": "apps/demo-with-server-function/src/client/simple-list-demo.ts"
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
      "CurrentSession": [
        "apps/demo-with-server-function/src/shared/authenticated-user.ts",
        "apps/demo-with-server-function/src/shared/authenticated-user.ts"
      ],
      "CurrentUser": [
        "apps/demo-with-server-function/src/shared/authenticated-user.ts",
        "apps/demo-with-server-function/src/shared/authenticated-user.ts"
      ],
      "MiddlewareExecutionScope": [
        "libs/core/src/lib/server-function-middleware.ts",
        "libs/core/src/lib/server-function-middleware.ts"
      ],
      "UserRepository": [
        "apps/demo-with-server-function/src/server/database.ts",
        "apps/demo-with-server-function/src/server/database.ts"
      ]
    },
    "components": {},
    "routes": {}
  },
  "browserBoundaryServices": [],
  "scopes": {}
} as const;
export type ArchitectureCatalog = typeof architectureCatalog;

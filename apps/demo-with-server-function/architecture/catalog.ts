// Generated. Do not edit.
export const architectureCatalog = {
  "version": 1,
  "graphHash": "5a67d758e195398b",
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
    "currentUser",
    "currentUserQuery",
    "effectMiddlewareServerError",
    "error",
    "filter",
    "hasProducts",
    "hasServerError",
    "hasUsersClientEffectServerMiddlewareDemo",
    "hasUsersClientPortableServerFunctionDemo",
    "hasUsersClientServerFunctionDemo",
    "isAdmin",
    "isEmptyClientEffectServerMiddlewareDemo",
    "isEmptyClientPortableServerFunctionDemo",
    "isEmptyClientServerFunctionDemo",
    "normalizedFilter",
    "notFoundClientServerFunctionDemo",
    "notFoundClientSimpleListDemo",
    "notFoundMessage",
    "panelOffset",
    "portableUsers",
    "productsIsEmpty",
    "productsQuery",
    "productsRequestDetail",
    "productsRequestTitle",
    "productsResultCount",
    "requestDetailClientServerFunctionDemo",
    "requestDetailClientSimpleListDemo",
    "requestTitleClientServerFunctionDemo",
    "requestTitleClientSimpleListDemo",
    "resultCountClientPortableServerFunctionDemo",
    "resultCountClientServerFunctionDemo",
    "resultCountClientSimpleListDemo",
    "scannedCount",
    "searchInputClientPortableServerFunctionDemo",
    "searchInputClientServerFunctionDemo",
    "searchInputClientSimpleListDemo",
    "sendContextInstruction",
    "sendContextPromptOptions",
    "sendContextToAi",
    "sendDialogCopied",
    "sendDialogInstruction",
    "sendDialogPromptOptions",
    "serverErrorText",
    "setBusy",
    "setCaptureError",
    "setCaptureInProgress",
    "setCopied",
    "setError",
    "setPanelOffset",
    "setPortableSearchInputClientPortableServerFunctionDemo",
    "setSearchInputClientServerFunctionDemo",
    "setSearchInputClientSimpleListDemo",
    "setStatus",
    "setTimelineExpanded",
    "status",
    "submitSearchClientPortableServerFunctionDemo",
    "submitSearchClientServerFunctionDemo",
    "submitSearchClientSimpleListDemo",
    "timelineExpanded",
    "users",
    "usersFilter",
    "usersQueryClientEffectServerMiddlewareDemo",
    "usersQueryClientPortableServerFunctionDemo",
    "usersQueryClientServerFunctionDemo",
    "usersQueryClientSimpleListDemo"
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
      "url": "<unresolved:ai-send-context-chat.ts:255>"
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
  "scopes": {
    "appShellView": "toProvide",
    "ClientSession": "global",
    "effectServerMiddlewareDemoView": "toProvide",
    "portableServerFunctionDemoView": "toProvide",
    "publicProductsDemoView": "toProvide",
    "serverFunctionDemoView": "toProvide",
    "simpleListDemoView": "toProvide",
    "ClaimedUserId": "abstract",
    "aiContextMenuDismissal": "toProvide",
    "aiSendContextChatState": "toProvide",
    "aiSendDialogState": "toProvide",
    "craftRouterOutletState": "toProvide",
    "StorageService": "abstract",
    "CraftLogServerUrl": "abstract",
    "CraftFieldCheckboxControl": "abstract",
    "CraftFieldValueControl": "abstract",
    "GlobalPersisterHandlerService": "toProvide",
    "ServerFunctionTransport": "abstract",
    "StoragePersister": "abstract"
  }
} as const;
export type ArchitectureCatalog = typeof architectureCatalog;

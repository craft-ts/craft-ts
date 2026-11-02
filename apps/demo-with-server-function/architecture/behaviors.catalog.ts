// Generated. Do not edit: the architecture suite rewrites it with `vitest -u`.
export const behaviorCatalog = {
  "version": 1,
  "behaviors": [
    {
      "id": "command:effectServerMiddlewareDemoView.usersQueryClientEffectServerMiddlewareDemo#success",
      "kind": "command",
      "file": "apps/demo-with-server-function/src/client/effect-server-middleware-demo.ts"
    },
    {
      "id": "command:portableServerFunctionDemoView.usersQueryClientPortableServerFunctionDemo#success",
      "kind": "command",
      "file": "apps/demo-with-server-function/src/client/portable-server-function-demo.ts"
    },
    {
      "id": "command:serverFunctionDemoView.usersQueryClientServerFunctionDemo#success",
      "kind": "command",
      "file": "apps/demo-with-server-function/src/client/server-function-demo.ts"
    },
    {
      "id": "method:portableServerFunctionDemoView.setPortableSearchInputClientPortableServerFunctionDemo",
      "kind": "method",
      "file": "apps/demo-with-server-function/src/client/portable-server-function-demo.ts"
    },
    {
      "id": "method:portableServerFunctionDemoView.submitSearchClientPortableServerFunctionDemo",
      "kind": "method",
      "file": "apps/demo-with-server-function/src/client/portable-server-function-demo.ts"
    },
    {
      "id": "method:serverFunctionDemoView.setSearchInputClientServerFunctionDemo",
      "kind": "method",
      "file": "apps/demo-with-server-function/src/client/server-function-demo.ts"
    },
    {
      "id": "method:serverFunctionDemoView.submitSearchClientServerFunctionDemo",
      "kind": "method",
      "file": "apps/demo-with-server-function/src/client/server-function-demo.ts"
    },
    {
      "id": "method:simpleListDemoView.setSearchInputClientSimpleListDemo",
      "kind": "method",
      "file": "apps/demo-with-server-function/src/client/simple-list-demo.ts"
    },
    {
      "id": "method:simpleListDemoView.submitSearchClientSimpleListDemo",
      "kind": "method",
      "file": "apps/demo-with-server-function/src/client/simple-list-demo.ts"
    },
    {
      "id": "route:app:",
      "kind": "route",
      "file": "apps/demo-with-server-function/src/client/app.routes.ts"
    },
    {
      "id": "route:app:access-denied",
      "kind": "route",
      "file": "apps/demo-with-server-function/src/client/app.routes.ts"
    },
    {
      "id": "route:app:authenticated-list",
      "kind": "route",
      "file": "apps/demo-with-server-function/src/client/app.routes.ts"
    },
    {
      "id": "route:app:effect-middleware",
      "kind": "route",
      "file": "apps/demo-with-server-function/src/client/app.routes.ts"
    },
    {
      "id": "route:app:portable",
      "kind": "route",
      "file": "apps/demo-with-server-function/src/client/app.routes.ts"
    },
    {
      "id": "route:app:session-required",
      "kind": "route",
      "file": "apps/demo-with-server-function/src/client/app.routes.ts"
    },
    {
      "id": "route:app:session-revoked",
      "kind": "route",
      "file": "apps/demo-with-server-function/src/client/app.routes.ts"
    },
    {
      "id": "route:app:simple-list",
      "kind": "route",
      "file": "apps/demo-with-server-function/src/client/app.routes.ts"
    },
    {
      "id": "route:app:users-not-found",
      "kind": "route",
      "file": "apps/demo-with-server-function/src/client/app.routes.ts"
    },
    {
      "id": "server-function:demo.products.list",
      "kind": "server-function",
      "file": "apps/demo-with-server-function/src/products/public-products.fn-client.ts"
    },
    {
      "id": "server-function:demo.users.authenticated-list",
      "kind": "server-function",
      "file": "apps/demo-with-server-function/src/users/authenticated-list.fn-client.ts"
    },
    {
      "id": "server-function:demo.users.effect-middleware-list",
      "kind": "server-function",
      "file": "apps/demo-with-server-function/src/users/effect-middleware-list.fn-client.ts"
    },
    {
      "id": "server-function:demo.users.list",
      "kind": "server-function",
      "file": "apps/demo-with-server-function/src/users/list.fn-client.ts"
    },
    {
      "id": "server-function:demo.users.portable-list",
      "kind": "server-function",
      "file": "apps/demo-with-server-function/src/users/portable-list.fn-client.ts"
    }
  ]
} as const;
export type BehaviorCatalogType = typeof behaviorCatalog;

// Generated. Do not edit: the architecture suite rewrites it with `vitest -u`.
export const behaviorCatalog = {
  "version": 1,
  "behaviors": [
    {
      "id": "command:adminView.adminAction#success",
      "kind": "command",
      "file": "src/client/admin-page.ts"
    },
    {
      "id": "command:adminView.adminStore#success",
      "kind": "command",
      "file": "src/client/admin-page.ts"
    },
    {
      "id": "command:session.signOutProcess#success",
      "kind": "command",
      "file": "src/client/shop-state.ts"
    },
    {
      "id": "command:storefrontView.placeOrderProcess#success",
      "kind": "command",
      "file": "src/client/store-pages.ts"
    },
    {
      "id": "method:cartLogsPageState.addProduct",
      "kind": "method",
      "file": "src/client/cart-logs-state.ts"
    },
    {
      "id": "method:cartLogsPageState.changeQuantity",
      "kind": "method",
      "file": "src/client/cart-logs-state.ts"
    },
    {
      "id": "method:cartLogsPageState.emptyCart",
      "kind": "method",
      "file": "src/client/cart-logs-state.ts"
    },
    {
      "id": "method:cartLogsPageState.removeProduct",
      "kind": "method",
      "file": "src/client/cart-logs-state.ts"
    },
    {
      "id": "mutation:cart.syncServerCart#success",
      "kind": "mutation",
      "file": "src/client/shop-state.ts"
    },
    {
      "id": "mutation:session.signInProcess#success",
      "kind": "mutation",
      "file": "src/client/shop-state.ts"
    },
    {
      "id": "route:ecommerce:",
      "kind": "route",
      "file": "src/client/app.routes.ts"
    },
    {
      "id": "route:ecommerce:admin",
      "kind": "route",
      "file": "src/client/app.routes.ts"
    },
    {
      "id": "route:ecommerce:catalogue",
      "kind": "route",
      "file": "src/client/app.routes.ts"
    },
    {
      "id": "route:ecommerce:connexion",
      "kind": "route",
      "file": "src/client/app.routes.ts"
    },
    {
      "id": "route:ecommerce:formule/:productId",
      "kind": "route",
      "file": "src/client/app.routes.ts"
    },
    {
      "id": "route:ecommerce:paiement",
      "kind": "route",
      "file": "src/client/app.routes.ts"
    },
    {
      "id": "route:ecommerce:panier",
      "kind": "route",
      "file": "src/client/app.routes.ts"
    },
    {
      "id": "route:ecommerce:panier-logs",
      "kind": "route",
      "file": "src/client/app.routes.ts"
    },
    {
      "id": "route:ecommerce:produit/:productId",
      "kind": "route",
      "file": "src/client/app.routes.ts"
    },
    {
      "id": "server-function:ecommerce.admin.overview",
      "kind": "server-function",
      "file": "src/server/functions.ts"
    },
    {
      "id": "server-function:ecommerce.auth.login",
      "kind": "server-function",
      "file": "src/server/functions.ts"
    },
    {
      "id": "server-function:ecommerce.auth.logout",
      "kind": "server-function",
      "file": "src/server/functions.ts"
    },
    {
      "id": "server-function:ecommerce.auth.me",
      "kind": "server-function",
      "file": "src/server/functions.ts"
    },
    {
      "id": "server-function:ecommerce.cart.addLine",
      "kind": "server-function",
      "file": "src/server/functions.ts"
    },
    {
      "id": "server-function:ecommerce.cart.create",
      "kind": "server-function",
      "file": "src/server/functions.ts"
    },
    {
      "id": "server-function:ecommerce.cart.get",
      "kind": "server-function",
      "file": "src/server/functions.ts"
    },
    {
      "id": "server-function:ecommerce.catalog",
      "kind": "server-function",
      "file": "src/server/functions.ts"
    },
    {
      "id": "server-function:ecommerce.catalog.search",
      "kind": "server-function",
      "file": "src/server/functions.ts"
    },
    {
      "id": "server-function:ecommerce.category.delete",
      "kind": "server-function",
      "file": "src/server/functions.ts"
    },
    {
      "id": "server-function:ecommerce.category.save",
      "kind": "server-function",
      "file": "src/server/functions.ts"
    },
    {
      "id": "server-function:ecommerce.checkout",
      "kind": "server-function",
      "file": "src/server/functions.ts"
    },
    {
      "id": "server-function:ecommerce.product.delete",
      "kind": "server-function",
      "file": "src/server/functions.ts"
    },
    {
      "id": "server-function:ecommerce.product.save",
      "kind": "server-function",
      "file": "src/server/functions.ts"
    },
    {
      "id": "server-function:ecommerce.reset",
      "kind": "server-function",
      "file": "src/server/functions.ts"
    }
  ]
} as const;
export type BehaviorCatalogType = typeof behaviorCatalog;

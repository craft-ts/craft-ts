# Route page components each live in their own file

`assertRouteComponentsInSeparateFiles` requires every component attached to a
route through `component`, `loadComponent` or a lazy `import()` to live outside
the route-definition file. It also rejects two different routed page components
sharing one common component file:

<<< @/tests/snippets/guide/testing/architecture/route-component-files.spec.ts#example

## What it prevents

This keeps the page boundary explicit:

```typescript
// pages.routes.ts
export const pagesRoutes = craftRoutes('pages', [
  {
    path: 'orders',
    loadComponent: () => import('./orders-page'),
  },
]);
```

```typescript
// orders-page.ts
export const OrdersPage = craftComponent(/* ... */);
```

Putting both declarations in `pages.routes.ts` makes route files grow into
feature modules. Putting `OrdersPage` and `CustomersPage` in one
`pages.components.ts` file creates the same problem at the lazy boundary: the
chunk is no longer organized around one page entry point.

The rule covers both eager route targets and lazy targets. A route collection
may contain several routes, but each page component declaration still has its
own source file. Child components rendered by a page are not route targets and
are not restricted by this rule. Reusing the same component declaration from
multiple routes is not treated as two page components.

## The intended shape

Keep the route tree responsible for navigation and loading:

```typescript
// account.routes.ts
export const accountRoutes = craftRoutes('account', [
  {
    path: 'profile',
    loadComponent: ({ withRetry }) =>
      withRetry(import('./profile-page')).then((module) => module.ProfilePage),
  },
]);
```

Keep the page implementation in its own file, with its own component
dependencies and tests. `loadChildren` remains the right choice when a whole
route collection should be lazy, while the collection's page components still
follow this file boundary.

## Failure message

The assertion reports the route, component and offending source file. Move each
page component to its own sibling file, then keep the route's import literal so
the router and bundler can discover the lazy boundary.

## See also

- [Routing setup](/guide/routing/setup)
- [Scaling routes](/guide/routing/scaling)
- [Route DI proofs](./route-di-proofs)

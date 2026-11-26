---
name: craft-ts-routes
description: Create and maintain type-safe routes with @craft-ts/core. Use when editing craftRoutes, craftRoute, loadCraftComponent, loadChildren, route DI checks, pending components, or route exceptions.
---

# CraftTS routes

Use `craftRoutes(name, [...])` and `craftRoute(...)` for route collections. Lazy Craft components
should be loaded with `loadCraftComponent`, which carries the component's inferred dependency
contract into the route:

```ts
import { loadCraftComponent } from '@craft-ts/component';

craftRoute('users/:userId', {
  ...loadCraftComponent(({ withRetry }) =>
    withRetry(import('./user-detail')).then((module) => module.default),
  ),
});
```

For a per-route check, derive the type directly from the component:

```ts
type UserDetailDI = RouteCheckedDI<
  ComponentDepsOf<(typeof import('./user-detail'))['default']>,
  AvailableProviderNames,
  ProvidedValues,
  'UserDetail'
>;
type _CanRunUserDetail = CanRun<UserDetailDI>;
```

Never create or refresh a separate dependency alias. `ComponentDepsOf` must stay tied to the
component so its check changes when its dependencies change. Keep `RouteCheckedDI` / `CanRun` checks,
`assertExhaustiveRouteExceptions`, and checks in each lazy route collection. The parent collection
does not validate the child collection behind `loadChildren`.

Use literal dynamic imports wrapped with `withRetry` for Craft lazy chunks. Handle all typed route
exceptions with route handlers or `assertExhaustiveRouteExceptions`. If a route collection reaches
TypeScript's instantiation limit, split it into checked child collections with `loadChildren`.

If the error comes from the routed component's own tree instead (`TS2589`, `TS2321` or `TS7056` on
the component, a condition between two components, a slot or a `forNode` row), splitting routes does
not help: seal the component at that boundary with `sealComponent(Component)`. It keeps the DI
contract, so `RouteCheckedDI` still proves it. Never type the component as `CraftComponent<…>` to
shrink it: the proof then fails with "unknown component dependency contract". See
`references/scaling-and-pitfalls.md`.

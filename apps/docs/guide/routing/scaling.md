# Scaling routes

`RouteCheckedDI` validates one routed component at a time. Its cost does not
grow with the number of sibling routes, so a large route file keeps the same
DI safety as a small one.

::: tip Keep route ownership clear
Use `loadChildren` when a feature deserves its own lazy boundary or team
ownership. Every route file remains independently checked.
:::

## Large route files

The per-route check does not recursively instantiate the complete route tuple.
Add one `RouteCheckedDI` / `CanRun` pair for each routed component:

```ts
import { type CanRun, type RouteCheckedDI } from '@craft-ts/core';

type _CheckItem0 = RouteCheckedDI<
  import('./item-0').GenDeps_Item0Component,
  AppProvidedNames,
  AppProvidedValues,
  'Item0Component'
>;
type _CanRunItem0 = CanRun<_CheckItem0>;

type _CheckItem1 = RouteCheckedDI<
  import('./item-1').GenDeps_Item1Component,
  AppProvidedNames,
  AppProvidedValues,
  'Item1Component'
>;
type _CanRunItem1 = CanRun<_CheckItem1>;
```

If a component starts depending on a service that is not provided, or expects
an input that the route does not supply, its `CanRun` alias becomes a
TypeScript error in the route file.

## Scaling to hundreds of routes

Organise routes as a tree of feature files joined by `loadChildren` when that
improves lazy loading or ownership:

```
app.routes.ts
├── billing.routes.ts
├── admin.routes.ts
└── reporting.routes.ts
```

The parent registers a child collection with a lazy entry:

```ts
{
  path: 'billing',
  loadChildren: ({ withRetry }) =>
    withRetry(import('./billing.routes')).then((m) => m.billingRoutes),
},
```

The child file declares its own routes and its own per-route checks. A parent
proof never covers a component inside a `loadChildren` collection.

::: tip Threading the parent DI context
The second and third `RouteCheckedDI` parameters are the names and values
provided at the route's mount point — app providers plus ancestor route
providers. When an ancestor adds providers, re-export that cumulative context
and pass it to the child route checks.
:::

## Pinning a lazy child to its mount path (`.withParent` + `assertChildRouteMounts`)

Splitting into `loadChildren` keeps route ownership clear, but nothing yet
guarantees a child is wired under the right parent route. A child whose
components rely on a specific mount — its `:photoId` param, a declared
view-transition payload, or an ancestor's providers — is only correct under
that path.

Pin a collection to its mount path with `.withParent<ParentRoutes<'path'>>()`,
then enforce it once in the parent with
`assertChildRouteMounts(parentRoutes)`:

```ts
// view-transitions.routes.ts — the child declares where it belongs
import { craftRoutes, craftRoute, type ParentRoutes } from '@craft-ts/core';

export const { viewTransitionsRoutes } = craftRoutes('viewTransitions', [
  craftRoute(':photoId', {
    componentDeps: {} as import('./photo-detail').GenDeps_PhotoDetailComponent,
    loadComponent: ({ withRetry }) => withRetry(import('./photo-detail')),
  }),
]).withParent<ParentRoutes<'view-transitions'>>();
```

```ts
// app.routes.ts — the parent enforces placement
import { assertChildRouteMounts, craftRoutes } from '@craft-ts/core';

export const { demoRoutes } = craftRoutes('demo', [
  {
    path: 'view-transitions',
    loadChildren: ({ withRetry }) =>
      withRetry(import('./view-transitions.routes')).then(
        (m) => m.viewTransitionsRoutes,
      ),
  },
]);

assertChildRouteMounts(demoRoutes);
```

Mounting the pinned collection under another path fails in the parent file:

```
craftRoutes(...).withParent<ParentRoutes<'view-transitions'>>() must be
loadChildren-mounted under the route with path 'view-transitions', not 'admin'
```

Notes:

- A collection without `.withParent` is unpinned and can be mounted anywhere.
- `assertChildRouteMounts` reads only the parent's own routes; it does not
  re-validate the child.
- `.withParent<…>()` is type-only and creates no runtime coupling.
- `craft-ts/require-child-route-mount-check` adds the missing
  `assertChildRouteMounts(...)` call and import on `--fix`.

## See Also

- [Setup](/guide/routing/setup)
- [Architecture rules](/guide/testing/architecture) — `assertRouteDiProofs` catches a routed component with no check
- [Route providers](/guide/routing/route-providers)

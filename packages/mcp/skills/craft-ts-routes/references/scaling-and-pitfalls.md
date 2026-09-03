# Scaling routes and avoiding type blow-ups

`RouteCheckedDI` checks one routed component at a time. It does not recurse through sibling routes,
so the DI proof cost remains local to the component being checked.

## Use a route tree when ownership or loading requires it

Split features into child collections joined by `loadChildren` when that improves code-splitting or
ownership:

```
app.routes.ts
├── billing.routes.ts       # each routed component has RouteCheckedDI + CanRun
├── admin.routes.ts         # each routed component has RouteCheckedDI + CanRun
└── reporting.routes.ts
```

The child returns its named collection from `loadChildren`:

```ts
{
  path: 'billing',
  loadChildren: ({ withRetry }) =>
    withRetry(import('./billing.routes')).then((m) => m.billingRoutes),
}
```

A parent check does not cover components in the lazy child. Keep each child's route checks beside
the components they validate.

## Thread the parent DI context

`ParentNames` / `ParentValues` passed to `RouteCheckedDI` describe everything provided at the route's
mount point: app providers plus ancestor route providers. Re-export the cumulative context when an
ancestor adds route providers, then pass it to the child checks.

## Pin a child to its mount

A child whose components rely on a specific mount (a route param, a view-transition payload, or an
ancestor provider) can declare `.withParent<ParentRoutes<'path'>>()`. Enforce placement in the parent
with `assertChildRouteMounts(parentRoutes)`:

```ts
export const { viewTransitionsRoutes } = craftRoutes('viewTransitions', [
  craftRoute(':photoId', { /* … */ }),
]).withParent<ParentRoutes<'view-transitions'>>();

assertChildRouteMounts(demoRoutes);
```

`assertChildRouteMounts` reads only the parent's own routes and does not re-validate the child.

## Pitfalls

- Do not cast away a DI error with `any` or `@ts-ignore`.
- Do not assume a parent route check covers a `loadChildren` child.
- Do not omit `CanRun`: the type alias is what consumes the check and turns a mismatch into a compile
  error.

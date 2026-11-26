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

## Type-depth errors from a component tree

Splitting routes only helps when the route collection itself is too large. When `TS2589`,
`TS2321` (excessive stack depth comparing types) or `TS7056` (inferred type too long to serialize)
fires on a component, its template or a parent rendering it, the cause is the component type: it
carries the shape of the whole tree its template renders, and some sites re-expand it — a
condition between two deep components, a slot, a `forNode` row, a generic boundary, the `.d.ts` of
an exported component.

Seal the component where it crosses that boundary:

```ts
import { craftComponent, sealComponent } from '@craft-ts/component';

// workspace-browser.ts — the definition stays plain, so its own tests keep typed locators.
export const WorkspaceBrowser = craftComponent('WorkspaceBrowser', { providers: [/* … */] }, function* () {
  /* … */
});

// shell.ts — sealed where it is composed.
const SealedWorkspaceBrowser = sealComponent(WorkspaceBrowser);
```

`sealComponent` returns the component untouched. Its type keeps props, the DI contract
(`ComponentDepsOf<typeof SealedWorkspaceBrowser>` proves the same as the unsealed one), exceptions,
the `headingSection` need, channels and `.pipe(...)`. It drops only the rendered tree, so typed
content locators and template contracts stop at the sealed boundary.

It is one remedy, not a default: splitting a huge template into child components also helps, and
`tsc --extendedDiagnostics` shows whether composition dominates the instantiation count.

## Pitfalls

- Do not cast away a DI error with `any` or `@ts-ignore`.
- Do not type a component as `CraftComponent<…>` (annotation or assertion) to make its type
  smaller: it drops the DI contract, and `RouteCheckedDI` then fails with "unknown component
  dependency contract". Use `sealComponent(Component)`.
- Do not assume a parent route check covers a `loadChildren` child.
- Do not omit `CanRun`: the type alias is what consumes the check and turns a mismatch into a compile
  error.

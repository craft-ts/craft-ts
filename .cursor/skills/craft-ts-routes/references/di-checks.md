# Per-route DI checks

`RouteCheckedDI<ComponentDeps, ParentNames, ParentValues, Context, RouteInputs>` compares one
routed component's dependencies against the providers available at its mount point, the route, and
the component itself. Consume the result with `CanRun`:

```ts
type _CheckXDI = RouteCheckedDI<
  import('./detail').GenDeps_DetailComponent,
  AppProvidedNames,
  AppProvidedValues,
  'detail/:id',
  'id'
>;
type _CanRunX = CanRun<_CheckXDI>;
```

Every routed component, including components in a `loadChildren` child file, needs its own check.
`RouteCheckedDI` does not recurse through sibling routes or lazy route collections. This keeps the
proof cost local as a route file grows.

`assertRouteDiProofs` catches a missing or unarmed check in CI. TypeScript validates dependency
semantics; the architecture suite validates that the check was invoked.

`ParentNames` / `ParentValues` describe everything provided at the route's mount point: app providers
plus ancestor route providers. Re-export the cumulative context when an ancestor adds route providers.

Pending components and error-component descriptors are not the routed target. Verify them independently
with `RouteCheckedDI` or `RouteExceptionComponentCheckedDI`, then consume each result with `CanRun`.

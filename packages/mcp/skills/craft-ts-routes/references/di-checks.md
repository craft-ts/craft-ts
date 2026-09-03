# Per-route DI checks

## What the check does

`RouteCheckedDI<ComponentDeps, ParentNames, ParentValues, Context, RouteInputs>` compares one
routed component's dependencies against the providers available at its mount point, the route, and
the component itself. Any gap becomes a TypeScript error when the result is consumed by `CanRun`:

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

Typical errors are:

```
Injected SomeService is not provided in path: "detail/:id"
Input "id" is not provided in path: "detail/:id"
```

The `CanRun` alias is what turns the result into a hard compile error. Keep both aliases next to the
route metadata.

## One check per routed component

`RouteCheckedDI` does not recurse through sibling routes or lazy route collections. Every routed
component, including components in a `loadChildren` child file, therefore needs its own check. This
per-route shape keeps the cost stable as a route file grows and makes the failing route easy to find.

The architecture assertion `assertRouteDiProofs` catches a missing or unarmed check in CI. TypeScript
still validates the dependency semantics; the architecture suite validates that the check was invoked.

## Threading the parent DI context

`ParentNames` / `ParentValues` describe everything provided at the route's mount point — app providers
plus ancestor route providers.

- **App-level / no ancestor providers:** use the app's named provider union and value type.
- **Mounted under a route that adds providers:** re-export the ancestor's cumulative context next to
  the route that adds them and pass it to the child route checks.

Forgetting an ancestor provider can either hide a missing-provider error or report a provided service
as missing, so keep the context definition beside the provider boundary.

## Pending and error components

Pending components and error-component descriptors are not the routed target. Verify them independently
with `RouteCheckedDI` or `RouteExceptionComponentCheckedDI`, then consume each result with `CanRun`.
The ESLint rules for pending and exception components maintain those independent blocks.

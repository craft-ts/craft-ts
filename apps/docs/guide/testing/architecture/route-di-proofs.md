# Route DI proofs and exception coverage

`assertRouteDiProofs` keeps type-level routing guarantees armed at runtime in
CI. It checks that routed components, lazy route collections, pending screens
and error screens have a live mapper connected to a `CanRun` proof:

<<< @/tests/snippets/guide/testing/architecture/route-di-proofs.spec.ts#example

## What it prevents

`RouteCheckedDI` is intentionally an unused type alias:

```typescript
type Check = RouteCheckedDI<ComponentDeps, 'CraftRouter', never, 'tasks'>;
type CanRunCheck = CanRun<Check>;
```

If somebody comments out `CanRunCheck`, TypeScript still compiles. The proof no
longer runs, and a later missing provider can become a runtime navigation
failure. `assertRouteDiProofs` spots the unarmed mapper by inspecting the graph.

The same applies to a child route file: a parent cascade proof cannot cover a
lazy `loadChildren` collection that was added later.

## It also covers error surfaces

The rule requires checks for:

- routed components;
- pending components;
- route and global error components;
- route-load error components;
- `assertExhaustiveRouteExceptions` on route collections.

Without the error-screen checks, the happy route can be type-safe while the
first missing provider renders an unverified fallback.

## The expected pairing

```typescript
type CheckTasks = RouteCheckedDI<
  ComponentDepsOf<typeof Tasks>,
  'CraftRouter',
  never,
  'tasks'
>;
type CanRunTasks = CanRun<CheckTasks>;

assertExhaustiveRouteExceptions(appRoutes);
```

TypeScript checks whether the provider is available; this rule checks that the
application actually invoked that judgement.

## See also

- [Routing setup](/guide/routing/setup)
- [Route providers](/guide/routing/route-providers)
- [Route exception handling](/guide/routing/exception-handling)

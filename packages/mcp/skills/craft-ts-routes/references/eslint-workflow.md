# ESLint workflow — keep route checks in sync

The route checks, dependency metadata, exception asserts and their imports are maintained by the
project's ESLint rules. An ESLint error is not a TypeScript compile error, so run ESLint after editing
routes or a component's dependency shape.

## Routing-relevant rules

Enable these in the flat ESLint config (plugin exposed as `@craft-ts/dev-tools/eslint-rules`):

| Rule | Keeps in sync |
| --- | --- |
| `require-assert-exhaustive-route-exceptions` | adds `assertExhaustiveRouteExceptions(xRoutes)` per collection |
| `require-pending-component-di-check` | generates/refreshes the `RouteCheckedDI` block for a `pendingComponent` |
| `require-exception-component-di-check` | generates/refreshes `RouteExceptionComponentCheckedDI` blocks |
| `require-child-route-mount-check` | adds `assertChildRouteMounts(xRoutes)` for collections mounting lazy `loadChildren` |
| `global-exception-registry-match` | mirrors `globalError()` codes into `CraftGlobalExceptionRegistry` |

## The loop

1. **Edit a routed component or route** → keep its `RouteCheckedDI` / `CanRun` block beside the route.
2. **Run ESLint `--fix`** on the changed route file. Exception, pending-component and child-mount
   bookkeeping is added or refreshed.
3. **Read the remaining TypeScript errors** — these are the real DI gaps (`Injected X is not provided…`,
   `Input "y" is not provided…`).

```bash
eslint --fix src/app/feature/feature.routes.ts
```

## Gotchas

- Checks are per-file and per-route; a parent file does not cover a component loaded through
  `loadChildren`.
- Quick fixes are per-file. Run them on each route file you changed.
- Do not commit a green build with a red ESLint result: a missing or unarmed check can otherwise pass
  TypeScript while the architecture test catches it only later.

# ESLint workflow — keep route checks in sync

The route checks, exception asserts and their imports are maintained by the project's ESLint rules.
An ESLint error is not a TypeScript compile error, so run ESLint after editing routes or a component's
dependency shape.

| Rule | Keeps in sync |
| --- | --- |
| `require-assert-exhaustive-route-exceptions` | adds `assertExhaustiveRouteExceptions(xRoutes)` per collection |
| `require-pending-component-di-check` | generates/refreshes the `RouteCheckedDI` block for a `pendingComponent` |
| `require-exception-component-di-check` | generates/refreshes `RouteExceptionComponentCheckedDI` blocks |
| `require-child-route-mount-check` | adds `assertChildRouteMounts(xRoutes)` for lazy `loadChildren` |

Run the fixer on each changed route file, then resolve the remaining TypeScript DI errors:

```bash
eslint --fix src/app/feature/feature.routes.ts
```

Checks are per-file and per-route; a parent file does not cover a component loaded through
`loadChildren`. Do not omit `CanRun`: it consumes the check and turns a mismatch into a compile error.

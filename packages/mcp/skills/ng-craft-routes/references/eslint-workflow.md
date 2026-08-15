# ESLint workflow — let the rules keep the checks in sync

The route DI checks, the `GenDeps_*` aliases, the asserts and their imports are **generated and refreshed
by ESLint**, not hand-written. This matters because an ESLint error is **not** a TypeScript compile error:
a stale or missing check passes the build while silently hiding real DI bugs. So the discipline is: after
touching routes or a component's DI shape, run `--fix` and trust the rules to regenerate the bookkeeping.

## The routing-relevant rules

Enable these in the flat ESLint config (plugin exposed as `@craft-ng/dev-tools/eslint-rules`, registered
under the `craft-ng/` namespace):

| Rule | Keeps in sync |
| --- | --- |
| `brand-angular-gen-deps-required` | creates a missing `GenDeps_*` alias for a component/directive/pipe |
| `brand-angular-deps-match` | refreshes an existing `GenDeps_*` when the component's DI changes |
| `component-test-gen-deps-match` | the `GenDeps_*` passed in component tests |
| `require-assert-exhaustive-route-exceptions` | adds `assertExhaustiveRouteExceptions(xRoutes)` (+ import) per collection |
| `require-pending-component-di-check` | generates/refreshes the `RouteCheckedDI` block for a `pendingComponent` |
| `require-child-route-mount-check` | adds `assertChildRouteMounts(xRoutes)` (+ import) for collections mounting lazy `loadChildren` |
| `global-exception-registry-match` | mirrors `globalError()` codes into `CraftGlobalExceptionRegistry` |

> The aggregated `ValidateCascadeRoutesFile<…>` check itself is **not** auto-generated (its parent context
> can't be guessed across files). Write that one block by hand per file — see di-checks.md — and let the
> rules above handle everything else.

## The loop

1. **Create/edit a routed component** → run the Quick Fix `brand-angular-gen-deps-required` (or
   `brand-angular-deps-match` if it already has a `GenDeps_*`), or the project's `craft:brand` codemod, to
   (re)generate the alias.
2. **Edit the routes file** → run ESLint `--fix` on it. The asserts, the pending-component `RouteCheckedDI`
   block, the child-mount assert and their imports are added/refreshed.
3. **Read the remaining TypeScript errors** — those are the real DI gaps (`Injected X is not provided…`,
   `Input "y" is not provided…`). Fix by providing the service / adding the input / correcting the route.

```bash
# one file
eslint --fix src/app/feature/feature.routes.ts
# the component whose DI changed
eslint --fix src/app/feature/feature-detail.ts
```

## Gotchas

- **Quick Fix is per-file.** It won't cascade to other files; run it on each file you changed.
- **Rename a component class → rerun the generator** so the `GenDeps_*` alias name stays aligned with the
  class name.
- **Flat config resolves rules from the CWD.** If `--fix` seems to do nothing, run it from the directory
  whose ESLint config actually enables the `craft-ng/*` rules (often the app project root, not the repo
  root).
- **Don't commit a green build with a red ESLint.** Because the ESLint error isn't a compile error, a route
  can build fine while its check is stale — CI should run both.

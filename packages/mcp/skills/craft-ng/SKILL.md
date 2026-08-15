---
name: craft-ng
description: Write and review @craft-ng/core code in an app that imported Craft NG. Use when adding state, query, mutation, queryParams, asyncProcess, craftService, craftComponent, craftRoutes, forms, or when the user mentions ng-craft, craft-ng, yield*, or coding-agent setup.
---

# Craft NG

You are working in an application that depends on `@craft-ng/core`.

## First steps

1. Call the Craft NG MCP tool `get_best_practices` when it is available.
2. Search docs with `search_documentation` before inventing an API.
3. Load a workflow skill with `get_skill` when the task matches:
   - `ng-craft-architecture-tests` — scaffold or run `architecture/`, or freeze a graph smell. Not before every feature.
   - `translate-spec-to-ng-craft` — map a spec onto primitives
   - `ng-craft-routes` — type-safe routes and DI checks
   - `ng-craft-service-migration` — Angular services → `craftService`
   - `migrate-to-ng-craft` — run `craft-migrate`, then finish diagnostics

If MCP is not configured, read https://ng-angular-stack.github.io/craft/llms.txt and the `AGENTS.md` snippet in this package (`content/agents.md`).

## Hard rules

- `yield*` every Craft reader. Use `craftUse` only at synchronous boundaries.
- `state` / `query` / `mutation` / `queryParams` / `asyncProcess` — not `signal()`.
- One insertion per primitive; compose with `craftPipe`.
- `craftService` + generated `X()` helpers. No new `inject()` / `@Injectable`.
- `craftRoutes` + `componentDeps` + a per-file DI check. Split on `TS2589`.
- Run existing architecture tests. Do not add an architecture rule for the feature.
- Confirm symbols against the installed `node_modules/@craft-ng/core`.

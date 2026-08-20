---
name: craft-ts
description: Write and review framework-independent @craft-ts/core applications. Use when creating or evolving a CraftTS project, adding state, query, mutation, queryParams, asyncProcess, craftService, craftComponent, craftRoutes, forms, API boundaries, or coding-agent setup.
---

# CraftTS

You are working in a framework-independent application that depends on
`@craft-ts/core`. The default renderer is `@craft-ts/component`; Angular is not
required and must not be introduced just to solve a Craft problem.

## First steps

1. Call the CraftTS MCP tool `get_best_practices` when it is available.
2. Search docs with `search_documentation` before inventing an API.
3. Load a workflow skill with `get_skill` when the task matches:
   - `craft-ts-architecture-tests` — scaffold or run `architecture/`, or freeze a graph smell. Not before every feature.
   - `translate-spec-to-craft-ts` — map a spec onto primitives
   - `craft-ts-routes` — type-safe routes and DI checks
   - `craft-ts-service-migration` — Angular services → `craftService`
   - `migrate-to-craft-ts` — run `craft-migrate`, then finish diagnostics
   - `craft-ts-effect-v4` — use Effect v4 services, Layers and `queryEffect`

If MCP is not configured, read https://ng-angular-stack.github.io/craft/llms.txt and the `AGENTS.md` snippet in this package (`content/agents.md`).

## Hard rules

- `yield*` every Craft reader. Use `craftUse` only at synchronous boundaries.
- `state` / `query` / `mutation` / `queryParams` / `asyncProcess` — not `signal()`.
- One insertion per primitive; compose with `craftPipe`.
- `craftService` + generated `X()` helpers. No new `inject()` / `@Injectable`.
- `craftRoutes` + `componentDeps` + a per-file DI check. Split on `TS2589`.
- Use `bootstrapCraft` and `provideCraftRouter` for a browser app; do not
  bootstrap Angular.
- Run existing architecture tests. Do not add an architecture rule for the feature.
- Confirm symbols against the installed `node_modules/@craft-ts/core`.

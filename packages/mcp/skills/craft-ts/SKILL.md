---
name: craft-ts
description: Write and review framework-independent @craft-ts/core applications, including CSR and SSR. Use when creating or evolving a CraftTS project, adding state, query, mutation, queryParams, asyncProcess, craftService, craftComponent, craftRoutes, forms, SSR rendering or hydration, API boundaries, or coding-agent setup.
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
   - `craft-ts-effect-v4` — use Effect v4 services, Layers, `queryEffect`, and
     the synchronous-member declaration (`SyncOp` / `computedEffect`)

For a project created by `craft create`, keep the generated development
surface enabled. Run `npm run logs:server` for the local JSONL ingestion
server and `npm run registry:mcp` for the browser page MCP bridge; the
generated `.mcp.json` also registers the Craft guidance and log-reader MCP
servers. Use Craft `Console.*` for entries that must be searchable through
`npm run logs:mcp`; raw `console.*` calls stay in the browser or server
process console. These facilities are development-only and must not be added
to a production provider graph.

If MCP is not configured, read https://ng-angular-stack.github.io/craft/llms.txt and the `AGENTS.md` snippet in this package (`content/agents.md`).

## Hard rules

- `yield*` every Craft reader. Use `craftUse` only at synchronous boundaries.
- `state` / `query` / `mutation` / `queryParams` / `asyncProcess` — not `signal()`.
- One insertion per primitive; compose with `craftPipe`.
- `craftService` + generated `X()` helpers. No new `inject()` / `@Injectable`.
- `craftRoutes` + `componentDeps` + a per-file DI check. Split on `TS2589`.
- Use `startCraft` and `provideCraftRouter` for a browser app that may receive
  SSR HTML. It hydrates a host marked by Craft SSR and mounts a fresh client
  tree otherwise. Use `bootstrapCraft` when a fresh client mount is explicitly
  required, and `hydrateCraft` when hydration must be forced or customized.
- Use `renderCraft` for one isolated SSR request. Create a new render per
  request; never reuse its injector, platform, primitive registry, or history.
- Keep SSR data behavior explicit with `pendingBlock({ ssr: 'block' | 'fallback' | 'client' })`
  or a route-level `ssr` policy. Do not let a suspended source reach SSR
  without a policy.
- Run existing architecture tests. Do not add an architecture rule for the feature.
- Keep `npm run typecheck` in the project CI; for generated projects this is
  already wired into `.github/workflows/ci.yml` alongside the architecture
  and build checks.
- Confirm symbols against the installed `node_modules/@craft-ts/core`.

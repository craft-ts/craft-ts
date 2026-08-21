# CraftTS

This application uses `@craft-ts/core` without an Angular dependency. Treat
Craft APIs as the default. Use Craft primitives, services, components,
`CraftHttpClient`, `startCraft` (or explicit `bootstrapCraft` / `hydrateCraft`),
and `provideCraftRouter` in authored code.

For SSR, use `renderCraft` to render one isolated request. On the browser,
`startCraft` automatically hydrates Craft SSR HTML or mounts a fresh client tree.

## Before writing Craft code

1. Read https://craft-ts.github.io/craft/llms.txt and follow the linked markdown pages.
2. If the CraftTS MCP server is configured, call `get_best_practices`, then `search_documentation` / `get_skill` instead of guessing APIs.
3. Skills live in `node_modules/@craft-ts/mcp/skills/` (architecture tests, routes, spec translation, service migration, full-app migration).

## Non-negotiable rules

- `yield*` every Craft reader (`state`, `query.value()`, service helpers). Use `craftUse` only at synchronous boundaries such as tests.
- One primitive family: `state` / `query` / `mutation` / `queryParams` / `asyncProcess`. Compose insertions with `craftPipe`.
- `craftService` + generated `X()` helpers for explicit dependency composition.
- `craftRoutes` + `componentDeps` + a per-file DI check. Split with `loadChildren` on `TS2589`.
- Enable `@craft-ts/dev-tools` ESLint rules and run `eslint --fix` after DI or route edits.
- The `architecture/` suite is the graph contract. `craft create` scaffolds it
  at bootstrap and adds `npm run architecture`. Run it during a feature. Do not
  add an architecture rule for the feature; encode a smell only when it is a
  recurring product invariant not covered by a baseline helper.

## Docs

- Tutorial: https://craft-ts.github.io/craft/learn/
- Guide: https://craft-ts.github.io/craft/guide/
- API index: https://craft-ts.github.io/craft/reference/
- Coding agents: https://craft-ts.github.io/craft/resources/ai-agents
- Local dev: drive the open `ng serve` tab with the function-registry MCP tool `page` (https://craft-ts.github.io/craft/guide/ai/dev-page). That tool is not part of `@craft-ts/mcp`.

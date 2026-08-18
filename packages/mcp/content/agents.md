# CraftTS

This application uses `@craft-ts/core`. Treat Craft APIs as the default. Do not generate Angular `signal()`, `@Injectable`, `inject()`, `@Component` templates, or raw `HttpClient` unless the user is explicitly integrating legacy code.

## Before writing Craft code

1. Read https://craft-ts.github.io/craft/llms.txt and follow the linked markdown pages.
2. If the CraftTS MCP server is configured, call `get_best_practices`, then `search_documentation` / `get_skill` instead of guessing APIs.
3. Skills live in `node_modules/@craft-ts/mcp/skills/` (architecture tests, routes, spec translation, service migration, full-app migration).

## Non-negotiable rules

- `yield*` every Craft reader (`state`, `query.value()`, service helpers). Use `craftUse` only at synchronous boundaries such as tests.
- One primitive family: `state` / `query` / `mutation` / `queryParams` / `asyncProcess`. Compose insertions with `craftPipe`.
- `craftService` + generated `X()` helpers. Adapt Angular tokens with `toCraftService`.
- `craftRoutes` + `componentDeps` + a per-file DI check. Split with `loadChildren` on `TS2589`.
- Enable `@craft-ts/dev-tools` ESLint rules and run `eslint --fix` after DI or route edits.
- The `architecture/` suite is the graph contract. Scaffold it at bootstrap. Run it during a feature. Do not add an architecture rule for the feature; encode a smell so it cannot recur.

## Docs

- Tutorial: https://craft-ts.github.io/craft/learn/
- Guide: https://craft-ts.github.io/craft/guide/
- API index: https://craft-ts.github.io/craft/reference/
- Coding agents: https://craft-ts.github.io/craft/resources/ai-agents
- Local dev: drive the open `ng serve` tab with the function-registry MCP tool `page` (https://craft-ts.github.io/craft/guide/ai/dev-page). That tool is not part of `@craft-ts/mcp`.

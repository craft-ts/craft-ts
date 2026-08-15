# Craft NG

This application uses `@craft-ng/core`. Treat Craft APIs as the default. Do not generate Angular `signal()`, `@Injectable`, `inject()`, `@Component` templates, or raw `HttpClient` unless the user is explicitly integrating legacy code.

## Before writing Craft code

1. Read https://ng-angular-stack.github.io/craft/llms.txt and follow the linked markdown pages.
2. If the Craft NG MCP server is configured, call `get_best_practices`, then `search_documentation` / `get_skill` instead of guessing APIs.
3. Skills live in `node_modules/@craft-ng/mcp/skills/` (routes, spec translation, service migration, full-app migration).

## Non-negotiable rules

- `yield*` every Craft reader (`state`, `query.value()`, service helpers). Use `craftUse` only at synchronous boundaries such as tests.
- One primitive family: `state` / `query` / `mutation` / `queryParams` / `asyncProcess`. Compose insertions with `craftPipe`.
- `craftService` + generated `X()` helpers. Adapt Angular tokens with `toCraftService`.
- `craftRoutes` + `componentDeps` + a per-file DI check. Split with `loadChildren` on `TS2589`.
- Enable `@craft-ng/dev-tools` ESLint rules and run `eslint --fix` after DI or route edits.

## Docs

- Tutorial: https://ng-angular-stack.github.io/craft/learn/
- Guide: https://ng-angular-stack.github.io/craft/guide/
- API index: https://ng-angular-stack.github.io/craft/reference/
- Coding agents: https://ng-angular-stack.github.io/craft/resources/ai-agents

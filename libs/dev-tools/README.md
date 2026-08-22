# @craft-ts/dev-tools

Development tools for CraftTS: ESLint rules, codemods, route automation, and
static dependency-graph tooling.

## Installation

```bash
npm install -D @craft-ts/dev-tools@beta
```

For coding agents, also install
[`@craft-ts/mcp`](https://www.npmjs.com/package/@craft-ts/mcp) and follow the
[coding-agent guide](https://craft-ts.github.io/craft/resources/ai-agents).

## Create a project

Create a framework-independent CraftTS application from scratch. The command
asks for the Effect v4 choice first in interactive mode because it changes the
dependencies, generated API boundary, and agent skills:

```bash
npx craft create my-app
npx craft create my-app --effect=v4 --agents=codex,cursor,cloud-code
npx craft create my-app --effect=none --agents=none
```

The starter includes a routed page, a typed API call, flat-config ESLint, unit
tests, a graph-wide `architecture/` suite, Playwright E2E tests, development
logs forwarded to a local JSONL server, `.mcp.json` for Craft/log/page MCP
servers, a browser type-check indicator, and a GitHub Actions workflow with an
explicit `npm run typecheck` gate. `codex`, `cursor`, `claude-code`, and the
`cloud-code`/`gemini` aliases install the corresponding project instructions.

## Project configuration

Create `craft-dev-tools.config.ts` when a project needs shared codemod or
service-migration options:

```ts
import { defineCraftDevToolsConfig } from '@craft-ts/dev-tools';

export default defineCraftDevToolsConfig({
  serviceMigration: {
    overrides: [
      {
        file: 'src/legacy-api.ts',
        symbol: 'LegacyApi',
        name: 'Api',
        providedIn: 'manuallyProvidedAtRoot',
        strategy: 'craftService',
      },
    ],
  },
});
```

## Migration tooling

`craft-migrate` applies the codemods in dependency order and reports decisions
that need human review:

```bash
craft-migrate --project tsconfig.app.json --root src --dry-run
craft-migrate --project tsconfig.app.json --root src --write
craft-migrate --project tsconfig.app.json --root src --check --fail-on-manual
```

The individual stages are available for focused work:

```bash
craft-migrate-primitives --project tsconfig.app.json --root src --write
craft-migrate-services --project tsconfig.app.json --root src --write
craft-migrate-routes --project tsconfig.app.json --root src --write
craft-migrate-components --project tsconfig.app.json --root src --write
craft-migrate-architecture --project tsconfig.app.json --root src --write
```

The migration keeps ambiguous code intact and emits a diagnostic instead of
guessing business or lifecycle semantics. Use `--json <path>` for a report.

For standalone markup conversion:

```bash
printf '<section><h2>Hello</h2></section>' | craft-migrate-template
```

## Route automation

The `craft` façade writes ordinary editable TypeScript while keeping route
metadata, lazy loading, and dependency proofs aligned:

```bash
npx craft route add /users/:userId \
  --component src/users/user-detail.ts#UserDetail
npx craft route add /users/:userId --create-component users/user-detail
npx craft route split \
  --parent src/app.routes.ts#appRoutes \
  --prefix users \
  --target src/users/users.routes.ts
```

Use `--dry-run`, `--yes`, and `--json` for scripted workflows. The generator
adds `componentDeps`, `withRetry`, parent-mount assertions, and the file-level
route DI proof where applicable.

## Static dependency graph

`craft-graph` analyses one TypeScript program and writes JSON, Mermaid, or HTML
artifacts:

```bash
craft-graph \
  --project apps/demo/tsconfig.graph.json \
  --out craft-dependency-graph \
  --format both
```

The graph records services, primitives, route ownership, HTTP endpoints,
browser boundaries, and dependency edges. It can be extended with a catalog for
backend or other TypeScript sources.

## ESLint rules

```ts
import craftRules from '@craft-ts/dev-tools/eslint-rules';

export default [
  {
    files: ['**/*.ts'],
    ...craftRules.configs.recommended,
  },
];
```

The rules cover, among other things:

- declarative template blocks and granular reactive bindings;
- yieldable reads, writes, methods, and resource triggers;
- transport access through `CraftHttpClient`;
- typed route loading, dependency proofs, and exception handling;
- pure computed values, browser boundaries, and accessibility contracts.

Run `eslint --fix` after changing generated dependency aliases or route
metadata. Keep the generated aliases and proofs in the source file so the
compiler and architecture suite can verify them.

## Editor and AI workflows

The same ESLint fixes and codemods can be called by editors and coding agents.
For a complete workflow, see:

- [Routing setup](https://craft-ts.github.io/craft/guide/routing/setup)
- [ESLint rules](https://craft-ts.github.io/craft/guide/routing/eslint-rules)
- [Migration](https://craft-ts.github.io/craft/resources/migration)
- [Coding agents](https://craft-ts.github.io/craft/resources/ai-agents)

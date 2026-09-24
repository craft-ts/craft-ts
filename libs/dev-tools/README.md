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

Create a framework-independent CraftTS application from scratch. Runtime axes,
i18n, design-system, typed-CSS, server-function, workspace and reference
choices are normalized into one effective configuration:

```bash
npx --yes --package @craft-ts/dev-tools@beta craft create my-app
npx --yes --package @craft-ts/dev-tools@beta craft create my-app --effect=v4 --agents=codex,cursor,claude-code
npx --yes --package @craft-ts/dev-tools@beta craft create my-app --effect=none --agents=none
npx --yes --package @craft-ts/dev-tools@beta craft create my-app --effect=none --i18n=none --design-system=none
npx --yes --package @craft-ts/dev-tools@beta craft create my-app --frontend-runtime=effect --backend-runtime=effect --i18n=strict
npx --yes --package @craft-ts/dev-tools@beta craft create my-app --frontend-runtime=plain --backend-runtime=effect
npx --yes --package @craft-ts/dev-tools@beta craft create apps/my-app --workspace=nx --references=craft-ts
npx --yes --package @craft-ts/dev-tools@beta craft create apps/my-app --frontend-runtime=effect --references=all
```

In a terminal, creation is interactive by default. The first question asks
whether the application is frontend-only or full-stack. Full-stack projects
then choose a backend runtime, with EffectTS recommended; the frontend runtime
is chosen afterwards. The prompts also cover i18n locales, the design system,
typed CSS, the workspace, and agent integrations. CraftTS source references
are enabled automatically, with EffectTS references added whenever EffectTS is
selected. All closed configuration values use keyboard menus: `↑`/`↓` to move
and `Enter` to confirm; locales and agent integrations additionally use
`Space` for multi-selection. Codex is selected by default. Pass
`--yes` after `create` to disable all prompts, or pass
`--agents=codex,cursor` / `--agents=none` for scripted agent selection.

The same defaults apply in non-interactive mode. Use `--references=none` to
opt out, or `--references=craft-ts` / `--references=all` to choose explicitly.

New standalone projects are initialized with Git. Projects without references
have no initial commit; projects with references receive the minimal initial
history required by `git subtree`. The generated `.gitignore` covers
`node_modules/`, build outputs, and test reports. If the destination is already
inside another Git repository, no nested repository is created.

Canonical options include `--frontend-runtime=plain|effect`,
`--backend-runtime=none|promise|effect`, `--effect-scope=none|frontend|backend|both`,
`--i18n=strict|loose|none`, `--design-system=basic|none`, `--workspace=standalone|nx`, and
`--references=none|craft-ts|all`.
`--effect=v4|none`, `--locales` and `--default-locale` remain compatible aliases.
`--json` includes the complete effective configuration.

With references enabled, `.references/manifest.json` records the requested ref
and resolved SHA. The subtrees are read-only context for coding agents: they
are not installed as application dependencies, and generated TypeScript/Vite
configuration never points at them. The application uses the published npm
packages declared in `package.json`. Refresh subtrees with
`npm run update:references` (or the generated `update:craft-ts`/
`update:effect-ts` scripts).

The starter includes a routed page, a typed API call, flat-config ESLint, unit
tests, a graph-wide `architecture/` suite, Playwright E2E tests, development
logs forwarded to a local JSONL server, `.mcp.json` for Craft/log/page MCP
servers, a browser type-check indicator, and a GitHub Actions workflow with an
explicit `npm run typecheck` gate. `codex`, `cursor`, and `claude-code` install
the corresponding project instructions and skills. The legacy `cloud-code` and
`gemini` values remain accepted as aliases for Gemini CLI output.

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

## Folder layout proposal

For CraftTS projects with a fresh `DependencyGraph v1`, `craft organize` builds
a deterministic file projection and writes a read-only folder layout proposal:

```bash
craft organize \
  --project apps/demo/tsconfig.graph.json \
  --graph craft-dependency-graph.json \
  --out folder-layout
```

The command refuses an obsolete or invalid graph and never rebuilds it or moves
files. It writes `folder-layout-analysis.json`,
`folder-layout-proposal.json`, and `FOLDER_LAYOUT_REPORT.md`.

The layout is feature first. Each route anchors a feature folder on its full
path (a collection loaded by a route nests under it; route params are not
folders). A file belongs to the features that use it, following CraftTS
relations from user to used; imports only decide for files the graph says
nothing about. A file then goes to:

- `core/` — `main`/`app.*` files, app config, global boundaries, and what the
  application shell reaches (`main.ts` itself stays in place);
- `features/<route>/` — the one feature using it, or the deepest one when its
  users sit on a single route lineage;
- `features/<ancestor>/` — the common ancestor feature of sibling users;
- `shared/` — only what several top-level features use.

Existing directory names are not used as architectural evidence. Use `--target-root` when the
proposed application root should not be inferred from the project tsconfig.

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
- state-owned transitions: callers send intent to named state methods instead
  of calculating a replacement value and writing it through generic mutators;
- yieldable reads, writes, methods, and resource triggers;
- transport access through `CraftHttpClient`;
- typed route loading, dependency proofs, and exception handling;
- pure computed values, browser boundaries, and accessibility contracts;
- the security preset, included in `recommended` and `effect`: unchecked DOM
  URLs, raw HTML, dynamic code, implicit SSR transfer, server functions
  without limits or explicit per-function error exposure, forwarded headers, and
  authentication material in browser storage.

The recommended and Effect presets also enable
`craft-ts/no-external-state-transition`. Projects generated by `craft create`
receive it through those presets. Existing projects that spread the preset
dynamically receive it after upgrading `@craft-ts/dev-tools`; projects with a
hand-curated rule list must add it themselves. The rule is an error, so existing
generic state writes will need to move behind named state commands.

Apply the preset alone — on a library or a tooling folder that does not take
`recommended` — with `craftRules.configs.security`.

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

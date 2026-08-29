<p align="center">
  <img src="apps/docs/public/assets/craft-ts-logo.png" alt="craft-ts logo" width="160" />
</p>

<h1 align="center">@craft-ts/core</h1>

<p align="center">
  Type-safe, declarative building blocks for applications.<br />
  <strong>Declare. Yield. Derive. Compile — no surprises.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@craft-ts/core">npm</a> ·
  <a href="https://craft-ts.github.io/craft/">Documentation</a> ·
  <a href="https://github.com/craft-ts/craft-ts/issues">Issues</a> ·
  <a href="https://github.com/craft-ts/craft-ts/discussions">Discussions</a>
</p>

> [!WARNING]
> `@craft-ts/core` is currently in beta. APIs and documentation may evolve before a stable release.

## What is craft-ts?

craft-ts is a Signal-first toolkit for modeling state, asynchronous work, services, forms, dependency injection, and routes with explicit dependencies and strong TypeScript inference. RxJS remains optional.

It is designed to keep application behavior close to where it is used while making dependency graphs visible to the compiler and to tests.

### Main capabilities

- **One reactive model for every kind of state** — `state`, `query`, `mutation`, `asyncProcess`, and `queryParams` cover local, server, asynchronous, and URL state.
- **Composable behavior** — insertions add reusable capabilities such as persistence, entity management, selection, pagination placeholders, and optimistic updates.
- **Function-based services** — `craftService` composes state and dependencies with explicit scopes and typed providers.
- **Type-safe routing and DI** — typed dependency injection, navigation, route inputs, route providers, guards, pending UI, and lazy-load error handling.
- **Derived forms** — form state, validation, submission, and interdependent logic remain reactive and declarative.
- **Deterministic testing** — tests describe the real dependency graph and can isolate browser or platform boundaries explicitly.
- **Observability by design** — exceptions, correlations, and application state can be captured where failures occur.
- **A typed design system** — `@craft-ts/style` makes a component's visual surface derivable rather than guessed: no value is a string, no class is built at run time, and the exhaustive set of visual states is something you can enumerate and capture. The CSS is emitted at build time by a Vite plugin.
- **Type-safe internationalisation** — `@craft-ts/i18n` closes the key set, checks every locale for parity, types each message parameter by its token, and requires the plural categories the locale actually needs. It imports no framework and no Effect.

## Installation

`@craft-ts/core` and `@craft-ts/component` provide the runtime and component
model. Node.js 20.19+ (or 22.12+) and TypeScript 7+ are required.

```bash
npm install @craft-ts/core@beta @craft-ts/component@beta
npm install -D @craft-ts/dev-tools@beta
```

The packages are currently published on the `beta` channel. `@craft-ts/core`
provides the reactive primitives, `@craft-ts/component` provides functional
components, and `@craft-ts/dev-tools` provides the codemods and
ESLint rules used by the type-safe DI and routing workflow.

## Quick start

Create granular state and derive its public API directly from it:

```ts
import { button, craftComponent, p } from '@craft-ts/component';
import { craftComputed, state } from '@craft-ts/core';

export const Counter = craftComponent(
  'Counter',
  {},
  function* () {
    const counter = yield* state('counter', 0, ({ state, update, set }) => ({
      increment: () => update((value) => value + 1),
      reset: () => set(0),
      doubled: craftComputed(function* () {
        return (yield* state()) * 2;
      }),
    }));
    return { counter };
  },
  ({ counter }) => [
    p(function* () {
      return `Count: ${yield* counter()} (doubled: ${yield* counter.doubled()})`;
    }),
    button({ click: counter.increment }, 'Increment'),
  ],
);
```

When logic must be shared, package the same primitives in a named service:

```ts
import { craftService, state } from '@craft-ts/core';

const { Counter } = craftService(
  { name: 'Counter', scope: 'global' },
  function* () {
    const counter = yield* state('counter', 0, ({ update }) => ({
      increment: () => update((value) => value + 1),
    }));
    return counter;
  },
);

const { CounterConsumer } = craftService(
  { name: 'CounterConsumer', scope: 'global' },
  function* () {
    const counter = yield* Counter();
    return counter;
  },
);
```

Continue with the [getting-started guide](https://craft-ts.github.io/craft/learn), then explore:

- [Reactive primitives](https://craft-ts.github.io/craft/guide/state/local-state)
- [Services and dependency composition](https://craft-ts.github.io/craft/guide/app/craft-service)
- [Forms](https://craft-ts.github.io/craft/guide/forms)
- [Type-safe DI and routing](https://craft-ts.github.io/craft/guide/routing/setup)
- [Runnable examples](https://craft-ts.github.io/craft/resources/examples)
- [Migration tooling](https://craft-ts.github.io/craft/resources/migration)

## Repository structure

This repository is an npm workspace managed with Nx.

```text
apps/
├── demo/                       examples and integration checks
│                               (`architecture/` — static graph Vitest suite)
├── demo-effect/                dedicated EffectTS + CraftTS examples
├── demo-ssr/                   server-side rendering and hydration
├── demo-with-server-function/  the server-function proof of concept
├── quickstart-effect/          minimal executable EffectTS starter
├── log-server/                 local JSONL log ingestion (@craft-ts/log-server)
└── docs/                       VitePress documentation and its tests
libs/
├── core/            @craft-ts/core — primitives, services, routing, forms
├── component/       @craft-ts/component — the renderer and typed templates
├── effect/          @craft-ts/effect — the Effect v4 bridge and adapters
├── style/           @craft-ts/style — the typed design system
├── style-testing/   @craft-ts/style-testing — the visual scenario matrix
├── i18n/            @craft-ts/i18n — type-safe, framework-independent i18n
├── i18n-effect/     @craft-ts/i18n-effect — the Effect adapter for i18n
├── dev-tools/       @craft-ts/dev-tools — codemods, ESLint rules, the graph
├── cli/             @craft-ts/cli — the `craft-ts` binary
├── deploy/          @craft-ts/deploy — the deployment manifest and checks
├── deploy-alchemy/  @craft-ts/deploy-alchemy — the Alchemy provider
└── test-type/       compile-time type test utilities (not published)
packages/
├── mcp/                    @craft-ts/mcp — docs and skills for coding agents
├── log-mcp/                @craft-ts/log-mcp — reads the local log store
├── function-registry-mcp/  @craft-ts/function-registry-mcp — the page surface
└── post-devto/             internal publishing helper
tools/
└── generators/    Nx generators and type-stress fixtures
```

### Local source references

The EffectTS v4 source is vendored at `.references/effect-ts` with `git
subtree` for exploring its implementation, types, tests, and examples.
`.references/manifest.json` records the pinned ref and resolved source SHA.
Refresh it with:

```bash
npm run update:references
```

The application continues to use the published npm packages from the
workspace dependencies; the subtree is read-only reference material only.

## Development

### Prerequisites

- Node.js 20.19+ (or 22.12+)
- npm

Install the exact dependency versions from the lockfile:

```bash
npm ci
```

### Run the project locally

Start the Craft demo:

```bash
npx nx serve demo
```

Start the dedicated EffectTS + CraftTS demo:

```bash
npx nx serve demo-effect
```

Start the minimal EffectTS + CraftTS quickstart:

```bash
npx nx serve quickstart-effect
```

The quickstart runs at `http://localhost:4202` and is also the smallest CI
fixture for the Effect ESLint, EffectTS diagnostics and architecture rules.

La commande lance toutes les routes définies dans
`apps/demo/src/app/app.routes.ts`. Le type-check de la démo est exécuté en
parallèle du serveur Vite. Pendant son exécution, un indicateur discret
`Type checking in progress…` apparaît en haut à droite de la page.
Si le contrôle échoue, un grand overlay signale l’erreur mais le serveur reste
accessible pour continuer l’investigation.

### Production mode

Les points d’entrée `bootstrapCraft` et `startCraft` sélectionnent explicitement
le mode d’exécution :

```ts
bootstrapCraft({
  config: appConfig,
  mode: import.meta.env.DEV ? 'development' : 'production',
});
```

En mode `production`, les traces Craft et la collecte de snapshots de debug sont
ignorées. Les fonctionnalités nécessaires au rendu, au SSR et à l’hydratation
restent actives. Les bridges MCP, le forwarding de logs et les outils de debug
doivent être ajoutés uniquement dans des providers conditionnés par
`import.meta.env.DEV`.

Pour vérifier les bundles déployables :

```bash
npm run production:check
```

Start the documentation site at `http://localhost:5173`:

```bash
npx nx dev docs
```

### Make a change

1. Find the relevant implementation under `libs/core/src/` or `libs/dev-tools/src/`.
2. Add or update focused tests next to the affected code.
3. Update the matching page under `apps/docs/`; the documentation is the reference for public behavior.
4. Add or update an example in `apps/demo/` when the change benefits from an executable use case.
5. Run the focused Nx targets while iterating, then run the full validation suite before opening a pull request.

Useful focused commands:

```bash
npx nx test craft-ts-core
npx nx lint craft-ts-core
npx nx build craft-ts-core
npx nx test docs
npx nx build docs
npx nx architecture demo
```

`npx nx architecture demo` runs the Vitest suite in `apps/demo/architecture/`.
See [apps/demo/README.md](apps/demo/README.md) for the commands and the rules
it imports.

Inspect all targets available for a project with:

```bash
npx nx show project craft-ts-core
```

### Validate before submitting

Run the same core checks as CI:

```bash
npx nx format:check
npx nx run-many -t lint test build typecheck e2e-ci
```

To automatically format changed files first:

```bash
npx nx format:write
```

### Documentation contributions

Documentation pages live in `apps/docs/` and the sidebar is configured in `apps/docs/.vitepress/config.mts`.

When documenting a public API:

- place the page in the matching domain folder (`primitives`, `insertions`, `store`, `forms`, `utils`, or `type-safe-di-routes`);
- show the relevant import statement;
- favor complete, compilable examples;
- add the page to the VitePress sidebar when necessary;
- run both `npx nx test docs` and `npx nx build docs`.

## Releases

Every `@craft-ts/*` package listed above is released together, from one local
command, under a single version and Git tag. `releasePackages` in
[`tools/release.mjs`](tools/release.mjs) is the source of truth for that list;
see [RELEASING.md](RELEASING.md).The command versions and builds the packages, publishes to npm, deploys the
built documentation, and synchronizes the main StackBlitz demo plus the
dedicated frontend EffectTS demo:

```bash
npm run release:local -- patch
npm run release:local -- minor
npm run release:local -- major
```

An exact version, including a prerelease, is also accepted:

```bash
npm run release:local -- 0.6.0-beta.3
```

Beta releases use an explicit `-beta.N` version. Increment `N` for each beta;
the command automatically publishes it under the npm `beta` dist-tag and marks
the GitHub Release as a prerelease.

See [RELEASING.md](RELEASING.md) for the required sibling workspaces, safe
preview, authentication, supported versions, and recovery guidance.

## Contributing

Bug reports, design discussions, documentation improvements, and pull requests are welcome. For substantial API changes, open a [discussion](https://github.com/craft-ts/craft-ts/discussions) or an [issue](https://github.com/craft-ts/craft-ts/issues) first so the intended behavior can be agreed before implementation.

## License

MIT © Romain Geffrault

<p align="center">
  <img src="apps/docs/public/assets/ng-craft-logo.png" alt="ng-craft logo" width="160" />
</p>

<h1 align="center">@craft-ng/core</h1>

<p align="center">
  Type-safe, declarative building blocks for Angular applications.<br />
  <strong>Declare. Yield. Derive. Compile — no surprises.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@craft-ng/core">npm</a> ·
  <a href="https://ng-angular-stack.github.io/craft/">Documentation</a> ·
  <a href="https://github.com/ng-angular-stack/ng-craft/issues">Issues</a> ·
  <a href="https://github.com/ng-angular-stack/ng-craft/discussions">Discussions</a>
</p>

> [!WARNING]
> `@craft-ng/core` is currently in beta. APIs and documentation may evolve before a stable release.

## What is ng-craft?

ng-craft is a Signal-first toolkit for modeling Angular state, asynchronous work, services, forms, dependency injection, and routes with explicit dependencies and strong TypeScript inference. RxJS remains optional.

It is designed to keep application behavior close to where it is used while making dependency graphs visible to the compiler and to tests.

### Main capabilities

- **One reactive model for every kind of state** — `state`, `query`, `mutation`, `asyncProcess`, and `queryParams` cover local, server, asynchronous, and URL state.
- **Composable behavior** — insertions add reusable capabilities such as persistence, entity management, selection, pagination placeholders, and optimistic updates.
- **Function-based services** — `craftService` composes state and dependencies; `toCraftService` adapts existing Angular services and tokens.
- **Type-safe Angular integration** — typed dependency injection, navigation, route inputs, route providers, guards, pending UI, and lazy-load error handling.
- **Derived forms** — form state, validation, submission, and interdependent logic remain reactive and declarative.
- **Deterministic testing** — tests describe the real dependency graph and can isolate browser or platform boundaries explicitly.
- **Observability by design** — exceptions, correlations, and application state can be captured where failures occur.

## Installation

ng-craft currently targets Angular 21. It requires Node.js 20.19+ (or 22.12+)
and TypeScript 5.9+.

```bash
npm install @craft-ng/core@beta @craft-ng/component@beta
npm install -D @craft-ng/dev-tools@beta
```

The packages are currently published on the `beta` channel. `@craft-ng/core`
provides the reactive primitives, `@craft-ng/component` provides selectorless
functional components, and `@craft-ng/dev-tools` provides the codemods and
ESLint rules used by the type-safe DI and routing workflow.

## Quick start

Create granular state and derive its public API directly from it:

```ts
import { button, craftComponent, p } from '@craft-ng/component';
import { craftComputed, state } from '@craft-ng/core';

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
import { craftService, state } from '@craft-ng/core';

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

Continue with the [getting-started guide](https://ng-angular-stack.github.io/craft/learn), then explore:

- [Reactive primitives](https://ng-angular-stack.github.io/craft/guide/state/local-state)
- [Services and dependency composition](https://ng-angular-stack.github.io/craft/guide/app/craft-service)
- [Forms](https://ng-angular-stack.github.io/craft/guide/forms)
- [Type-safe DI and routing](https://ng-angular-stack.github.io/craft/guide/routing/setup)
- [Runnable examples](https://ng-angular-stack.github.io/craft/resources/examples)
- [Migration tooling](https://ng-angular-stack.github.io/craft/resources/migration)

## Repository structure

This repository is an npm workspace managed with Nx.

```text
apps/
├── demo/          Angular application used for examples and integration checks
│                  (`architecture/` — static graph Vitest suite)
└── docs/          VitePress documentation and documentation tests
libs/
├── core/          Published @craft-ng/core package
├── component/     Published @craft-ng/component package
├── dev-tools/     Published codemods and ESLint tooling
└── test-type/     Compile-time type test utilities
tools/
└── generators/    Nx generators and type-stress fixtures
```

## Development

### Prerequisites

- Node.js 20.19+ (or 22.12+)
- npm

Install the exact dependency versions from the lockfile:

```bash
npm ci
```

### Run the project locally

Start the Angular demo:

```bash
npx nx serve demo
```

Au démarrage, la commande propose une sélection interactive des routes de la
démo. Toutes les routes sont cochées par défaut ; utilisez les flèches, la
barre espace, `a`/`t` pour tout sélectionner, `n`/`d` pour tout désélectionner,
puis Entrée. Seules les routes sélectionnées sont générées dans
le graphe de build et dans les checks DI.

Pour éviter le prompt, vous pouvez tout garder ou cibler des routes précises :

```bash
npx nx serve demo --all-routes
npx nx serve demo --demo-routes=query,full-demo
```

Les routes restent maintenues dans `apps/demo/src/app/app.routes.ts`. Pendant
le serveur de développement, le sélecteur génère temporairement
`app.routes.runtime.ts`, puis restaure le relais vers `app.routes.ts` à l'arrêt.

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
npx nx test ng-craft-core
npx nx lint ng-craft-core
npx nx build ng-craft-core
npx nx test docs
npx nx build docs
npx nx architecture demo
```

`npx nx architecture demo` runs the Vitest suite in `apps/demo/architecture/`.
See [apps/demo/README.md](apps/demo/README.md) for the commands and the rules
it imports.

Inspect all targets available for a project with:

```bash
npx nx show project ng-craft-core
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

`@craft-ng/core`, `@craft-ng/component`, and `@craft-ng/dev-tools` are released
together with one local command. It versions and builds the packages, publishes
npm, deploys the built documentation, and synchronizes the complete demo used by
StackBlitz:

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

Bug reports, design discussions, documentation improvements, and pull requests are welcome. For substantial API changes, open a [discussion](https://github.com/ng-angular-stack/ng-craft/discussions) or an [issue](https://github.com/ng-angular-stack/ng-craft/issues) first so the intended behavior can be agreed before implementation.

## License

MIT © Romain Geffrault

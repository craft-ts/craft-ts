# Craft graph vs Nx

Nx organises the **workspace**. The Craft graph judges the **shape of one
app**. They are complementary — comparing `depConstraints` to
`assertHttpEndpointUnique` is comparing a city plan to a wiring diagram.

**Use Nx when** the constraint is about projects, TypeScript imports, or what
CI should rerun.
**Use Craft when** the constraint is about who may yield whom, who owns an
HTTP endpoint, or whether a route proof stayed armed.
**Not instead of** [architecture rules](/guide/testing/architecture) — this
page is the why; that page is the how.

::: tip They already run together
The demo suite is an Nx target: `npx nx architecture demo`. Craft does not
replace Nx; it adds a graph Nx cannot see.
:::

## Two graphs, two altitudes

| | Nx | Craft |
| --- | --- | --- |
| Node | an app or a lib | a route, a service, a `GET users`, a `craftUnique` identity |
| Edge | a TypeScript import (`static` / `dynamic` / `implicit`) | `depends-on`, `provides`, `calls`, `writes`, `checks`, … |
| Question | who may import whom, and what should rerun? | who may yield whom, and who owns this endpoint? |
| Enforcement | ESLint `@nx/enforce-module-boundaries` | Vitest on the graph (`assert*`, `noExclusiveLink`) |
| Visualisation | `nx graph` — projects and tasks, `--affected` | `npx craft-graph --format html` — a route expanding into services and HTTP |

Nx orchestrates. Craft asserts.

## What Nx cannot see

Nx's node is a project. Everything inside `apps/shop/src` is opaque: routes,
providers, `yield*`, HTTP, storage. That is not a bug — the project graph is
built to be cheap enough to drive CI. The holes appear as soon as you want to
judge an **app**, not a workspace.

| Nx sees | Nx misses | Craft counterpart |
| --- | --- | --- |
| `demo` imports `@craft-ts/core` | `yield* CheckoutApi` in the same app | `depends-on` |
| Tags on a lib (`scope:admin`) | Two features that share one app | `assertPathBoundaries`, `noExclusiveLink` |
| A circular import between libs | A service cycle `A → B → A` inside one tsconfig | `assertNoDependencyCycles` |
| That `HttpClient` was imported | That `GET users` is called from two APIs | `assertHttpEndpointUnique` |
| Nothing about storage keys | Two queries sharing a `craftUnique` identity | `assertCraftUnique` |
| Nothing about unused type aliases | A commented-out `CanRun` that still compiles | `assertRouteDiProofs` |
| Nothing about named buttons | Two interactive helpers sharing `data-craft-name` | `assertInteractiveElementNamed` |

Three consequences follow.

**An edge is an import, not DI.** `yield* CheckoutApi` does not cross a project
boundary. Module-boundary ESLint never fires. The Craft graph records it as
`depends-on`.

**Isolation costs a library.** For `depConstraints` to protect a feature, that
feature must be its own project — barrel, tags, often a build. Craft states
the same intention on **folders** and on yield, without extracting forty libs.

**ESLint judges a file.** `@nx/enforce-module-boundaries` sees one import.
`assertHttpEndpointUnique` and `assertRouteDiProofs` see the whole graph,
including lazy `loadChildren` collections a parent proof never covers.

Nx Enterprise Conformance can add workspace rules on the project graph and the
file tree. Recreating Craft's AST analysis (DI, yield, HTTP) there would be
rewriting `@craft-ts/dev-tools`.

## What Craft cannot see

The Craft graph is one TypeScript program (`analyzeDependencyGraph` takes one
tsconfig). It does not become a build system.

| Craft sees | Craft misses | Nx counterpart |
| --- | --- | --- |
| Who yields whom inside an app | Which projects CI should rerun | project graph + `nx affected` |
| Folder lanes on `depends-on` | A deep import that bypasses a lib's `index.ts` | `enforce-module-boundaries` |
| A duplicate `GET users` | Nest imported from a frontend project | `bannedExternalImports` |
| A service cycle in `apps/shop` | `orders` ↔ `customers` as libs | circular project dependencies |
| Craft/Angular TypeScript | Python, Nest, assets, configs | polyglot project graph, implicit deps |
| A failing Vitest assertion | A generator that rewrites the file | Conformance fix generators |
| Seconds of ts-morph analysis | Millisecond cache hits on unchanged libs | local / remote computation cache |

The Craft graph **asserts**. The Nx graph **executes**: what to build, test,
cache, parallelise. Without Nx (or an equivalent), a green architecture suite
does not scale in CI.

`assertPathBoundaries` protects a modular monolith. It does not split the
**task** graph. Changing one feature folder still invalidates the whole app
architecture target — analysis reloads the tsconfig, in seconds, not
milliseconds.

Craft is a Craft/Angular analyser. Outside that dialect the graph is empty.
Nx tags Nest, React, Python, assets and config files.

## The overlap

Same intention, different edge.

| Intention | Nx | Craft | Trap |
| --- | --- | --- | --- |
| This layer must not talk to that one | `sourceTag: type:ui` → `onlyDependOnLibsWithTags: type:util` | `assertPathBoundaries` — `src/app/ui/**` must not `depends-on` `src/app/data/**` | Nx requires libs. Craft runs inside one tsconfig, on yield, not on the import. |
| No cycles | `orders` → `customers` → `orders` (project imports) | `assertNoDependencyCycles` on services / `craftComputed` | A service cycle inside `apps/shop` is green for Nx and red for Craft. |
| See the graph | `nx graph --affected` (projects or tasks) | `craft-graph --format html` centred on a route | One shows who rebuilds. The other shows who injects. |

The `assertPathBoundaries` helper is the closest cousin of `depConstraints`.
Nx tags **projects** and forbids TypeScript imports. Craft tags **folders** on
the Craft graph and forbids `depends-on` (optionally `calls`) — including
inside one app, where module-boundary ESLint does not run. Setup and examples:
[Architecture rules](/guide/testing/architecture#assertpathboundaries).

## How they complement

Do not recode `depConstraints` as Vitest, and do not recode Craft's AST
analysis as an Nx Conformance rule. Each tool stays on its graph.

| Keep Nx for | Keep Craft for |
| --- | --- |
| Monorepo layout, tags between libs, public API barrels | HTTP ownership, `craftUnique` identities |
| `nx affected`, local / remote cache, task graph | Route DI proofs staying armed |
| Banning an npm package by tag | Pure `craftComputed`, service-level cycles |
| Generators, plugins, polyglot projects | `noExclusiveLink`, browser-boundary HTTP |

::: warning Folder lanes are not affected CI
Extracting Nx libraries gives you `nx affected`. It still does not prove a
single service owns `GET users`. `assertPathBoundaries` keeps features apart
inside one app. It still does not slice the task graph. Both layers stay
necessary.
:::

The working reference is the demo app: an Nx `architecture` target that runs
Vitest on the Craft graph. Copy that layout from
[Architecture rules](/guide/testing/architecture#setting-it-up).

## See Also

- [Architecture rules](/guide/testing/architecture) — helpers, catalog, Nx
  target
- [ESLint rules](/guide/routing/eslint-rules) — local slips the graph cannot
  autofix
- [What craft adds to Angular](/guide/concepts/vs-angular) — compile-time
  inventory this graph sits on
- [Learn: test what you wrote](/learn/10-testing)

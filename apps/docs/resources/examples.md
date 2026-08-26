# Examples

Every example below is a real route of one of the demo applications. Each
opens in StackBlitz on the relevant file, already navigated to the page.

The demo groups them the way you would meet them: **components** first, then the
**primitives** on their own, then the same features **behind services**, then
**routing** and the rest.

::: tip Just want to poke at something?
The [Playground](https://stackblitz.com/fork/github/craft-ts/craft-ts-demo/tree/main?file=src%2Fapp%2Fexamples%2Fplayground%2Fplayground.ts&initialpath=%2Fplayground)
is a shareable sandbox with a small todo flow — the fastest way to try an idea.
:::

## Components

Functional, selectorless components rendered from typed hyperscript.

| Example | What it shows |
| --- | --- |
| [Functional Components](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/component/component-demo.ts&initialpath=/) | `craftComponent`, inputs and outputs as factory parameters, hyperscript templates |
| [Reactive Composition](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/component/component-composition-demo.ts&initialpath=/component-composition) | Composing components and directives with `.pipe(...)` |
| [Content Projection](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/component/content-projection-demo.ts&initialpath=/content-projection) | Free DOM content, typed DOM contracts, and logical projection by contract |
| [Pending Block](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/component/pending-node-demo.ts&initialpath=/pending-node) | Type-safe async suspension with `settledValue`, `settled(...)` and `pendingNode` |
| [Pending Block — Exception](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/component/pending-node-exception-demo.ts&initialpath=/pending-node/exception) | Coordinating pending, reloading and business-exception fallbacks with `pendingNode` and `catchNode` |

## Primitives

Using `state`, `query`, `mutation`, `queryParams` and `asyncProcess` directly,
with no service layer.

| Example | What it shows |
| --- | --- |
| [Query](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/primitives/query/query.ts&initialpath=/query/1) | `query()` with reactive params, status and caching |
| [Mutation](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/primitives/mutation/mutation.ts&initialpath=/mutation/1) | `mutation()` with manual control of modification operations |
| [List with Pagination](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/primitives/list-with-pagination/list-with-pagination.ts&initialpath=/list-with-pagination) | Pagination with hand-managed query params and page state |
| [Granular Mutation](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/primitives/granular-mutation/granular-mutation.ts&initialpath=/granular-mutation) | Optimistic updates and cache invalidation, done by hand |
| [Full Demo](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/primitives/full-demo/full-demo.ts&initialpath=/full-demo) | Everything at once, without store or service abstractions |
| [Login Form](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/primitives/forms/login-form.ts&initialpath=/login-form) | `insertForm`, validators, and a typed submit wired to a mutation |
| [Pixel Art](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/primitives/pixel-art/pixel-art.ts&initialpath=/pixel-art) | `state` + `insertSelect` over a flat array |
| [Pixel Art Matrix](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/primitives/pixel-art-matrix/pixel-art-matrix.ts&initialpath=/pixel-art-matrix) | Nested `insertSelect` and internal `source$` between rows and cells |
| [Exceptions](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/primitives/exceptions/exceptions.ts&initialpath=/exceptions) | Business exceptions on `query()`, rendered per code with `matchNode.exhaustive` |
| [Exception QueryParams](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/primitives/exceptions/exception-query-params.ts&initialpath=/exception-query-params) | `queryParams` decode failures through `hasException()` and `exceptions().parse` |

## State machines

State machines for explicit transitions, history and collection-oriented UI.

| Example | What it shows |
| --- | --- |
| [Profile editor](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/primitives/state-machine/profile-editor.ts&initialpath=/state-machine) | `craftStateMachine`, typed transitions and persisted history |
| [Text editor](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/primitives/state-machine/text-editor.ts&initialpath=/state-machine-text) | A compact state machine for editing, validation and transitions |
| [Task board](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/primitives/state-machine-list/task-board.ts&initialpath=/state-machine-list) | A state machine per list item with history and reactive collection updates |

## Services

The same features, packaged behind `craftService`.

| Example                                                                                                                                                                                                   | What it shows                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [Craft Query](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/craft/query/query.ts&initialpath=/craft/query/1)                                                      | A reusable query service with configured storage persistence (localStorage by default) |
| [Craft Mutation](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/craft/mutation/mutation.ts&initialpath=/craft/mutation/1)                                          | Create / update / delete with reactive cache synchronisation                           |
| [Craft List Pagination](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/craft/list-with-pagination/list-with-pagination.ts&initialpath=/craft/list-with-pagination) | `queryParams` + `insertPaginationPlaceholderData` in a service                         |
| [Craft Granular Mutation](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/craft/granular-mutation/granular-mutation.ts&initialpath=/craft/granular-mutation)        | `insertReactOnMutation` updating cached data without a reload                          |
| [Craft Full Demo](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/craft/full-demo/full-demo.ts&initialpath=/craft/full-demo)                                        | Queries, mutations, async work, URL state and persistence together                     |
| [craftService Counter](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/craft-service/craft-service-counter.ts&initialpath=/craft-service/counter)                   | The smallest possible service — scopes and composition                                 |
| [craftService User Detail](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/craft-service/craft-service-user-detail.ts&initialpath=/craft-service/user-detail)       | Service inputs, and exposing only part of a dependency                                 |
| [craftRegisterFor](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/craft-service/register-for.ts&initialpath=/craft-service/register-for)                           | A parent driving live children through a typed registry                                |

## Effect

Concrete EffectTS integration examples, using the dedicated Effect demo.

| Example                                                                                                                                                                    | What it shows                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [Profile Lookup](https://stackblitz.com/github/craft-ts/craft-demo-effect/tree/main/?file=src/app/examples/effect/effect-profile-lookup.ts&initialpath=/)                  | `queryEffect`, typed business errors, and pending / exception rendering                                                                        |
| [Access Check](https://stackblitz.com/github/craft-ts/craft-demo-effect/tree/main/?file=src/app/examples/effect/effect-access-check-shared-service.ts&initialpath=/access) | An Effect service provided by the application Layer                                                                                            |
| [Team Overview](https://stackblitz.com/github/craft-ts/craft-demo-effect/tree/main/?file=src/app/examples/effect/effect-team-overview-layer-scope.ts&initialpath=/team)    | Combining application-wide and route-scoped Effect Layers                                                                                      |
| [Effect Playground](https://stackblitz.com/github/craft-ts/craft-demo-effect/tree/main/?file=src/app/examples/effect/effect-playground.ts&initialpath=/playground)         | A shareable todo sandbox with `queryEffect`, `mutationEffect`, and a route-provided Effect service                                             |
| [Translate in an Effect](https://stackblitz.com/github/craft-ts/craft-demo-effect/tree/main/?file=src/app/shared/i18n-domain.ts&initialpath=/i18n)                         | `provideI18nRuntime` as a route Layer, `translateEffect` inside a plain Effect program, and the locale as Craft state driving the query params |

## Design system

The typed style system, at all three of its levels. Both routes read from the
same sheets under `src/app/examples/design-system/`, which has a README walking
through the same progression in code.

| Example                                                                                                                                                                  | What it shows                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Mini Design System](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/design-system/foundation.style.ts&initialpath=/design-system) | `definePalette`, `defineStateAxis`, `cssVars` and the theme: one dark-mode rule for the whole system, and variants as `data-*` attributes rather than class strings |
| [Scroll context](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/design-system/scroll.style.ts&initialpath=/design-system/scroll)  | Level 3: `requires(scrollPort.block)` travelling up the tree, `provides(...)` on the layout that owns the area, and the `scrollState` axis                          |

Start from [Activating the style system](/guide/style/setup) — the sheets emit
nothing without the Vite plugin.

## Internationalisation

| Example                                                                                                                                        | What it shows                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Type-safe i18n](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/i18n/i18n.service.ts&initialpath=/i18n) | `defineCatalog` + `msg` + `plural`, a second locale through `defineLocaleLike`, every shipped semantic token, a custom `defineToken`, and `runtime.bind` switching the whole page reactively |

The guide is [Type-safe i18n](/guide/i18n/).

## Routing

| Example                                                                                                                                                                                             | What it shows                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [Query Params in the route](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/routes/list-with-pagination/qp-list-with-pagination.ts&initialpath=/query-params) | `queryParams` declared on the route rather than in a component                                                         |
| [Guard Demo](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/routes/guard-demo/GuardDemo.ts&initialpath=/guard-demo)                                          | Guards as bare generators, and `handleExceptions` per code                                                             |
| [Slow Page](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/routes/slow-page/slow-page.routes.ts&initialpath=/slow-page)                                      | Non-blocking navigation: the stay → blank → loader phases, and a `craftGen` resolver recovered locally with `catchTag` |
| [View Transitions](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/routes/view-transitions/view-transitions.routes.ts&initialpath=/view-transitions)          | Outlet-driven view transitions surviving the guard/resolve chain, with a per-route skeleton                            |
| [Lazy Layout](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/craft/lazy-layout/lazy-layout.routes.ts&initialpath=/craft/lazy-layout/1)                       | A lazy child collection with its own DI check and a route-provided service                                             |

## Tooling

| Example                                                                                                                                                                              | What it shows                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| [Playground](https://stackblitz.com/fork/github/craft-ts/craft-ts-demo/tree/main?file=src%2Fapp%2Fexamples%2Fplayground%2Fplayground.ts&initialpath=%2Fplayground)                                 | A shareable sandbox: a small todo flow with `craftService`, `query()` and `mutation()` |
| [Send Context to AI](https://stackblitz.com/github/craft-ts/craft-ts-demo/tree/main/?file=src/app/examples/ia/demo-send-context/demo-send-context.ts&initialpath=/demo-send-context) | Exporting the live dependency graph and app context to an assistant                    |

## Notes

Each example ships its own `api.service.ts` simulating the network, so every
route works standalone.

Source repository:
[craft-ts-demo](https://github.com/craft-ts/craft-ts-demo).

Effect demo source repository:
[craft-demo-effect](https://github.com/craft-ts/craft-demo-effect).

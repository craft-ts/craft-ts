# API index

Every documented export, with the page that covers it. Use <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>F</kbd>.

For an explanation rather than a lookup, start from the [Guide](/guide/).

## Primitives

| Symbol         | What it does                                             | Page                                       |
| -------------- | -------------------------------------------------------- | ------------------------------------------ |
| `state`        | Signal-based state you own                               | [Local state](/guide/state/local-state)    |
| `query`        | Server data, re-fetched from reactive `params`           | [query](/guide/state/server-state)         |
| `mutation`     | Server write, triggered explicitly                       | [Mutations](/guide/state/mutations)        |
| `queryParams`  | State that lives in the URL query string                 | [queryParams](/guide/state/url-state)      |
| `asyncProcess` | One-off async operation with lifecycle state             | [asyncProcess](/guide/state/async-process) |
| `craftUse`     | Drives a primitive outside a generator (component field) | [Learn 1](/learn/01-first-state)           |

Not sure which one: [Which primitive should I use?](/guide/concepts/choose-primitive)

## Runtime context

Typed helpers that recover `get` / `set` / `update` / `patch` from DI, for
wrappers, WebMCP tools, and other advanced patterns. Everyday insertions
already receive those methods as arguments — see
[Anatomy of a primitive](/guide/concepts/primitive-anatomy#injectable-runtime-context).

| Symbol                                       | What it does                                                                 | Page                                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `injectStateMethodRuntimeContext`            | `state` writes inside an insertion method                                    | [Anatomy](/guide/concepts/primitive-anatomy#injectable-runtime-context)                      |
| `injectQueryMethodRuntimeContext`            | `query` writes inside an insertion method                                    | [Anatomy](/guide/concepts/primitive-anatomy#injectable-runtime-context)                      |
| `injectMutationMethodRuntimeContext`         | `mutation` writes inside an insertion method                                 | [Anatomy](/guide/concepts/primitive-anatomy#injectable-runtime-context)                      |
| `injectQueryParamsMethodRuntimeContext`      | `queryParams` writes inside an insertion method                              | [Anatomy](/guide/concepts/primitive-anatomy#injectable-runtime-context)                      |
| `injectAsyncProcessMethodRuntimeContext`     | `asyncProcess` writes inside an insertion method                             | [Anatomy](/guide/concepts/primitive-anatomy#injectable-runtime-context)                      |
| `injectPrimitiveMethodRuntimeContext`        | Same context, untyped `kind`                                                 | [Anatomy](/guide/concepts/primitive-anatomy#injectable-runtime-context)                      |
| `providePrimitiveResourceRuntimeObserver`    | Observes `query` / `mutation` / `asyncProcess` / `queryParams` values        | [Anatomy](/guide/concepts/primitive-anatomy#injectable-runtime-context)                      |

## Composition

| Symbol                   | What it does                               | Page                                                     |
| ------------------------ | ------------------------------------------ | -------------------------------------------------------- |
| `craftPipe`              | Composes several insertions into one       | [Insertions](/guide/concepts/insertions)                 |
| `craftYieldRecord`       | Resolves a record of primitive generators  | [craftService](/guide/app/craft-service)                 |
| `insertStatePipe`        | Composes several `state` insertions        | [Typed insertion pipes](/guide/concepts/insertion-pipes) |
| `insertQueryPipe`        | Composes several `query` insertions        | [Typed insertion pipes](/guide/concepts/insertion-pipes) |
| `insertMutationPipe`     | Composes several `mutation` insertions     | [Typed insertion pipes](/guide/concepts/insertion-pipes) |
| `insertQueryParamsPipe`  | Composes several `queryParams` insertions  | [Typed insertion pipes](/guide/concepts/insertion-pipes) |
| `insertAsyncProcessPipe` | Composes several `asyncProcess` insertions | [Typed insertion pipes](/guide/concepts/insertion-pipes) |
| `craftGen`               | A standalone tracked generator             | [Generators](/guide/concepts/generators)                 |
| `craftMatch`             | Exhaustive pattern matching                | [Pattern matching](/guide/advanced/pattern-matching)     |
| `.pipe(...)`             | Program operators on a craft generator     | [Program operators](/guide/advanced/program-operators)   |
| `catchTag`, `retry`      | Operators for `.pipe(...)`                 | [Program operators](/guide/advanced/program-operators)   |

## Insertions

| Symbol                            | What it does                                    | Page                                                          |
| --------------------------------- | ----------------------------------------------- | ------------------------------------------------------------- |
| `insertSelect`                    | Derives a slice of a primitive                  | [Selecting](/guide/state/select)                              |
| `insertEntities`                  | Entity collection storage and updates           | [Collections](/guide/state/collections)                       |
| `insertStoragePersister`          | Persists through the configured storage backend | [Persistence](/guide/state/persistence)                       |
| `insertReactOnMutation`           | Reloads / optimistically patches on a mutation  | [React on mutation](/guide/state/react-on-mutation)           |
| `insertPaginationPlaceholderData` | Placeholder rows while a page loads             | [Pagination placeholder](/guide/state/pagination-placeholder) |

## Forms

| Symbol                                                                      | What it does                               | Page                                  |
| --------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------- |
| `insertForm`                                                                | Derives a form from a `state`              | [Forms](/guide/forms/)                |
| `insertFormAttributes`                                                      | Validators, `disable`, `hidden`            | [Forms](/guide/forms/)                |
| `insertSelectFormTree`                                                      | Targets a field sub-tree                   | [Nested forms](/guide/forms/nested)   |
| `insertSubFormField`                                                        | A nested sub-form                          | [Nested forms](/guide/forms/nested)   |
| `insertFormSubmit`                                                          | Wires submission to a mutation             | [Submitting](/guide/forms/submit)     |
| `insertNoopTypingAnchor`                                                    | Type anchor required per field tree        | [Forms](/guide/forms/)                |
| `CraftFieldDirective`                                                       | Binds a typed field to a Craft DOM node    | [Forms](/guide/forms/)                |
| `fieldExceptionBlock.exhaustive` / `.partial`                               | Exhaustive or partial validation rendering | [Forms](/guide/forms/)                |
| `cRequired`, `cEmail`, `cMin`/`cMax`, `cMinLength`/`cMaxLength`, `cPattern` | Built-in validators                        | [Validators](/guide/forms/validation) |
| `cValidate`, `cAsyncValidate`                                               | Custom and async validators                | [Validators](/guide/forms/validation) |

## Services and DI

| Symbol                      | What it does                               | Page                                              |
| --------------------------- | ------------------------------------------ | ------------------------------------------------- |
| `craftService`              | Declares a named, scoped service           | [craftService](/guide/app/craft-service)          |
| `toCraftService`            | Adapts an existing Angular dependency      | [Integrating](/guide/app/integrate-existing)      |
| `abstract`                  | Declares a contract with no implementation | [Abstract services](/guide/app/abstract-services) |
| `X.OmitInputs`              | Opts out of a service's input bindings     | [Public API](/guide/app/expose-api)               |
| `onAppStart`                | Startup callback owned by a service        | [App start](/guide/app/app-start)                 |
| `craftLazy`                 | Defers a service's instantiation           | [Lazy services](/guide/app/lazy-services)         |
| `craftRegisterFor`          | Registry-driven service resolution         | [Register](/guide/app/register)                   |
| `provideCraftTargetWrapper` | Wraps craft targets at a provider boundary | [Target wrapper](/guide/app/target-wrapper)       |
| `provideTemplateTrace`      | Wraps effective template renders           | [Observability](/guide/advanced/observability)    |
| `provideCraftRouterTrace`   | Wraps Router events and Craft route stages | [Observability](/guide/advanced/observability)    |
| `provideCraftHttpTrace`     | Wraps CraftHttpClient requests             | [Observability](/guide/advanced/observability)    |
| `craftAppConfig`            | Application config with the routing graph  | [Routing setup](/guide/routing/setup)             |

## Routing

| Symbol                                                              | What it does                                    | Page                                                  |
| ------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| `craftRoute`, `craftRoutes`                                         | Declares typed routes and collections           | [Setup](/guide/routing/setup)                         |
| `ValidateCascadeRoutesFile`, `CanRun`                               | Compile-time DI check for a routes file         | [Setup](/guide/routing/setup)                         |
| `RouteCheckedDI`                                                    | Per-route `O(1)` variant of the check           | [Scaling routes](/guide/routing/scaling)              |
| `.withParent`, `ParentRoutes`, `assertChildRouteMounts`             | Pins a child collection to its mount            | [Scaling routes](/guide/routing/scaling)              |
| `withRetry`                                                         | Retryable lazy `loadComponent` / `loadChildren` | [Setup](/guide/routing/setup)                         |
| `provideCraftRouter`, `provideCraftLoading`                         | Router with craft loading features              | [Pending UI](/guide/routing/pending-ui)               |
| `withErrorComponent`, `withRouteLoadError`, `withTransitionTimings` | Router features                                 | [Route load errors](/guide/routing/route-load-errors) |
| `CraftRouterOutlet`                                                 | Non-blocking outlet                             | [Pending UI](/guide/routing/pending-ui)               |
| `craftRouterLink`                                                   | Type-safe navigation target                     | [Setup](/guide/routing/setup)                         |
| `assertExhaustiveRouteExceptions`                                   | Exhaustiveness proof for route exceptions       | [Exceptions](/guide/concepts/exceptions)              |

## Exceptions

| Symbol                             | What it does                             | Page                                                            |
| ---------------------------------- | ---------------------------------------- | --------------------------------------------------------------- |
| `craftException`                   | Creates a declared, typed exception      | [Exceptions](/guide/concepts/exceptions)                        |
| `craftExceptionHandler`            | Handles route exceptions                 | [Exceptions](/guide/concepts/exceptions)                        |
| `.exceptions()`, `.hasException()` | Reads a primitive's exceptions by origin | [query](/guide/state/server-state)                              |
| `globalError()`                    | Delegates to the global error component  | [Global error component](/guide/routing/global-error-component) |

## Reactivity

| Symbol               | What it does                       | Page                                                         |
| -------------------- | ---------------------------------- | ------------------------------------------------------------ |
| `craftComputed`      | Tracked `computed`                 | [craftComputed](/guide/reactivity/craft-computed)            |
| `craftEffect`        | Tracked `effect`                   | [craftEffect](/guide/reactivity/craft-effect)                |
| `craftMethod`        | A tracked method on a primitive    | [craftMethod](/guide/reactivity/craft-method)                |
| `source$`            | An imperative event source         | [source$](/guide/reactivity/source)                          |
| `on$`                | Binds a method to a source         | [on$](/guide/reactivity/on)                                  |
| `fromEventToSource$` | DOM event → source                 | [fromEventToSource$](/guide/reactivity/from-event-to-source) |
| `sourceFromEvent`    | Event-driven source helper         | [sourceFromEvent](/guide/reactivity/source-from-event)       |
| `afterRecomputation` | Runs after a recomputation settles | [afterRecomputation](/guide/reactivity/after-recomputation)  |

## HTTP and boundaries

| Symbol            | What it does                               | Page                                                    |
| ----------------- | ------------------------------------------ | ------------------------------------------------------- |
| `CraftHttpClient` | Tracked HTTP client with typed exceptions  | [query](/guide/state/server-state)                      |
| `browserBoundary` | Marks a service as a browser boundary      | [Browser boundaries](/guide/testing/browser-boundaries) |
| `Console`         | Yieldable console, overridable for tracing | [Observability](/guide/advanced/observability)          |

## Testing

| Symbol                                                                                                                                                                         | What it does                                                      | Page                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------- |
| `setupCraftServiceTestingByRegister`                                                                                                                                           | Sets up a service from a full register                            | [Testing services](/guide/testing/services)             |
| `setupCraftComponentTestingByRegister`                                                                                                                                         | Same, for a component + its `GenDeps_*`                           | [Testing components](/guide/testing/components)         |
| `boundaryOnly`                                                                                                                                                                 | Keeps the graph real, mocks boundaries                            | [Browser boundaries](/guide/testing/browser-boundaries) |
| `mockHttpRequestForRoute`                                                                                                                                                      | Mocks endpoints for a route                                       | [Browser boundaries](/guide/testing/browser-boundaries) |
| `ComponentTemplateOf`, `ComponentLogicOutputOf`, `SetupTestComponentTemplate`                                                                                                  | Resolves component logic and validates a template at compile time | [Type-level tests](/guide/testing/type-level)           |
| `TemplateHasElement`, `TemplateRendersNamedElementWhen`, `TemplateNamedElementRendersStateWhen`, `TemplateNamedElementDelegatesToContext`, `TemplateRenderAvailableActionWhen` | Proves what a template renders and uses                           | [Type-level tests](/guide/testing/type-level)           |
| `Expect`, `Equal`                                                                                                                                                              | Turns a type-level result into a compile-time assertion           | [Type-level tests](/guide/testing/type-level)           |
| `createArchitectureGraph`, `noExclusiveLink`, `assertCraftUnique`, `assertHttpEndpointUnique`, `assertCraftComputedPure`, `assertNoDependencyCycles`, `assertDeclarativeArchitecture`, `assertRouteDiProofs`, `assertPathBoundaries`, `assertMutationHasReactOn`, `assertPersistedPrimitiveHasUnique`, `assertInsertSelectUnique`, `assertCraftEffectNoNetwork` | Typed lookups and declarative architecture helpers | [Architecture rules](/guide/testing/architecture) |

## Tooling

| Command / rule                     | What it does                                | Page                                                                     |
| ---------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------ |
| `npx craft route add`              | Scaffolds a typed route                     | [Automation](/guide/routing/automation)                                  |
| `npx craft route split`            | Splits a flat collection                    | [Scaling routes](/guide/routing/scaling)                                 |
| `npx craft route verify`           | Optional compiler-fixture suite for the type machinery | [Automation](/guide/routing/automation#compiler-fixture-suite-optional) |
| `craft-brand --root src/app`       | Generates and refreshes `GenDeps_*`         | [Brand config](/guide/routing/angular-brand-config)                      |
| `@craft-ng/dev-tools/eslint-rules` | The ESLint rule set                         | [ESLint rules](/guide/routing/eslint-rules)                              |
| `npx craft-graph`                  | Writes the static Craft graph               | [Architecture rules](/guide/testing/architecture) · [Craft graph vs Nx](/guide/testing/craft-graph-vs-nx) |
| `npx nx architecture <app>`        | Runs the app's architecture Vitest suite    | [Architecture rules](/guide/testing/architecture) · [Craft graph vs Nx](/guide/testing/craft-graph-vs-nx) |
| Template migrator                  | Migrates templates to craft components      | [Template migrator](/guide/components/template-migrator)                 |

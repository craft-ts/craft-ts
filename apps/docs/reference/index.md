# API index

Every documented export, with the page that covers it. Use <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>F</kbd>.

For an explanation rather than a lookup, start from the [Guide](/guide/).
Coding agents: [llms.txt](https://craft-ts.github.io/craft/llms.txt) and
[coding agents](/resources/ai-agents).

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

| Symbol                                    | What it does                                                          | Page                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `injectStateMethodRuntimeContext`         | `state` writes inside an insertion method                             | [Anatomy](/guide/concepts/primitive-anatomy#injectable-runtime-context) |
| `injectQueryMethodRuntimeContext`         | `query` writes inside an insertion method                             | [Anatomy](/guide/concepts/primitive-anatomy#injectable-runtime-context) |
| `injectMutationMethodRuntimeContext`      | `mutation` writes inside an insertion method                          | [Anatomy](/guide/concepts/primitive-anatomy#injectable-runtime-context) |
| `injectQueryParamsMethodRuntimeContext`   | `queryParams` writes inside an insertion method                       | [Anatomy](/guide/concepts/primitive-anatomy#injectable-runtime-context) |
| `injectAsyncProcessMethodRuntimeContext`  | `asyncProcess` writes inside an insertion method                      | [Anatomy](/guide/concepts/primitive-anatomy#injectable-runtime-context) |
| `injectPrimitiveMethodRuntimeContext`     | Same context, untyped `kind`                                          | [Anatomy](/guide/concepts/primitive-anatomy#injectable-runtime-context) |
| `providePrimitiveResourceRuntimeObserver` | Observes `query` / `mutation` / `asyncProcess` / `queryParams` values | [Anatomy](/guide/concepts/primitive-anatomy#injectable-runtime-context) |

## Composition

| Symbol                   | What it does                                    | Page                                                     |
| ------------------------ | ----------------------------------------------- | -------------------------------------------------------- |
| `craftPipe`              | Composes several insertions into one            | [Insertions](/guide/concepts/insertions)                 |
| `craftYieldRecord`       | Resolves a record of primitive generators       | [craftService](/guide/app/craft-service)                 |
| `insertStatePipe`        | Composes several `state` insertions             | [Typed insertion pipes](/guide/concepts/insertion-pipes) |
| `insertQueryPipe`        | Composes several `query` insertions             | [Typed insertion pipes](/guide/concepts/insertion-pipes) |
| `insertMutationPipe`     | Composes several `mutation` insertions          | [Typed insertion pipes](/guide/concepts/insertion-pipes) |
| `insertQueryParamsPipe`  | Composes several `queryParams` insertions       | [Typed insertion pipes](/guide/concepts/insertion-pipes) |
| `insertAsyncProcessPipe` | Composes several `asyncProcess` insertions      | [Typed insertion pipes](/guide/concepts/insertion-pipes) |
| `insertStateMachinePipe` | Composes several `craftStateMachine` insertions | [Typed insertion pipes](/guide/concepts/insertion-pipes) |
| `craftGen`               | A standalone tracked generator                  | [Generators](/guide/concepts/generators)                 |
| `craftMatch`             | Exhaustive pattern matching                     | [Pattern matching](/guide/advanced/pattern-matching)     |
| `.pipe(...)`             | Program operators on a craft generator          | [Program operators](/guide/advanced/program-operators)   |
| `catchTag`, `retry`      | Operators for `.pipe(...)`                      | [Program operators](/guide/advanced/program-operators)   |

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
| `fieldErrorNode.exhaustive` / `.partial`                               | Exhaustive or partial validation rendering | [Forms](/guide/forms/)                |
| `cRequired`, `cEmail`, `cMin`/`cMax`, `cMinLength`/`cMaxLength`, `cPattern` | Built-in validators                        | [Validators](/guide/forms/validation) |
| `cValidate`, `cAsyncValidate`                                               | Custom and async validators                | [Validators](/guide/forms/validation) |

## Services and DI

| Symbol                      | What it does                               | Page                                              |
| --------------------------- | ------------------------------------------ | ------------------------------------------------- |
| `craftService`              | Declares a named, scoped service           | [craftService](/guide/app/craft-service)          |
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

| Symbol                                                                                                                                   | What it does                                                               | Page                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------- |
| `craftRoute`, `craftRoutes`                                                                                                              | Declares typed routes and collections                                      | [Setup](/guide/routing/setup)                         |
| `ValidateCascadeRoutesFile`, `CanRun`                                                                                                    | Compile-time DI check for a routes file                                    | [Setup](/guide/routing/setup)                         |
| `RouteCheckedDI`                                                                                                                         | Per-route `O(1)` variant of the check                                      | [Scaling routes](/guide/routing/scaling)              |
| `.withParent`, `ParentRoutes`, `assertChildRouteMounts`                                                                                  | Pins a child collection to its mount                                       | [Scaling routes](/guide/routing/scaling)              |
| `withRetry`                                                                                                                              | Retryable lazy `loadComponent` / `loadChildren`                            | [Setup](/guide/routing/setup)                         |
| `provideCraftRouter`, `provideCraftLoading`                                                                                              | Router with craft loading features                                         | [Pending UI](/guide/routing/pending-ui)               |
| `withA11yNavigationFocus`, `CraftTitleStrategy`                                                                                          | Focus after nav; route `title` → document                                  | [Accessibility](/guide/components/accessibility)      |
| `heading`, `headingSection`, `headingRoot`, `skipLink`, `liveRegion`, `fieldControl`, `disclosureControl`, `buttonControl`, `clickFocus` | Relative outline, skip link, live regions, accessible control props, focus | [Accessibility](/guide/components/accessibility)      |
| `withErrorComponent`, `withRouteLoadError`, `withTransitionTimings`                                                                      | Router features                                                            | [Route load errors](/guide/routing/route-load-errors) |
| `CraftRouterOutlet`                                                                                                                      | Non-blocking outlet                                                        | [Pending UI](/guide/routing/pending-ui)               |
| `craftRouterLink`                                                                                                                        | Type-safe navigation target                                                | [Setup](/guide/routing/setup)                         |
| `assertExhaustiveRouteExceptions`                                                                                                        | Exhaustiveness proof for route exceptions                                  | [Exceptions](/guide/concepts/exceptions)              |

## Server rendering

| Symbol                                                     | What it does                                                            | Page                                               |
| ---------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------- |
| `renderCraft`, `renderToString`                            | Renders an isolated request to HTML, CSS, and a transfer snapshot       | [SSR and hydration](/guide/advanced/ssr-hydration) |
| `startCraft`                                               | Hydrates an SSR host or mounts a fresh client application automatically | [SSR and hydration](/guide/advanced/ssr-hydration) |
| `hydrateCraft`                                             | Restores transferred state and claims the existing browser DOM          | [SSR and hydration](/guide/advanced/ssr-hydration) |
| `pendingNode({ ssr })`                                    | Declares `block`, `fallback`, or `client` behavior for suspended data   | [SSR and hydration](/guide/advanced/ssr-hydration) |
| `CRAFT_SSR_POLICY`                                         | Route-level default SSR policy                                          | [SSR and hydration](/guide/advanced/ssr-hydration) |
| `CraftUnhandledSsrResolutionError`, `CraftSsrTimeoutError` | Reports missing policies and timed-out blocking sources                 | [SSR and hydration](/guide/advanced/ssr-hydration) |

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

| Symbol                                                                 | What it does                                              | Page                                                    |
| ---------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------- |
| `CraftHttpClient`                                                      | Tracked HTTP client with typed exceptions                 | [query](/guide/state/server-state)                      |
| `browserBoundary`                                                      | Marks a service as a browser boundary                     | [Browser boundaries](/guide/testing/browser-boundaries) |
| `BrowserDocument`, `BrowserDocument.setLang`, `BrowserDocument.setDir` | Reads and updates document title, language, and direction | [Browser boundaries](/guide/testing/browser-boundaries) |
| `Console`                                                              | Yieldable console, overridable for tracing                | [Observability](/guide/advanced/observability)          |

## Testing

| Symbol                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | What it does                                                      | Page                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------- |
| `setupCraftServiceTestingByRegister`                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Sets up a service from a full register                            | [Testing services](/guide/testing/services)             |
| `boundaryOnly`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Keeps the graph real, mocks boundaries                            | [Browser boundaries](/guide/testing/browser-boundaries) |
| `mockHttpRequestForRoute`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Mocks endpoints for a route                                       | [Browser boundaries](/guide/testing/browser-boundaries) |
| `ComponentTemplateOf`, `ComponentLogicOutputOf`, `SetupTestComponentTemplate`                                                                                                                                                                                                                                                                                                                                                                                                                                   | Resolves component logic and validates a template at compile time | [Type-level tests](/guide/testing/type-level)           |
| `TemplateHasElement`, `TemplateRendersNamedElementWhen`, `TemplateNamedElementRendersStateWhen`, `TemplateNamedElementDelegatesToContext`, `TemplateRenderAvailableActionWhen`                                                                                                                                                                                                                                                                                                                                  | Proves what a template renders and uses                           | [Type-level tests](/guide/testing/type-level)           |
| `Expect`, `Equal`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Turns a type-level result into a compile-time assertion           | [Type-level tests](/guide/testing/type-level)           |
| `createArchitectureGraph`, `noExclusiveLink`, `assertCraftUnique`, `assertHttpEndpointUnique`, `assertCraftComputedPure`, `assertNoDependencyCycles`, `assertDeclarativeArchitecture`, `assertRouteDiProofs`, `assertPathBoundaries`, `assertMutationHasReactOn`, `assertPrimitiveLoaderRequirements`, `assertQueryMutationHasServerState`, `assertPersistedPrimitiveHasUnique`, `assertInsertSelectUnique`, `assertCraftEffectNoNetwork`, `assertCraftEffectNoImperativeSync`, `assertInteractiveElementNamed` | Typed lookups and declarative architecture helpers                | [Architecture rules](/guide/testing/architecture)       |

## Effect integration

`@craft-ts/effect`, in full. The guide is [Effect
integration](/guide/advanced/effect).

| Symbol                                                                                               | What it does                                                     | Page                                                                                   |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `installCraftEffectBridge`                                                                           | Installs both bridges once, at bootstrap                         | [Install the bridge](/guide/advanced/effect#install-the-bridge-once)                   |
| `queryEffect`, `mutationEffect`, `asyncProcessEffect`, `computedEffect`                              | The Effect-backed adapters of the Craft primitives               | [Choose the right adapter](/guide/advanced/effect#choose-the-right-adapter)            |
| `runEffect`, `CraftEffectInterrupted`                                                                | Yields one Effect and maps its exit onto Craft's channels        | [runEffect](/guide/advanced/effect#runeffect-the-low-level-form)                       |
| `syncEffect`, `SyncOp`, `CraftEffectNotSynchronous`, `NotDeclaredSynchronous`                        | Declares and runs an Effect that never suspends                  | [Synchronous members](/guide/advanced/effect#run-a-synchronous-member-from-a-computed) |
| `provideLayer`                                                                                       | Attaches a built Effect context to a Craft injector              | [Provide services with Layer](/guide/advanced/effect#provide-services-with-layer)      |
| `effectService`, `SelectedMembers`                                                                   | Selects a service from a Craft factory, recording the dependency | [Select a service](/guide/advanced/effect#select-an-effect-service-from-craft)         |
| `mockEffectService`, `UnstubbedEffectMember`                                                         | A focused Layer for tests; an unstubbed member fails loudly      | [Testing](/guide/advanced/effect#testing)                                              |
| `EffectRequirementsCheckedDI`, `ProvidedEffectServicesOf`, `ProvidedEffectServicesOfRoute`           | The route-level proof that every requirement is provided         | [Provide services with Layer](/guide/advanced/effect#provide-services-with-layer)      |
| `effectServerMiddleware`, `executeEffect`, `EffectServerMiddleware`, `EffectServerMiddlewareContext` | Effect middleware and execution for server functions             | [Server functions POC](/guide/advanced/effect#server-functions-current-poc)            |

### Lower-level exports

Public, but rarely needed directly. They exist for wrappers, generated code and
tooling rather than for application code.

| Symbol                                                                                                               | What it is                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `composeEffect`                                                                                                      | Composes yieldable Effect middleware in declaration order, without continuations. `effectServerMiddleware` is the everyday door.                                                                              |
| `runYieldedEffect`                                                                                                   | The single-Effect runner the bridge itself calls. Use `runEffect`, which keeps the call site blamable.                                                                                                        |
| `assertNoRequirements`, `AssertNoRequirements`, `MissingRequirements`, `RealRequirements`, `CraftPhantomRequirement` | Moves the `R = never` check to the **yield site**, so an unmet requirement points at the offending line instead of surfacing at runtime. `CraftPhantomRequirement` is what excludes `SyncOp` from that check. |
| `CRAFT_EFFECT_LEVEL`, `resolveEffectLevel`, `CraftEffectLevel`                                                       | The per-injector Effect level: the built context, a `MemoMap` forked from the parent's, and a scope closed with the injector. Read it when writing your own provider; `provideLayer` is the normal way in.    |
| `AsEffect`, `CraftProgramSuccess`, `CraftProgramExceptions`                                                          | A **type-only projection** of a Craft program onto `Effect<A, E>`. It changes no runtime behaviour; it exists so a hover tooltip reads `Effect<User, UserNotFound>` instead of a raw generator type.          |
| `installCraftSyncEffectBridge`                                                                                       | Already installed by `installCraftEffectBridge`. Call it directly only in a host that installs the synchronous bridge alone.                                                                                  |

## Typed styles

`@craft-ts/style` is a **build step**: none of these symbols emit anything
without `craftStyle` from `@craft-ts/style/vite` in the Vite config. See
[Activating the style system](/guide/style/setup).

| Symbol                                                                                                                               | What it does                                                        | Page                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `craftStyle`, `emitStyles`, `renderCss`, `styleDump`, `findStyleModules`                                                             | The build-time emitter and its artefacts (`@craft-ts/style/vite`)   | [Activating the style system](/guide/style/setup)                              |
| `definePalette`, `darkOf`, `palette`                                                                                                 | Colour tokens carrying both of their values, plus the default set   | [Defining a design system](/guide/style/define)                                |
| `defineBreakpoints`, `at`, `above`, `below`                                                                                          | The viewport axis, as an ordered one                                | [Defining a design system](/guide/style/define)                                |
| `defineStateAxis`, `defineAxis`, `onlyVarsOfKind`, `axisPoint`                                                                       | Attribute-driven axes, with an optional write constraint            | [Defining a design system](/guide/style/define)                                |
| `defineContainer`                                                                                                                    | A container axis, closed at the element that declares the container | [Defining a design system](/guide/style/define)                                |
| `scheme`, `motion`, `forcedColors`, `contrast`, `scrollState`, `descendant`                                                          | The standard axes, driven by the user agent or by element state     | [Axes and the matrix](/guide/style/variants)                                   |
| `cssVars`, `kind`, `assign`, `set`                                                                                                   | Typed custom properties, registered through `@property`             | [Tokens and variables](/guide/style/tokens)                                    |
| `space`, `unit`, `radii`, `radius`, `lineWidth`, `num`, `text`, `font`                                                               | The closed value scales — no value is a string                      | [Tokens and variables](/guide/style/tokens)                                    |
| `unsafeLength`, `unsafeAssume`                                                                                                       | The marked escape hatches; both propagate `unproven`                | [Tokens and variables](/guide/style/tokens)                                    |
| `craftStyles`, `when`                                                                                                                | A sheet, and conjunction by nesting                                 | [Axes and the matrix](/guide/style/variants)                                   |
| `requires`, `provides`, `declares`, `seal`, `scrollPort`, `noClipping`, `containerType`, `clipOverflow`                              | Context obligations, and where they become an error                 | [Context obligations](/guide/style/obligations)                                |
| `visualMatrix`, `applyScenario`, `branch`, `contentCases`, `assertExhaustiveVisualMatrix`, `baselinesIn`                             | The scenario matrix (`@craft-ts/style-testing`)                     | [Testing visual states](/guide/style/testing)                                  |
| `matrixSizeByComponent`, `impactedClasses`, `varsWrittenBy`, `danglingVars`, `unproven`, `extractionGaps`, `undischargedObligations` | Graph queries over the style dump (`@craft-ts/dev-tools`)           | [Testing visual states](/guide/style/testing)                                  |
| `style_impact`, `style_matrix`, `style_debt`                                                                                         | The same questions as MCP tools                                     | [Testing visual states](/guide/style/testing#the-same-questions-from-an-agent) |

## Internationalisation

`@craft-ts/i18n` has no CraftTS, Angular or Effect import; the catalogue is a
plain TypeScript value.

| Symbol                                                                                                        | What it does                                                           | Page                                                                  |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `defineCatalog`, `msg`, `plural`                                                                              | The catalogue, its messages, and per-locale plural categories          | [The catalogue](/guide/i18n/catalog)                                  |
| `defineLocale`, `defineLocaleLike`                                                                            | The reference locale, and every other one checked against it           | [The catalogue](/guide/i18n/catalog)                                  |
| `number`, `integer`, `percent`, `compactNumber`, `money`, `dateShort`, `dateLong`, `dateTime`, `relativeTime` | The shipped semantic tokens, formatted through `Intl`                  | [Tokens](/guide/i18n/tokens)                                          |
| `defineToken`, `defineTokenFactory`, `formatters`                                                             | Project tokens, and the factory the shipped ones are built from        | [Tokens](/guide/i18n/tokens)                                          |
| `createI18nRuntime`, `translate` / `t`, `setLocale`, `locale`                                                 | The runtime and its one active locale                                  | [The runtime](/guide/i18n/runtime)                                    |
| `bind`, `createReactiveTranslator`                                                                            | A translator that re-reads when the locale state changes               | [The runtime](/guide/i18n/runtime#reactive-translation)               |
| `createI18nLoader`, `loadLocale`                                                                              | Lazy locales, cached by id, evicted on failure                         | [The runtime](/guide/i18n/runtime#lazy-locales)                       |
| `validateCatalog`, `assertValidCatalog`, `validateLocaleParity`, `assertLocaleParity`                         | The checks behind `npm run i18n:check` (also `@craft-ts/i18n/testing`) | [The catalogue](/guide/i18n/catalog#checking-outside-the-typechecker) |
| `I18nRuntimeError`                                                                                            | `NO_LOCALES`, `LOCALE_NOT_LOADED`, `INVALID_NUMBER`, `INVALID_DATE`    | [The runtime](/guide/i18n/runtime)                                    |
| `provideI18nRuntime`, `translateEffect`, `I18nEffectService`                                                  | The Effect adapter (`@craft-ts/i18n-effect`)                           | [With Effect](/guide/i18n/effect)                                     |

## Tooling

| Command / rule                     | What it does                                           | Page                                                                                                      |
| ---------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `npx craft route add`              | Scaffolds a typed route                                | [Automation](/guide/routing/automation)                                                                   |
| `npx craft route split`            | Splits a flat collection                               | [Scaling routes](/guide/routing/scaling)                                                                  |
| `npx craft route verify`           | Optional compiler-fixture suite for the type machinery | [Automation](/guide/routing/automation#compiler-fixture-suite-optional)                                   |
| `craft-brand --root src`           | Generates and refreshes `GenDeps_*`                    | [Brand config](/guide/routing/setup#generated-dependencies)                                               |
| `@craft-ts/dev-tools/eslint-rules` | The ESLint rule set                                    | [ESLint rules](/guide/routing/eslint-rules) · [Accessibility](/guide/components/accessibility)            |
| `npx craft-graph`                  | Writes the static Craft graph                          | [Architecture rules](/guide/testing/architecture) · [Craft graph vs Nx](/guide/testing/craft-graph-vs-nx) |
| `npx nx architecture <app>`        | Runs the app's architecture Vitest suite               | [Architecture rules](/guide/testing/architecture) · [Craft graph vs Nx](/guide/testing/craft-graph-vs-nx) |
| Live page MCP `page`               | Drive the open `ng serve` tab (dev only)               | [Live page MCP](/guide/ai/dev-page)                                                                       |
| Template migrator                  | Migrates templates to craft components                 | [Template migrator](/guide/components/template-migrator)                                                  |

## Deployment

::: warning Experimental
The deployment tooling is not settled: these symbols and commands can still
change between minor versions. See the
[deployment guide](/guide/deployment/) for what exists today.
:::

| Symbol / command                                                                                     | What it does                                                   | Page                                             |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------ |
| `defineCraftDeployment`                                                                              | Declares the deployment of an application in `craft.deploy.ts` | [Manifest reference](/guide/deployment/manifest) |
| `checkCraftDeployment`, `checkCraftDeploymentArtifact`                                               | Runs the manifest, module graph and artefact checks            | [Diagnostics](/guide/deployment/diagnostics)     |
| `resolveCraftDeploymentManifest`, `serializeCraftDeploymentManifest`, `parseCraftDeploymentManifest` | Resolves, writes and reads the provider-neutral artefact form  | [Manifest reference](/guide/deployment/manifest) |
| `CraftDeploymentProvider`, `CRAFT_DEPLOYMENT_PROVIDERS`                                              | The provider contract and the capability matrix                | [Providers](/guide/deployment/providers)         |
| `npx craft-ts check`                                                                                 | Validates a deployment before building                         | [Deployment overview](/guide/deployment/)        |
| `npx craft-ts manifest`                                                                              | Writes `dist/<app>/craft-deployment-manifest.json`             | [Deployment overview](/guide/deployment/)        |
| `npx craft-ts deploy preview`                                                                        | Shows what a provider would change, without changing it        | [Alchemy provider](/guide/deployment/alchemy)    |
| `npx craft-ts deploy`                                                                                | Applies that plan once `--yes` approves it                     | [Alchemy provider](/guide/deployment/alchemy)    |
| `createCraftDeploymentProvider`                                                                      | The single factory a provider package exports                  | [Providers](/guide/deployment/providers)         |
| `createAlchemyDeploymentProvider`, `planAlchemyDeployment`                                           | The Alchemy provider and its Cloudflare/AWS planning           | [Alchemy provider](/guide/deployment/alchemy)    |
| `npx craft-ts providers`                                                                             | Prints the provider capability matrix                          | [Providers](/guide/deployment/providers)         |

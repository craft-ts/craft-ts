# What craft adds to Angular

Craft is not a replacement for Angular — it runs on Angular's DI, signals and
router. This page is the honest list of what you get **on top**, and what it
costs.

If you want the reasoning rather than the inventory, read
[The mental model](/guide/concepts/mental-model).

## The compiler catches more

| | Angular | Craft |
| --- | --- | --- |
| Missing provider | runtime `NullInjectorError` | **compile error** at the route |
| Missing / misnamed component input | runtime, or silently `undefined` | **compile error** at the call site |
| Navigating to a route that doesn't exist | runtime 404 | **compile error** |
| Missing route param | runtime | **compile error** |
| Unhandled declared failure | nothing — you find out in production | **compile error** (exhaustiveness) |
| Handling a failure that can't happen | dead code nobody notices | **compile error** |
| Forgetting to mock a dependency in a test | test passes for the wrong reason | **compile error** |
| A template stops rendering an element | silent | **compile error**, if asserted |

That column is the whole point. Everything below exists to make it possible.

## Dependencies are visible in the type

`inject(X)` hides the graph: nothing in a consumer's type says `X` is needed.
`yield* X()` puts it in the type, which is what lets the route check, the test
register and the dependency snapshot all read the same source of truth.

You can also yield **part** of a service — `yield* X.someProperty()` — so the
graph records exactly what you used, and a test provides exactly that.

## State primitives, not patterns

Angular gives you `signal`, `computed`, `resource` and leaves the composition to
you. Craft ships five primitives with one shape —
[`state`, `query`, `mutation`, `queryParams`, `asyncProcess`](/guide/concepts/choose-primitive) —
each carrying its own status, exceptions and derived values.

- **URL state as a primitive.** `queryParams` makes the query string the source
  of truth, with typed codecs. No `ActivatedRoute` subscription, no
  synchronisation effect.
- **Declarative read/write links.** `insertReactOnMutation` connects a mutation
  to the queries it invalidates, including optimistic updates with automatic
  rollback — instead of calling `refetch()` from the call site.
- **Composable behaviour.** Insertions (storage persistence, pagination
  placeholders, entity collections) are plain functions of the same shape as the
  ones you write.

## Services are functions

A `craftService` is a factory with a name and a scope: no class, no decorator, no
constructor. Scopes are explicit (`function`, `toProvide`, `global`,
`manuallyProvidedAtRoot`, `abstract`) rather than inferred from where you
happened to put `providedIn`.

`abstract` services turn "who implements this" into a decision of the mounting
site — a route, a feature config, a test — with the compiler enforcing that
someone did.

## Components are functions

- Inputs and outputs are **factory parameters**, so binding errors are type
  errors.
- Templates are TypeScript: `each`, `ifBlock`, `matchBlock`, `defer` instead of
  `@for` / `@if` / `@switch` / `@defer`. `matchBlock.exhaustive` is stricter than
  `@switch` — a missing case doesn't compile.
- No host element is inserted. Styles are scoped with CSS `@scope`, `:scope`
  being the component's own root.
- **Directives compose with `.pipe(...)`** and decorate *both* the logic factory
  and the template, so behaviour and markup travel together.
- **Content projection is a rendering context**, not a component category, with
  DOM contracts (`RequiredContent`) checked statically.

## Exceptions are values

A declared failure is a `craftException` **returned**, not thrown — so it flows
through types instead of escaping through the stack.

- Read them by origin: `exceptions().params` (rejected before the request) vs
  `exceptions().loader` (produced by it).
- A component's unhandled codes flow up into its route's union.
- `assertExhaustiveRouteExceptions(routes)` proves every reachable code is
  handled, and that no handler is dead.

Errors — the unexpected kind — stay separate and reach the global error
component. See [Exceptions as values](/guide/concepts/exceptions).

## Routing

- Type-safe navigation, params and query params.
- **Non-blocking navigation**: the URL commits immediately and a pending
  component appears only if the wait is real, with a stay → blank → loader
  timeline you configure.
- Route-scoped providers built from the route's **own** params, data and guarded
  values.
- `withRetry` on lazy chunks, plus a dedicated route-load-error path for a stale
  deploy or a flaky network — the failure mode where Angular gives you a dead
  navigation.
- Guards are bare generators, composable and parameterisable.

## Testing

- Registers derived from the real dependency graph: forgetting a mock is a
  compile error.
- `boundaryOnly` keeps the whole app graph real and mocks only what touches the
  platform, so a passing test means something.
- Components split into a logic test (no DOM) and a template test (no factory).
- [Type-level tests](/guide/testing/type-level) assert the template contract
  itself — that an element renders only under a condition, that a binding is the
  one you think.

## Because it's declarative, you get observability for free

This one is a consequence rather than a feature. Because every dependency
resolution, every primitive and every crafted function goes through one system,
that system is also where you can wrap them all:

- structured logging through a yieldable `Console` you can override once;
- correlation ids propagated across the graph;
- app snapshots of the live dependency tree;
- per-service timing and tracing, via `provideServiceYieldWrapper` /
  `provideFnWrapper`, without touching business code.

Retrofitting that onto imperative code means instrumenting every call site. Here
it is one provider. See [Observability](/guide/advanced/observability).

The same property is what makes an app **legible to a machine** — an agent, or a
future WebMCP-style integration — because the dependency graph, the reachable
exceptions and the route contract are all declared data rather than control flow
to be inferred.

## Tooling

- `craft route add` / `craft route split` scaffold typed routes; the output is
  ordinary editable TypeScript.
- ESLint rules that enforce the architecture and autofix most of it
  (`no-angular-inject`, `prefer-craft-service`, `prefer-craft-http-client`,
  `require-cascade-route-di-check`, …).
- Codemods to migrate an existing Angular app progressively.

## What it costs

Being fair about the trade:

- **A new vocabulary.** Generators, insertions, scopes and yields are unfamiliar
  before they are useful.
- **Type-checking time.** Deep inference is not free; large route collections
  need splitting ([Scaling routes](/guide/routing/scaling)).
- **Error messages.** A failed inference deep in a type can read badly.
- **Experimental.** The library and this documentation both still move between
  minor versions — see the [migration notes](/resources/migration).

## See Also

- [The mental model](/guide/concepts/mental-model)
- [Learn: the guided path](/learn/)
- [Which primitive should I use?](/guide/concepts/choose-primitive)

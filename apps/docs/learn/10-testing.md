# 10. Test what you wrote

**Goal:** test `TaskList` and the `Tasks` component without guessing what to
mock — the dependency graph tells you.

## The idea

Most test setups let you forget a dependency and find out at runtime. Craft
inverts it: you pass a **register** covering the whole graph, and the compiler
refuses to run the test until every node is accounted for.

Each node is one of four things: `'real'`, its own `provideX(...)`, a mock
object, or `'notReached'`.

## Testing a service

Here is the service under test — the one from [step 4](/learn/04-compose), with
its scope changed to `toProvide` so it has a `provideTaskStats()` to mount in
the test:

<<< @/tests/snippets/learn/10-testing/task-stats.spec.ts#task-stats

It depends on one thing, `TaskList`, and exposes one thing, `done`. The test
mirrors that exactly:

<<< @/tests/snippets/learn/10-testing/task-stats.spec.ts#task-stats-test

`sut` is the service under test; `mocks` gives you back the mocks you supplied,
already typed, so `mocks.TaskList.$self` is assertable.

::: tip Which register entry to use
`provideX()` for a `toProvide` or `manuallyProvidedAtRoot` service, `'real'` for
a reachable `global` or `function` one, a plain object to mock it, and
`'notReached'` for a branch this test never touches.
:::

`$self` is the service's own returned value — the ref itself, as opposed to a
property hanging off it.

## Why the register is small

Because of step 4. `TaskStats` yielded only what it needed, so the register only
asks for that. Had it yielded the whole `TaskApi`, the register would demand
`TaskApi` too. **Precise yields make short tests** — that's the payoff for the
`yield*` discipline.

## Testing a component

Here is the component under test, from steps 2 and 3 — a factory that yields
`TaskList`, and a template that renders it:

<<< @/tests/snippets/learn/10-testing/tasks.spec.ts#tasks-component

Those two halves are tested **independently**: the factory produces a context
without touching the DOM, and the template renders a context without running the
factory.

The logic test runs the factory only — no DOM:

<<< @/tests/snippets/learn/10-testing/tasks.spec.ts#tasks-logic-test

The template test does the opposite — it renders with a context you hand it, and
never runs the factory:

<<< @/tests/snippets/learn/10-testing/tasks.spec.ts#tasks-template-test

That separation is why component tests stay fast: you only pay for the DOM when
the DOM is what you're asserting on.

## Finding elements

Template tests expose `locator(tag, criteria)` rather than raw CSS selectors:

```typescript
const removeButton = test.locator('button', { 'data-testid': 'remove' });
removeButton?.click();
```

## Proving it at the type level

Some of what craft guarantees isn't observable at runtime at all — it's in the
types. Those get their own kind of test, resolved by the compiler with no
`TestBed`, no DOM and no factory:

```typescript
type TasksTemplateTest = SetupTestComponentTemplate<typeof Tasks, [typeof TaskRow]>;
```

The resolver walks elements, directives, `each`, `defer` and child components,
and a child missing from the tuple becomes a type diagnostic. Companion
assertions — `TemplateHasElement`, `TemplateHasElementWithProps`,
`TemplateHasYieldableEvent`, `TemplateRendersStateWhen` — check that the template
really renders what you think, including event argument types.

This is how you pin down a template contract that a runtime test would only
catch by accident. Full reference:
[Type-level tests](/guide/testing/type-level).

## Tests that stay close to reality

Mocking everything makes tests that pass while the app is broken. `boundaryOnly`
keeps the real graph and lets you replace only what actually touches the outside
world — the services marked `browserBoundary: true` (HTTP, storage, location):

```typescript
const { sut } = await setupCraftServiceTestingByRegister(TaskList, register, {
  boundaryOnly: true,
});
```

Everything in between runs for real. See
[Browser boundaries](/guide/testing/browser-boundaries).

## Architecture of the whole app

The register proves one service's graph is complete. Architecture rules prove
invariants **across** services: this feature must not depend on that one, this
HTTP endpoint is owned once, this `craftUnique` storage key appears once.

They live next to `e2e/`, analyze TypeScript without starting the application, and are
ordinary Vitest assertions on a typed graph. Look a node up, walk its edges,
assert. A precise rule — HTTP may only be called from a `browserBoundary`
service — is an `it()`:

```typescript
it('only browser-boundary services call HTTP', () => {
  const boundaryIds = new Set(
    graph.services({ browserBoundary: true }).map((node) => node.id),
  );
  const leaked = graph
    .usingHttp()
    .filter((node) => node.kind === 'service' && !boundaryIds.has(node.id));
  expect(leaked.map((node) => node.label)).toEqual([]);
});
```

Anything you can see on the graph is a rule you can write: folder lanes,
exclusive feature branches, a method that must not both be called and write a
`source$`. Built-in helpers cover unique `craftUnique` identities, unique HTTP
verb+URL, pure `craftComputed`, no `depends-on` cycles, `assertPathBoundaries`,
`noExclusiveLink`, `assertMutationHasReactOn`, `assertPersistedPrimitiveHasUnique`,
`assertInsertSelectUnique`, `assertCraftEffectNoNetwork`,
`assertCraftEffectNoImperativeSync`, `assertInteractiveElementNamed`, and the route DI
proofs from [step 9](/learn/09-routing).

Those proofs (`CanRun`, `RouteCheckedDI`) are unused type aliases — omit one
and the project still compiles. `assertRouteDiProofs` fails the suite unless
every routed component and every `app.config` error screen stays hooked to an
armed mapper. TypeScript still judges injection; the architecture suite judges
whether that judgement was invoked.

Full setup: [Architecture rules](/guide/testing/architecture). Why that graph
is not Nx's project graph: [Craft graph vs Nx](/guide/testing/craft-graph-vs-nx).
The demo app already imports the helpers. From the repository root:

```shell
npx nx architecture demo
```

## What you gained

Tests whose setup is derived from the real dependency graph, so "I forgot to
mock that" becomes a compile error — and architecture rules on that same graph,
so the app can be taught its boundaries.

<div style="display: flex; justify-content: space-between; margin-top: 2rem">

[← 9. Wire up routing](/learn/09-routing)

[Where to go next →](/learn/next)

</div>

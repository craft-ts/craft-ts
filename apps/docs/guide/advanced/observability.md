# Observability

Because every dependency is resolved through one system, that system is also the
place to cross-cut them all — logging, timing, correlation ids, snapshots — with
no change to the business code.

**Use it when** you need to see what your app is doing in production, or to
connect craft to your monitoring stack.
**Start with `Console`**: it is yieldable, so overriding it once redirects every
log in the app.

The same DI system that powers `craftService` also lets you cross-cut every crafted function with side effects — logging, snapshots, correlation tracking, timing, error reporting — without touching the business code.

## Mental Model

`craft-ts` distinguishes two kinds of failures:

- **Expected errors**: handled explicitly with [`craftException`](/guide/app/craft-service) in your business code.
- **Unexpected errors**: bugs. They should never happen — and if they do, they should never happen _again_.

Unexpected errors are exactly where observability shines. Since they are supposed to be impossible, you want to capture the maximum amount of context the moment one is thrown: stack, app state, correlation chain, etc. That context can then be shipped to a log server, an alerting pipeline, or directly to an AI webhook for triage.

The three pillars `craft-ts` exposes for that are:

- [`provideFnWrapper`](#providefnwrapper) — wrap every crafted function with cross-cutting behavior
- [`provideTemplateTrace`](#providetemplatetrace) — observe effective component and template renders
- [`provideCraftRouterTrace`](#providecraftroutertrace) — observe Angular navigation events and Craft route stages
- [`provideCraftHttpTrace`](#providecrafthttptrace) — wrap every `CraftHttpClient` request
- [`provideTakeAppSnapshot`](#providetakeappsnapshot) — capture all active state when something goes wrong
- [`provideCraftDomEventHook`](#craft-dom-event-hooks) — observe or wrap every DOM action declared in a Craft template
- [`provideCorrelationIdTracking`](#providecorrelationidtracking) — link a user gesture to every async operation it triggered

## `provideFnWrapper`

`provideFnWrapper` lets you wrap **every** generator-based function executed by `craft-ts` (services, methods, async processes, queries, mutations, effects…). It is the single best entry point to add cross-cutting side effects.

Basic use case — log any unexpected error to the console:

```ts
import { craftAppConfig, provideFnWrapper, Console } from '@craft-ts/core';

export const appConfig = craftAppConfig({
  // ...
  providers: [
    provideFnWrapper(
      'Warning: dependency injection here is not type-safe and may fail at runtime',
      function* (factory, thisArg, args) {
        try {
          return yield* factory.apply(thisArg, args);
        } catch (error) {
          yield* Console.error(error);
          throw error;
        }
      },
    ),
  ],
});
```

You can register multiple wrappers — they compose. The first registered is the outermost.

## `provideTemplateTrace`

`provideTemplateTrace` is the render-specific counterpart to
`provideFnWrapper`. It runs synchronously around the children produced by an
effective render, including component templates, reactive updates, blocks,
projections, deferred branches, and nested callbacks.

```ts
import { provideTemplateTrace } from '@craft-ts/core';

provideTemplateTrace((context, next) => {
  const start = performance.now();
  try {
    return next();
  } finally {
    console.debug(
      context.phase,
      context.componentName,
      performance.now() - start,
    );
  }
});
```

The context contains the render unit (`component`, `block`, `projection`,
`defer`, or `callback`), its phase (`create`, `initialRender`, `update`, or
`destroy`), the optional component/unit names, and the owning component's
`renderCount`. Wrappers compose in registration order and execute in the
current render injector, so component-scoped providers remain injectable.

The wrapper can return different children or return an empty children value
without calling `next()` to replace or block a render. Errors propagate to the
normal Craft render error boundary.

## `provideCraftRouterTrace`

`provideCraftRouterTrace` traces both the Angular Router event stream and the
Craft outlet's non-blocking route chain. The latter exposes `match`, `guard`,
and `resolve` stages, including reactive guard re-evaluation.

```ts
import { provideCraftRouterTrace } from '@craft-ts/core';

provideCraftRouterTrace((context, next) => {
  console.log('[router:start]', context);
  const result = next();
  console.log('[router:end]', context);
  return result;
});
```

Multiple wrappers compose in registration order. The wrapper must call
`next()` to preserve the navigation or route-chain work.

## `provideCraftHttpTrace`

`provideCraftHttpTrace` wraps the actual thenable request produced by
`CraftHttpClient`, after its method, URL, params, and payload have been built.
It is therefore useful for timing, request logging, redaction, and error
reporting without changing feature code.

```ts
import { provideCraftHttpTrace } from '@craft-ts/core';

provideCraftHttpTrace(async (context, next) => {
  const start = performance.now();
  try {
    return await next();
  } finally {
    console.log(context.method, context.url, performance.now() - start);
  }
});
```

### Important: injection inside `provideFnWrapper` is not type-safe

The wrapper body runs in **the injection context where the error was raised**, not where the wrapper was declared. That makes it extremely practical: you can yield browser boundaries, inject host-tagged metadata, read the offending service's correlation id, etc.

But it has two consequences:

- injections inside the wrapper are **not type-safe** — `craft-ts` cannot prove statically that the dependency you ask for is actually provided where the wrapper runs
- the wrapper is therefore a **risky** place to do business work

::: tip
Use `provideFnWrapper` mostly for **side effects** — logging, metrics, snapshots, correlation propagation. Avoid pulling business state through it.
:::

When the wrapped function is an insertion method, the wrapper can inject the
matching runtime context — `injectQueryMethodRuntimeContext()`,
`injectStateMethodRuntimeContext()`, and the siblings for `mutation`,
`queryParams`, and `asyncProcess` — and call `get` / `set` / `update` /
`patch` on the owning primitive. That is how registries, WebMCP tools, and
other advanced patterns seed or replace a query result, a mutation value, a
`state`, and so on. See
[Anatomy of a primitive](/guide/concepts/primitive-anatomy#injectable-runtime-context).

### Example: timing every craft function

```ts
import { craftAppConfig, provideFnWrapper, HostTag } from '@craft-ts/core';

provideFnWrapper(
  'Warning: dependency injection here is not type-safe and may fail at runtime',
  function* (factory, thisArg, args) {
    const start = performance.now();
    try {
      return yield* factory.apply(thisArg, args);
    } finally {
      const name = yield* HostTag();
      console.log(`${name} took ${performance.now() - start}ms`);
    }
  },
);
```

## `provideTakeAppSnapshot`

`provideTakeAppSnapshot` captures the list of all **active states** in the app the moment an unexpected error occurs.

This is one of the most valuable pieces of context you can ship to a log server or AI webhook: you get not just the stack, but the full picture of what the app was holding when it broke.

```ts
import { craftAppConfig, provideTakeAppSnapshot } from '@craft-ts/core';

export const appConfig = craftAppConfig({
  // ...
  providers: [
    provideTakeAppSnapshot((reports) => {
      // reports: SnapshotReport[]
      // — one entry per active state, with its source, ancestry, and current value
      console.warn('App snapshot:', reports);

      // In production you would forward this to a log server or AI webhook:
      // fetch('/api/incident', { method: 'POST', body: JSON.stringify({ reports }) });
    }),
  ],
});
```

Each `SnapshotReport` contains:

- `source` — the host tag of the state
- `from` — the ancestry chain that produced it
- `state` — the actual current value

Under the hood, `provideTakeAppSnapshot` registers its own `provideFnWrapper` that triggers the snapshot collection whenever an unexpected error bubbles up. CraftTS control-flow throws such as `CraftGenShortCircuit` and `CraftNotSettled` are deliberately excluded: they are consumed by `catchBlock` and `pendingBlock` boundaries during normal rendering. An unhandled boundary error remains observable and still triggers a snapshot. You do not need to call it manually.

## Craft DOM event hooks

Every DOM event bound from a Craft template goes through the
`CRAFT_DOM_EVENT_HOOK` token. Hooks run in the injector of the component that
declared the element, and compose in registration order. A hook must call
`next()` to preserve the component action.

<<< @/tests/snippets/guide/advanced/observability/savepanel.spec.ts#savepanel


The hook receives the native event, its normalized name, the element, the
component name, and a descriptive `interactionName` such as
`SavePanel:button:save:click`. This is the extension point for analytics,
authorization, tracing, or correlation IDs. A hook can also stop an action by
not calling `next()`.

## `provideCorrelationIdTracking`

`provideCorrelationIdTracking` ties every async operation back to the **user gesture** that triggered it.

When a Craft template action runs, a fresh correlation id is generated from its
location (`SavePanel:button:save:click:uuid`, for example). Navigation back and
forward still generate `nav-back:uuid` and `nav-forward:uuid`. Every generator
invoked downstream — directly or transitively, sync or async — captures that
id at invocation time.

```ts
import { craftAppConfig, provideCorrelationIdTracking } from '@craft-ts/core';

export const appConfig = craftAppConfig({
  // ...
  providers: [provideCorrelationIdTracking()],
});
```

Once enabled, the correlation id is attached to the metadata of browser boundaries like `Console`, so a single `yield* Console.error(...)` carries:

- `startCorrelationId` — the id captured when the current generator was invoked
- `lastCorrelationId` — the most recent id observed in the app
- `mayCorrelatedIds` — the chain of ids the operation can be linked to

This lets you reconstruct, from logs alone, the full causal chain between _"user clicked Save"_ and _"the third sub-request returned 500 four seconds later"_.

Combined with `provideTakeAppSnapshot`, you get on every unexpected error:

- the stack
- the snapshot of all active states
- the correlation id chain back to the originating user gesture

## Putting It All Together

Wire all three in your `appConfig`:

```ts
import {
  craftAppConfig,
  Console,
  provideFnWrapper,
  provideTakeAppSnapshot,
  provideCorrelationIdTracking,
} from '@craft-ts/core';

export const appConfig = craftAppConfig({
  // ...
  providers: [
    provideFnWrapper(
      'Warning: dependency injection here is not type-safe and may fail at runtime',
      function* (factory, thisArg, args) {
        try {
          return yield* factory.apply(thisArg, args);
        } catch (error) {
          yield* Console.error(error);
          throw error;
        }
      },
    ),
    provideCorrelationIdTracking(),
    provideTakeAppSnapshot((reports) => {
      // forward to your log server or AI webhook
      console.warn('App snapshot:', reports);
    }),
  ],
});
```

You now have, on any unexpected error: a console error in dev, a full app snapshot, and the correlation chain back to the originating user action — all without a single line of instrumentation inside your business code.

## See Also

- [`craftService`](/guide/app/craft-service)
- [`Browser Boundaries`](/guide/testing/browser-boundaries) — `Console`, `LocalStorage`, etc., used inside wrappers

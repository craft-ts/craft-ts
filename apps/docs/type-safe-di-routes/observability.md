# Observability

`craft-ng` makes it very simple to set up observability mechanisms thanks to its dependency injection system, which it leverages to the fullest.

The same DI system that powers `craftService` also lets you cross-cut every crafted function with side effects — logging, snapshots, correlation tracking, timing, error reporting — without touching the business code.

## Mental Model

`craft-ng` distinguishes two kinds of failures:

- **Expected errors**: handled explicitly with [`craftException`](/store/craft-service) in your business code.
- **Unexpected errors**: bugs. They should never happen — and if they do, they should never happen *again*.

Unexpected errors are exactly where observability shines. Since they are supposed to be impossible, you want to capture the maximum amount of context the moment one is thrown: stack, app state, correlation chain, etc. That context can then be shipped to a log server, an alerting pipeline, or directly to an AI webhook for triage.

The three pillars `craft-ng` exposes for that are:

- [`provideFnWrapper`](#providefnwrapper) — wrap every crafted function with cross-cutting behavior
- [`provideTakeAppSnapshot`](#providetakeappsnapshot) — capture all active state when something goes wrong
- [`provideCorrelationIdTracking`](#providecorrelationidtracking) — link a user gesture to every async operation it triggered

## `provideFnWrapper`

`provideFnWrapper` lets you wrap **every** generator-based function executed by `craft-ng` (services, methods, async processes, queries, mutations, effects…). It is the single best entry point to add cross-cutting side effects.

Basic use case — log any unexpected error to the console:

```ts
import { craftAppConfig, provideFnWrapper, Console } from '@craft-ng/core';

export const appConfig = craftAppConfig({
  // ...
  providers: [
    provideFnWrapper(function* (factory, thisArg, args) {
      try {
        return yield* factory.apply(thisArg, args);
      } catch (error) {
        yield* Console.error(error);
        throw error;
      }
    }),
  ],
});
```

You can register multiple wrappers — they compose. The first registered is the outermost.

### Important: injection inside `provideFnWrapper` is not type-safe

The wrapper body runs in **the injection context where the error was raised**, not where the wrapper was declared. That makes it extremely practical: you can yield browser boundaries, inject host-tagged metadata, read the offending service's correlation id, etc.

But it has two consequences:

- injections inside the wrapper are **not type-safe** — `craft-ng` cannot prove statically that the dependency you ask for is actually provided where the wrapper runs
- the wrapper is therefore a **risky** place to do business work

::: tip
Use `provideFnWrapper` mostly for **side effects** — logging, metrics, snapshots, correlation propagation. Avoid pulling business state through it.
:::

### Example: timing every craft function

```ts
import {
  craftAppConfig,
  provideFnWrapper,
  HostTagToYield,
} from '@craft-ng/core';

provideFnWrapper(function* (factory, thisArg, args) {
  const start = performance.now();
  try {
    return yield* factory.apply(thisArg, args);
  } finally {
    const name = yield* HostTagToYield();
    console.log(`${name} took ${performance.now() - start}ms`);
  }
});
```

## `provideTakeAppSnapshot`

`provideTakeAppSnapshot` captures the list of all **active states** in the app the moment an unexpected error occurs.

This is one of the most valuable pieces of context you can ship to a log server or AI webhook: you get not just the stack, but the full picture of what the app was holding when it broke.

```ts
import { craftAppConfig, provideTakeAppSnapshot } from '@craft-ng/core';

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

Under the hood, `provideTakeAppSnapshot` registers its own `provideFnWrapper` that triggers the snapshot collection whenever an unexpected error bubbles up. You do not need to call it manually.

## `provideCorrelationIdTracking`

`provideCorrelationIdTracking` ties every async operation back to the **user gesture** that triggered it.

When the user clicks, presses Enter, or navigates back/forward, a fresh correlation id is generated (`click:uuid`, `enter:uuid`, `nav-back:uuid`, `nav-forward:uuid`). Every generator invoked downstream — directly or transitively, sync or async — captures that id at invocation time.

```ts
import { craftAppConfig, provideCorrelationIdTracking } from '@craft-ng/core';

export const appConfig = craftAppConfig({
  // ...
  providers: [provideCorrelationIdTracking()],
});
```

Once enabled, the correlation id is attached to the metadata of browser boundaries like `Console`, so a single `yield* Console.error(...)` carries:

- `startCorrelationId` — the id captured when the current generator was invoked
- `lastCorrelationId` — the most recent id observed in the app
- `mayCorrelatedIds` — the chain of ids the operation can be linked to

This lets you reconstruct, from logs alone, the full causal chain between *"user clicked Save"* and *"the third sub-request returned 500 four seconds later"*.

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
} from '@craft-ng/core';

export const appConfig = craftAppConfig({
  // ...
  providers: [
    provideFnWrapper(function* (factory, thisArg, args) {
      try {
        return yield* factory.apply(thisArg, args);
      } catch (error) {
        yield* Console.error(error);
        throw error;
      }
    }),
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

- [`craftService`](/store/craft-service)
- [`Browser Boundaries`](/type-safe-di-routes/browser-boundaries) — `Console`, `LocalStorage`, etc., used inside wrappers

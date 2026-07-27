# Program Operators (`.pipe`)

Compose, recover and retry `craftGen` programs with Effect-inspired operators — without leaving
the generator model.

## Import

```typescript
import { catchTag, retry } from '@craft-ng/core';
import type { CraftProgramOperator, CraftRetryPolicy } from '@craft-ng/core';
```

## What it does

Every `craftGen` invocation is a **program**: a `yield*`-composable generator that carries three
typed channels:

- **`A`** — the success value returned through `yield*`
- **`E`** — the union of `craftException` codes it may short-circuit with (type-level only)
- **dependencies** — the craft service yields relayed to the surrounding driver

Invocations now expose `.pipe(...)`, which applies **program operators** left-to-right:

```typescript
const report =
  yield *
  loadSlowReport().pipe(
    catchTag('REPORT_EMPTY', function* () {
      return { generatedAt: 'n/a', totalUsers: 0 };
    }),
    retry({ times: 2, backoff: 'exponential', delayMs: 200 }),
  );
```

Existing code is untouched: `yield* myProgram(args)` without `.pipe` works exactly as before.

## Why it matters

Before operators, the **only** place a program's exception could be handled was the route
boundary (`handleExceptions`). Every reachable code forced a route-level handler, even when the
right answer was local ("fall back to an empty report", "retry the flaky call").

With `.pipe`:

- `catchTag` recovers a code **where the fallback is known** — the code leaves `E`, so the route
  no longer requires a handler for it
- `retry` re-executes the whole upstream chain on failure
- everything stays typed: `E` shrinks/grows through each operator, and route exhaustiveness keeps
  checking the **remaining** codes

## `catchTag(code, handler)`

Catches one exception code. The handler is a generator: its yields (craft services, nested
programs, `craftUntilSettled`) are relayed to the driver, so its dependencies stay tracked.

```typescript
const loadSlowReport = craftGen(function* () {
  const reportRef = yield* SlowReport();
  const report = yield* craftUntilSettled(reportRef);
  return report.totalUsers === 0
    ? craftException({ code: 'REPORT_EMPTY' })
    : report;
});

// In a route resolve: REPORT_EMPTY is recovered locally, so it is REMOVED from
// the route's exception union — `handleExceptions` does not need (and must not
// declare) a handler for it.
resolve: craftResolve(function* () {
  return yield* loadSlowReport().pipe(
    catchTag('REPORT_EMPTY', function* () {
      return { generatedAt: 'n/a', totalUsers: 0 };
    }),
  );
}),
```

Type effects:

- `E' = E \ code` plus whatever the handler itself may produce
- `A' = A | handler success value`
- the handler receives the caught exception (`code` + `payload`)

A handler can also **re-enter** the exception channel by returning a `craftException` (the new
code is added to `E`):

```typescript
catchTag('HTTP_TIMEOUT', function* (exception) {
  const flags = yield* FeatureFlags();
  return flags.offlineMode()
    ? cachedFallback
    : craftException({ code: 'SERVICE_UNAVAILABLE' });
});
```

## `catchTag.exhaustive(handlerMap)`

Catches **every** reachable code through a map that must cover the program's exception union
exactly — a missing code or a handler for an unreachable code is a **compile error** at the
`.pipe` application site. Afterwards `E = never`.

```typescript
const user =
  yield *
  loadUser(userId).pipe(
    catchTag.exhaustive({
      NOT_FOUND: function* () {
        return GUEST_USER;
      },
      FORBIDDEN: function* () {
        const audit = yield* Audit();
        audit.report('forbidden-user-access');
        return GUEST_USER;
      },
    }),
  );
// `user` can no longer fail: E = never
```

```typescript
// ⛔ compile error — missing handler for 'FORBIDDEN'
loadUser(userId).pipe(
  catchTag.exhaustive({
    NOT_FOUND: function* () {
      return GUEST_USER;
    },
  }),
);

// ⛔ compile error — 'TEAPOT' is not a reachable code
loadUser(userId).pipe(
  catchTag.exhaustive({
    NOT_FOUND: function* () {
      return GUEST_USER;
    },
    FORBIDDEN: function* () {
      return GUEST_USER;
    },
    TEAPOT: function* () {
      return GUEST_USER;
    },
  }),
);
```

::: tip Where the check happens
The exception union is only known once the operator is applied to a program, so exhaustiveness is
verified at the `.pipe` call site — not when `catchTag.exhaustive({...})` is built. The handler
parameter is typed `AnyCraftException & { code }` (payload `unknown`): narrow the payload yourself
if you need it.
:::

## `retry(policy)`

Re-executes the program when it fails with a matched `craftException`, up to `times` extra
attempts, then rethrows. Each attempt **replays the whole upstream `.pipe` chain** from the source
invocation.

```typescript
canActivate: function* () {
  return yield* slowAccessGuard().pipe(
    retry({ times: 2, backoff: 'linear', delayMs: 250 }),
  );
},
```

```typescript
export type CraftRetryPolicy = {
  times: number; // max RE-executions after the initial attempt
  while?: string[]; // only retry these codes (all when omitted)
  backoff?: 'none' | 'linear' | 'exponential';
  delayMs?: number; // 'none' → flat, 'linear' → delayMs * attempt,
  //                   'exponential' → delayMs * 2^(attempt-1)
};
```

Notes:

- `E` and `A` are unchanged — retry may exhaust and rethrow the same exception
- a non-zero `delayMs` suspends between attempts (an internal await-request), so it needs an
  async driver: a route chain or a primitive loader. In a purely synchronous context the usual
  await-not-supported behaviour of that driver applies
- only re-invocable programs can be retried (a `craftGen` invocation or a `.pipe` stage); passing
  a hand-built bare generator raises an explicit error on the first needed retry

## Programs inside `query` / `mutation` / `asyncProcess` loaders

The three primitives drive their generator loaders with the same async pump as route guards, so
loaders can suspend on `craftUntilSettled` and compose programs:

```typescript
const { userQuery } = query('userQuery', {
  params: () => userId(),
  loader: function* ({ params }) {
    const api = yield* UserApi();
    return yield* loadUser(params).pipe(
      retry({ times: 3, backoff: 'exponential', delayMs: 200 }),
    );
  },
});
```

An **uncaught** program exception does not crash the loader: it feeds the primitive's exception
channel —

```typescript
queryRef.status(); // 'exception'
queryRef.hasException(); // true
queryRef.exception()?.code; // e.g. 'USER_NOT_FOUND'
queryRef.exception()?.payload; // the exception payload
```

— and the loader's reachable program exceptions are folded into the primitive's typed
`exception()` union.

## Custom operators

An operator is just a function from one program generator to another. Type yours with
`CraftProgramOperator`:

```typescript
import type { CraftProgramOperator } from '@craft-ng/core';

// Measures the program duration; passes everything else through unchanged.
const timed =
  (label: string): CraftProgramOperator<unknown, unknown, unknown, unknown> =>
  (program) =>
    (function* () {
      const start = performance.now();
      try {
        return yield* program;
      } finally {
        console.debug(`${label}: ${performance.now() - start}ms`);
      }
    })();
```

Guidelines:

- always consume the received program with `yield*` (a generator that is never driven does
  nothing)
- relay foreign yields untouched so dependency tracking keeps working
- let `CraftGenShortCircuit` propagate unless handling exceptions is the operator's purpose

## How it behaves

- Operators are plain generator wrappers: no driver knows about them, and `E` travels only at the
  type level (the runtime signal is a thrown `CraftGenShortCircuit`)
- `.pipe` folds left-to-right; each stage is itself a program, so operators after it can replay it
  (that is how `retry` after `catchTag` re-runs the recovery too)
- `catchTag.exhaustive` rethrows a code outside its typed map (runtime safety net for exceptions
  that escaped the types)

## See Also

- [`craftGen`](/type-safe-di-routes/craft-gen) — building programs
- [`Route Guards`](/type-safe-di-routes/guards) — where guard programs run
- [`Exception Handling`](/type-safe-di-routes/exception-handling) — the route-boundary
  counterpart (`handleExceptions`)
- [`query`](/primitives/query) — loaders as programs

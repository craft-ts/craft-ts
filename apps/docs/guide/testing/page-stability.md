# Page stability

A page can loop without anything failing. A component or service is rebuilt
over and over, a `query` reloads in a burst, one URL is requested fifty times a
second: the page keeps drawing, the console stays empty, no navigation happens,
and the first symptom is a server that saturates. Assertions on what is drawn
all pass while the loop runs underneath.

Three tools make that visible, from development to CI:

| Tool                                                       | Catches it…                    |
| ---------------------------------------------------------- | ------------------------------ |
| [the loop guard](#the-loop-guard-in-development)           | while you use the app          |
| [`expectRouteToSettle`](#testing-that-a-page-settles)      | in a unit or end-to-end test   |
| [the rules](#rules-that-require-the-tests) (architecture, ESLint) | when the test or the sleep is missing |

## The loop guard, in development

`provideCraftLoopGuard()` counts what the runtime already sees — primitive
creation and destruction, loader starts, HTTP requests — over a sliding window.
When a count crosses a threshold it reports a **suspicion** that names the
primitive, its kind and its frequency, on the console, in an alert in the page,
and on `window.__CRAFT_LOOP_GUARD__`.

```typescript
import { provideCraftLoopGuard } from '@craft-ts/component';

export const appConfig = craftAppConfig({
  providers: [
    ...(isDevMode()
      ? provideCraftLoopGuard({
          tripBreaker: true,
          exempt: { 'GET /api/ticker': { httpRequests: 60 } },
        })
      : []),
  ],
});
```

It installs nothing when `enabled` is `false` or in production mode
(`provideCraftProduction()`); an application that never calls it pays one
boolean check per primitive.

### What it detects

| Kind              | A suspicion when, within the window…                                     | Default |
| ----------------- | ------------------------------------------------------------------------ | ------- |
| `instantiation`   | the same primitive is created again (render waves, not rows of a list)   | 20      |
| `loader-restart`  | one `query` / `mutation` / `asyncProcess` loader starts again            | 20      |
| `http-burst`      | one method + URL is requested (the query string is ignored)              | 20      |
| `leaked-instance` | instances of one primitive are alive together, each created in the window | 10      |

The window is 10 seconds. A poll every 5 seconds makes 2 requests in it, so a
legitimate poll is nowhere near a threshold, while a remount loop makes tens of
requests per second and trips within a second. Creations a few milliseconds
apart count as **one wave**: a list drawing 200 rows at once is one creation
wave, not 200.

A suspicion is reported once per key per window, so a persisting loop shows its
growing frequency and not a flood:

```
[craft:loop-guard] query:sessions in component:SessionsPage / service:sessionsList
was created 24 times in 10s (≈2.4/s, threshold 20). The function declaring it is
being re-run — a render or remount loop is likely.
```

### Thresholds, exceptions, circuit breaker

```typescript
provideCraftLoopGuard({
  thresholds: { windowMs: 10_000, instantiations: 20, httpRequests: 20 },
  exempt: {
    'GET /api/ticker': 'ignore', // an HTTP key
    'query:feed': { loaderRestarts: 60 }, // a primitive's short name
    'component:Chat*': { instantiations: 100 }, // a trailing * matches a suffix
  },
  tripBreaker: true,
  onSuspected: (suspicion) => report(suspicion),
});
```

An exception is declared, by key, in the configuration: nothing is excused
silently. With `tripBreaker: true`, once a key is suspected the guard refuses
further instances and requests for it with a `CraftLoopGuardError` — the loop
stops, and the error says why. It is off by default.

### Reading it from a bridge or an agent

An agent that investigates should not have to instrument the code. The guard
exposes the same information on three channels:

- **`window.__CRAFT_LOOP_GUARD__`** with `reports()`, `activity()` (the rate per
  primitive and per URL, busiest first) and `reset()`; `craftLoopGuardReports()`
  and `craftLoopGuardActivity()` from `@craft-ts/core` read it;
- **the console**: every suspicion is a `console.error` starting with
  `[craft:loop-guard]`, so the local log server and its `logs.search` tool
  already find it (`logs.search` with the text `craft:loop-guard`);
- **`onSuspected`**, to forward a suspicion to any other channel.

A runtime bridge turns a suspicion into an incident by reading
`__CRAFT_LOOP_GUARD__.reports()` where it reads its other events.

## Testing that a page settles

`expectRouteToSettle` mounts the router outlet on a url, watches the page for a
few seconds and fails if the work it does exceeds a **budget** the test states.

```typescript
import { expectRouteToSettle } from '@craft-ts/component/testing';

it('the sessions page settles', async () => {
  await expectRouteToSettle(appRoutes.toRoutes(), '/sessions', {
    settleMs: 1500,
    budget: {
      // per primitive, per key: 5 creations, 5 loader runs, 3 requests
      creations: 5,
      perKey: {
        // A looping asyncProcess states how many iterations the test tolerates.
        'asyncProcess:follow': { loaderRuns: 2 },
        'GET /api/sessions': { requests: 2 },
      },
    },
  });
});
```

A failure names the offender:

```
The page did not settle. Over budget:
  - component:SessionsPage / query:sessions: 41 creations (budget 5)
```

`expectPageToSettle(Component, { providers, act })` does the same for a
component that is not routed. Under fake timers pass
`wait: (ms) => vi.advanceTimersByTimeAsync(ms)`. The helper installs the loop
guard with its breaker, so a runaway loop is stopped and the test fails instead
of freezing the runner.

In a browser, with Playwright:

```typescript
import { expectPageToSettleInBrowser } from '@craft-ts/component/testing';

test('the sessions page settles', async ({ page }) => {
  await expectPageToSettleInBrowser(page, '/sessions', {
    settleMs: 4000,
    budget: { perKey: { 'GET /api/sessions': { requests: 2 } } },
  });
});
```

It counts the page's `fetch` / `xhr` requests per method + URL — which needs
nothing from the application — and adds creations and loader runs when the
application installed the loop guard.

## Rules that require the tests

### `route-needs-stability-test` and `looping-async-process-needs-budget`

Architecture rules, in [the architecture check](/guide/testing/architecture).

- `route-needs-stability-test`: every routed page (a route with a component) is
  named by the url of an `expectRouteToSettle` / `expectPageToSettle` /
  `expectPageToSettleInBrowser` call in a test of the project. A `:param`
  segment matches any value in the url.
- `looping-async-process-needs-budget`: an `asyncProcess` whose loader has a
  `while` / `for` driven by `yield*` or `true` is named in the `budget.perKey`
  of such a call, so the number of iterations a test tolerates is written down.

Both **warn** by default and can be raised to `error`, switched off, or waived
per route (`target: 'route:app:sessions'`) or primitive
(`target: 'primitive:asyncProcess:follow'`) with a reason. The tests are
searched in the project's directory.

### `craft-ts/require-loop-sleep-or-stop`

ESLint. A `while` / `do` / `for` driven by `yield*` or `true` must suspend on
`craftSleep` — the suspension the temporal runtime cancels when the owner is
destroyed, so the loop ends with it — or have a `break`, `return` or `throw`.

```typescript
// Reported: re-runs as fast as the runtime allows.
while (yield* following()) {
  yield* sessions.refresh();
}

// Allowed: sleeps, and ends with its owner.
while (yield* following()) {
  yield* craftSleep(5000);
  yield* sessions.refresh();
}
```

It is in the recommended configuration.

## The server is not the library's to test, but budget it

A client that does not loop still cannot save a slow endpoint: a collector that
revalidates 500 MB of files on every request is ~13 s per request on its own.
Give each endpoint a latency budget measured **on a realistic data set** (the
size of production, not three fixtures) as a test of the server project:

```typescript
it('GET /api/sessions answers within its budget on a realistic data set', async () => {
  await seed({ incidents: 20_000 });
  const started = performance.now();
  await fetch(`${base}/api/sessions`);
  expect(performance.now() - started).toBeLessThan(250);
});
```

A project created with `craft new` carries this reminder in its testing guide.

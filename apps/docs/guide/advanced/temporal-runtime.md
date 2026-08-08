# Temporal runtime

Craft treats time as a runtime capability rather than as a direct call to the
browser or Node timer APIs. This gives asynchronous programs one temporal
seam that can be replaced in tests, inspected during diagnostics, and cleaned
up with the lifetime that created it.

**Use it when** a Craft program needs a delay, timeout, retry backoff, polling
or another cancellable time-based operation.
**Do not use it** for civil dates such as timestamps stored in a database:
those are dates, not elapsed-time measurements.

## Import

```typescript
import {
  CRAFT_TEMPORAL_RUNTIME,
  craftSleep,
  exponentialTemporalSchedule,
  fixedTemporalSchedule,
  provideCraftTemporalRuntime,
  VirtualCraftTemporalRuntime,
  withCraftTimeout,
} from '@craft-ng/core';
```

## The temporal model

The runtime separates three responsibilities:

- **clock** — reads monotonic time for durations and civil time for dates;
- **task** — schedules one cancellable callback or sleep operation;
- **schedule** — decides whether an operation continues and how long the next
  wait should be.

```text
Craft program
  ├── waits       → craftSleep(...)
  ├── times out   → withCraftTimeout(...)
  └── retries     → a temporal schedule
          │
          ▼
CRAFT_TEMPORAL_RUNTIME
  ├── RealCraftTemporalRuntime
  └── VirtualCraftTemporalRuntime
```

`setTimeout`, `setInterval`, `clearTimeout` and `clearInterval` are runtime
implementation details. A polling loop should normally be expressed as a
sequence of operations and a schedule so it can stop when its owner is
destroyed.

## Waiting in a Craft program

`craftSleep` is a yieldable delay. It does not create a native timer when the
generator is created. The asynchronous Craft driver receives the request and
delegates it to the configured temporal runtime.

```typescript
import { craftGen, craftSleep } from '@craft-ng/core';

const refreshAfterDelay = craftGen(function* () {
  yield* craftSleep(500, { owner: 'refresh' });
  return 'refresh now';
});
```

The delay can be used in route guards and in asynchronous primitive loaders,
which already use the asynchronous program driver:

```typescript
const data = query('data', {
  loader: function* () {
    yield* craftSleep(100);
    return loadData();
  },
});
```

Synchronous drivers such as `craftUse` cannot suspend on `craftSleep`. They
fail with an explicit async-driver error instead of silently creating an
untracked Promise.

## Replacing the runtime in tests

`VirtualCraftTemporalRuntime` never waits for wall-clock time. It starts at
zero by default, orders equal deadlines by creation order, and exposes the
pending tasks for assertions.

```typescript
import { Injector } from '@angular/core';
import {
  executeGeneratorCompatibleFactoryAsync,
  provideCraftTemporalRuntime,
  VirtualCraftTemporalRuntime,
} from '@craft-ng/core';

const clock = new VirtualCraftTemporalRuntime();
const injector = Injector.create({
  providers: [provideCraftTemporalRuntime(clock)],
});

const result = executeGeneratorCompatibleFactoryAsync({
  factory: function* () {
    yield* craftSleep(100);
    return 'done';
  },
  thisArg: undefined,
  getInjector: () => injector,
  args: [],
  invalidYieldErrorMessage: 'Invalid Craft yield.',
});

await clock.advanceBy(99);
// The program is still suspended.

await clock.advanceBy(1);
await expect(result).resolves.toMatchObject({
  kind: 'done',
  value: 'done',
});
```

The main test operations are:

```typescript
await clock.advanceBy(250); // move time forward
await clock.advanceTo(1_000); // move to an exact time
await clock.advanceToNextTask(); // execute the nearest task
await clock.runUntilIdle(); // execute until no task remains
clock.pendingTasks(); // inspect all pending tasks
clock.pendingTasks('refresh'); // inspect one owner
clock.reset(); // cancel tasks and restore the clock
```

Tasks with the same deadline run in creation order. A task created while an
expired task is running is then considered at the same virtual time and is
also executed before the clock advances beyond that deadline.

## Timeouts

`withCraftTimeout` races an operation against the configured runtime. If the
operation wins, the timeout task is cancelled. If the deadline wins, the
Promise rejects with `CraftTimeoutError`.

```typescript
const response = await withCraftTimeout(
  fetch('/api/report').then((response) => response.json()),
  5_000,
  { owner: 'report-loader' },
);
```

The timeout controls the Craft operation's result. It does not automatically
cancel an external HTTP request. Pass an `AbortSignal` to the underlying API
when the resource itself must be interrupted as well.

## Schedules

A schedule is a pure policy. It does not own a timer and it does not run an
interval. It receives the next attempt number and returns either a delay or a
stop decision.

```typescript
const backoff = exponentialTemporalSchedule(100, {
  factor: 2,
  maxAttempts: 4,
  maxDelayMs: 2_000,
});

backoff.next({ attempt: 1, elapsedMs: 0 }); // { done: false, delayMs: 100 }
backoff.next({ attempt: 2, elapsedMs: 100 }); // { done: false, delayMs: 200 }
```

Available policies include:

```typescript
fixedTemporalSchedule(500, { maxAttempts: 3 });
exponentialTemporalSchedule(100, { factor: 2 });
sequenceTemporalSchedule([100, 250, 1_000]);
```

`retry` uses the temporal runtime for non-zero backoff delays and accepts a
custom schedule when the built-in policies are not enough:

```typescript
const user =
  yield *
  loadUser().pipe(
    retry({
      times: 3,
      schedule: exponentialTemporalSchedule(200, {
        factor: 2,
        maxDelayMs: 2_000,
      }),
    }),
  );
```

Prefer a schedule over `setInterval` for polling. The operation completes one
step, the schedule decides whether another step is needed, and the next task
is created only after the current step has finished. This avoids accidental
overlap and makes destruction cancellable.

## Ownership and cleanup

Every task can carry an `owner` label for inspection. Runtime integrations that
have a `DestroyRef` attach the task to that lifetime:

```typescript
const task = runtime.schedule(refresh, 1_000, {
  kind: 'polling',
  owner: 'user-list',
  destroyRef,
});

task.cancel(); // idempotent; returns whether cancellation happened
```

Destroying the owner cancels its pending tasks. A suspended `craftSleep` is
rejected with `TemporalCancelledError`, so a destroyed program cannot resume
and mutate state after its lifetime has ended.

## Choosing the right abstraction

| Need                             | Use                                         |
| -------------------------------- | ------------------------------------------- |
| Wait once inside a generator     | `craftSleep`                                |
| Bound an operation by a deadline | `withCraftTimeout`                          |
| Retry after an error             | `retry` with a schedule                     |
| Repeat work without overlap      | one operation plus a schedule               |
| Store a timestamp                | a civil date value, not the monotonic clock |
| Test time-dependent behavior     | `VirtualCraftTemporalRuntime`               |

## What not to do

Avoid timer Promises created directly inside Craft programs:

```typescript
// Avoid
yield * new Promise((resolve) => setTimeout(resolve, 500));
```

Use the temporal request instead:

```typescript
// Prefer
yield * craftSleep(500);
```

Direct timer globals are reported by the `no-direct-temporal-globals` dev-tools
rule. The temporal runtime implementation itself is the explicit exception.

## Limitations

- Browser background-tab throttling is not simulated by the virtual runtime.
- Microtasks and macrotasks remain distinct; advancing virtual time flushes the
  microtasks caused by the tasks it executes.
- RxJS schedulers are not automatically replaced by the Craft runtime.
- A timeout does not cancel an external resource unless that resource accepts
  and observes an abort signal.
- Timers created by third-party APIs remain outside Craft ownership.

## See also

- [`retry`](/guide/advanced/program-operators#retrypolicy)
- [`asyncProcess`](/guide/state/async-process)
- [Testing services](/guide/testing/services)
- [Generators and `yield*`](/guide/concepts/generators)

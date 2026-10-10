# Typed streams

`@craft-ts/stream` is a small, typed stream library built on the same ideas as
the rest of craft-ts: **every operator adds its dependencies and its exceptions
to the type of the stream**, so you can read them off where the pipeline is
finally consumed.

**Use it when** you want operators (`map`, `filter`, `scan`, `share`, …) over
something that emits over time — and you want the compiler, not a comment, to
tell you which services it needs and which typed exceptions it may end with.
**Not for** one-shot async work (that is a `query` loader) or plain state (that
is `state`).

## Import

```typescript
import { of, map, filter, catchTag, subscribe } from '@craft-ts/stream';
```

`@craft-ts/stream` depends on `@craft-ts/core` only. craft-ts itself has no
RxJS dependency.

## The `CraftStream<A, Y>` type

```typescript
interface CraftStream<A, Y = never> extends Subscribable<A> {
  pipe: CraftStreamPipe<A, Y>;
}
```

- `A` is the type of the values.
- `Y` is the same `Yielded` union a `craftGen` program carries: the
  service-dependency requests the stream's handlers `yield*`, and a marker per
  typed exception the stream may terminate with.

A stream is **cold**: every subscription re-runs it. Make it hot with
`share()` / `shareReplay()`, or by starting from a core `subject()`.

### Three terminal notifications

| Notification | Meaning                                                           |
| ------------ | ----------------------------------------------------------------- |
| `complete`   | The stream is done.                                               |
| `exception`  | A **typed** failure (`{ _tag: ... }`), advertised in `Y`.         |
| `error`      | A **defect** — an unexpected throw. Never catchable by `catchTag`. |

An `Observable`'s `error` is a defect. Exceptions are the typed channel.

## Sources

```typescript
of(1, 2, 3); // emits then completes
empty(); // completes immediately
fail(craftException({ _tag: 'NotFound' }, { id: 1 })); // typed exception

fromSubscribable(subject); // a core subject, an RxJS Observable, ...
fromSource(reset$); // a source$ — its service dependency stays tracked

concat(a$, b$); // one after the other
defer(() => of(Date.now())); // built afresh for each subscriber
throwError(() => new Error('x')); // a DEFECT (use fail(...) for a typed exception)
never(); // neither emits nor completes

from([1, 2, 3]); // an array, a Set… (also: a Promise, a Subscribable, another stream)
fromPromise(fetchUser()); // resolved value, then complete; a rejection is a defect
generate({ initialState: 1, condition: (n) => n < 100, iterate: (n) => n * 2 });
bindCallback(fs.exists)('/tmp'); // a callback-style function as a stream
fromFetch('/api/items'); // the Response (abort on unsubscribe); an HTTP error is a value

interval(1_000); // 0, 1, 2… every second (driven by the temporal runtime)
timer(500); // one value after 500 ms
timer(500, 100); // then every 100 ms
fromEvent(button, 'click'); // DOM events; the listener is removed on unsubscribe
```

A core `subject<T, E>()` declares its failure set `E`; `fromSubscribable` turns
it into the stream's exception type.

## Operators

Operators go in `.pipe(...)`, up to **14** per call (nest `.pipe(...).pipe(...)`
beyond that). Each slot is inferred from the previous one.

```typescript
const squares = of(1, 2, 3, 4).pipe(
  map((n) => n * n),
  filter((n) => n > 1),
  scan((total, n) => total + n, 0),
  take(2),
);
```

| Operator                                                                                | What it does                                                       |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `map`, `filter`, `tap`, `scan`                                                          | Per value; the callback may be a plain function or a **generator** |
| `take`, `skip`, `takeWhile`, `distinctUntilChanged`, `startWith`, `pairwise`            | Select, bound, seed or pair                                        |
| `takeUntil`, `takeUntilDestroyed`                                                       | End on a notifier / when the owner is destroyed                    |
| `first`, `last`, `takeLast`, `reduce`                                                   | One value, the tail, or the folded result                          |
| `skipWhile`, `skipUntil`, `distinct`, `defaultIfEmpty`, `ignoreElements`, `endWith`, `finalize` | Drop, deduplicate, fill in, end, clean up                  |
| `switchAll`, `exhaustAll`, `concatAll`, `mergeAll`                                      | Flatten a stream **of streams**                                    |
| `concatWith`, `mergeWith`, `combineLatestWith`                                          | The pipeable forms of `concat`, `merge`, `combineLatest`           |
| `switchMap`, `exhaustMap`, `concatMap`, `mergeMap`                                      | [Flatten](#flattening) inner streams                               |
| `combineLatest`, `merge`, `zip`, `race`, `withLatestFrom`                               | [Combine](#combining) streams                                      |
| `debounce`, `throttle`, `auditTime`, `delay`, `timeout`, `retry`, `repeat`              | [Time](#time)                                                      |
| `buffer`, `bufferCount`, `bufferTime`, `bufferWhen`, `sample`, `groupBy`, `window`, `windowCount` | [Group](#grouping-and-sampling) values                  |
| `expand`                                                                                | Recursively project: results feed back in (bound it)               |
| `catchTag`, `catchTag.exhaustive`, `mapException`, `orElse`                             | Work on the typed exception channel                                |
| `share`, `shareReplay`                                                                  | One upstream run for many subscribers                              |

### Handlers that yield services

A generator callback can `yield*` a craft service. The service is resolved when
the stream runs, and it is **added to the stream's type**:

```typescript
const prices = of('EUR', 'USD').pipe(
  map(function* (currency) {
    const rates = yield* Rates();
    return rates.convert(currency);
  }),
); // CraftStream<number, ...the Rates dependency>
```

The stream resolves services from the injector it runs with: subscribe inside an
injection context, or pass `{ injector }` (see [Terminals](#terminals)). Without
one, a handler that `yield*`s a service fails with a clear error.

Handlers run **one at a time, in arrival order**. If one suspends (a
`craftSleep`, a promise), later values wait; there is no hidden buffer and no
concurrency. A handler that returns a `craftException` ends the stream with
that exception.

### Flattening

A projection returns an inner stream; the inner values are flattened into one stream.
The four operators differ in what they do when an outer value arrives while an inner
stream is still running:

| Operator     | While an inner stream is running…                             |
| ------------ | ------------------------------------------------------------- |
| `switchMap`  | cancel it and start the new one                               |
| `exhaustMap` | ignore the new value                                          |
| `concatMap`  | queue the new value, run one inner stream at a time           |
| `mergeMap`   | run it concurrently (up to `concurrency`, queueing beyond)    |

```typescript
const results$ = query$.pipe(
  switchMap(function* (text) {
    const { Search } = yield* SearchService();
    return Search.results(text); // a stream: its service joins the type
  }),
);
```

The inner streams' dependencies and exceptions join the outer type, and the
projection may be a generator whose own `yield*`s join it too. A projection may
also return a plain `Subscribable` (an RxJS `Observable`, a core subject).

Nothing is buffered implicitly. `concatMap` and a bounded `mergeMap` keep a queue,
unbounded unless you bound it:

```typescript
concatMap(save, { buffer: 10, overflow: 'drop-oldest' });
// overflow: 'error' (default: a defect), 'drop-newest' or 'drop-oldest'
mergeMap(fetch, { concurrency: 4 });
```

### Combining

```typescript
combineLatest([a$, b$]); // CraftStream<[A, B]>
combineLatest({ a: a$, b: b$ }); // CraftStream<{ a: A; b: B }>
merge(a$, b$); // CraftStream<A | B>
zip(a$, b$); // pairs by position (buffers the faster input — inherent to zip)
race(a$, b$); // mirrors whichever speaks first
a$.pipe(withLatestFrom(b$)); // CraftStream<[A, B]>
```

The result's type is the union of every input's: all their dependencies and
exceptions. An exception or defect in any input ends the result. Inputs must be craft
streams — wrap anything else with `fromSubscribable(...)`.

### Time

Every timer goes through the [temporal runtime](/guide/advanced/temporal-runtime): it is
cancelled with the subscription and the owner's `DestroyRef`, and driven by the virtual
clock in tests. There is no raw `setTimeout`.

```typescript
input$.pipe(debounce(300)); // latest value after 300 ms of silence
input$.pipe(throttle(100, { leading: true, trailing: true }));
input$.pipe(auditTime(100)); // the latest value at the END of each window
input$.pipe(delay(50));
input$.pipe(timeout(5_000)); // raises a typed StreamTimeout exception
request$.pipe(retry({ times: 3, backoff: 'exponential', delayMs: 200 }));
poll$.pipe(repeat({ delayMs: 10_000 }));
```

- `timeout` raises a **typed** `StreamTimeout` exception (`{ ms }` payload) — catch it with
  `catchTag('StreamTimeout', …)` — rather than throwing a defect.
- `retry` re-runs the stream on a typed exception, with the same policy as the program
  `retry` (`times`, `while` on exception tags, `backoff`, `delayMs`, `schedule`). A defect is
  never retried.
- `repeat` re-runs on completion. A synchronous source repeated forever never yields
  control: bound it (`times`, `take`, `takeUntil`) or wait between runs.
- These operators add a `RuntimeTemporalAwaitRequest` to the stream's type: it is
  asynchronous, so a synchronous host cannot consume it in place.

### Grouping and sampling

```typescript
input$.pipe(bufferCount(3)); // arrays of 3
input$.pipe(bufferTime(1_000)); // what arrived in each second
input$.pipe(buffer(flush$)); // until flush$ emits
input$.pipe(bufferWhen(() => timer(1_000))); // a fresh closing stream after each flush
input$.pipe(windowCount(10)); // a hot inner stream per 10 values
input$.pipe(sample(tick$)); // the latest value on each tick
input$.pipe(groupBy((event) => event.kind)); // a hot stream per key
input$.pipe(window(open$)); // a hot inner stream per window
```

`groupBy` and `window` hand out **hot** inner streams: subscribe to each one as soon as
you receive it.

### Catching typed exceptions

`catchTag` is typed from the stream it is piped onto — the handler's parameter is
the exception with that tag, and a tag the stream cannot produce is a compile
error:

```typescript
declare const user$: CraftStream<User, CraftGenExceptionMarker<NotFound | Forbidden>>;

const safe$ = user$.pipe(
  catchTag('NotFound', (e) => GUEST), // e: NotFound
);
// CraftStream<User | typeof GUEST, CraftGenExceptionMarker<Forbidden>>
```

The handler's result is emitted and the stream completes; `NotFound` leaves the
exception union. `catchTag.exhaustive` takes a handler per remaining tag and
rejects a missing or unreachable one:

```typescript
user$.pipe(
  catchTag.exhaustive({
    NotFound: () => GUEST,
    Forbidden: () => GUEST,
  }),
); // exceptions: never
```

`mapException` rewrites exceptions; `orElse` continues with another stream.

### Sharing

```typescript
const prices$ = source$.pipe(map(...), shareReplay(1));
```

`share()` connects to upstream on the first subscriber and disconnects when the
last one leaves. `shareReplay(n)` replays the last `n` values to late subscribers
and keeps the connection. Apply them in an injection context: the upstream run
uses the `Injector` and `DestroyRef` captured when the operator is applied.

When the moment of connection matters, make it explicit:

```typescript
const live = connectable(prices$, { connector: () => replaySubject(1) });
const view = live.pipe(map(format)); // subscribers attach first…
const connection = live.connect(); // …then the source starts
connection.unsubscribe(); // disconnects
```

`publish()`, `publishReplay(n)`, `publishBehavior(v)` and `multicast(subject)` build a
connectable stream; paired with `refCount()` they are `share()`. Note that `.pipe(…)` types
its result as a plain stream, which hides `connect` — call the operator directly
(`publish()(source$)`) or use `connectable(...)` when you need `connect()`.

`connect` shares the source with a selector that uses it several times — the source is
connected once the selector's stream is subscribed, so a synchronous source reaches every
use:

```typescript
source$.pipe(
  connect((shared) => merge(shared.pipe(take(2)), shared.pipe(skip(10)))),
);
```

### Network sources

```typescript
ajax.getJSON<User[]>('/api/users'); // the parsed body, then complete
ajax.post('/api/users', { name: 'Ada' }); // a plain object is sent as JSON → AjaxResponse
ajax({ url: '/slow', timeout: 5_000 }); // aborts after 5 s (temporal runtime)

const socket = webSocket<Message>('wss://example.test/feed');
socket.pipe(map((message) => message.text)).subscribe({ next: render });
socket.next({ text: 'hi' }); // sends (queued until the socket is open)
```

An HTTP error status is an `AjaxError` **defect** (it carries `status` and `response`);
unsubscribing aborts the request. A `webSocket` opens when its first subscriber arrives and
closes when the last one leaves; a clean close completes the stream, an unclean one is a
defect. Application HTTP belongs to `query` / `mutation` / server functions — they carry
loading state, caching and typed exceptions; these are the stream-shaped primitives for the
cases that really are a stream.

### Notifications as values, and the clock

```typescript
source$.pipe(materialize()); // { kind: 'N', value } | { kind: 'X', exception } | { kind: 'E', error } | { kind: 'C' }
notes$.pipe(dematerialize()); // and back
source$.pipe(observeOn(0)); // re-deliver every notification on the next turn of the clock
source$.pipe(subscribeOn(0)); // subscribe on the next turn of the clock
```

`'X'` is a **typed exception** (RxJS has no such notion) and `'E'` a defect. A materialized
stream no longer raises: its exceptions left its type and became values. There is exactly
one scheduler, the [temporal runtime](/guide/advanced/temporal-runtime), so `observeOn` and
`subscribeOn` take a delay, not a scheduler.

## Terminals

A terminal is where the type is **consumed**.

### `subscribe`

```typescript
subscribe(
  user$,
  {
    next: (user) => render(user),
    exception: {
      NotFound: (e) => showNotFound(e.payload.id),
      Forbidden: () => redirectToLogin(),
    },
  },
  { injector },
);
```

- When the stream may end with typed exceptions, `exception` is **required**: a
  function receiving the union, or a `{ [tag]: handler }` map covering every tag.
- When the stream depends on services, `{ injector }` is required; the compile
  error names the missing services.
- `error` receives defects only.

### As a craft program

`lastValueFrom`, `firstValueFrom`, `toArray` and `runForEach` turn a stream into a
program you `yield*`. Its dependencies and exceptions become the program's:

```typescript
const latest = yield* lastValueFrom(prices$);
```

A stream that settles synchronously returns without suspending; otherwise the
program suspends and the subscription is released if the program is aborted or
its injector destroyed.

### `streamSignal`

Expose a stream as a named primitive of a `craftService`:

```typescript
const { Feed } = craftService({ name: 'Feed', providedIn: 'global' }, function* () {
  yield* streamSignal('latest', prices$);
});

const feed = craftUse(Feed());
feed.latest.value(); // the latest value
feed.latest.status(); // 'idle' | 'running' | 'completed' | 'exception' | 'error'
feed.latest.exception(); // the typed exception, or undefined
```

The stream's service dependencies are folded into the service's verified
dependency tree, and its exceptions into the host's exception types.

## Observability

Streams plug into the same cross-cutting mechanisms as the rest of craft (see
[Observability](/guide/advanced/observability)), with no change to the pipeline.

**Handlers go through `provideFnWrapper`.** Every handler an operator runs —
`map`, `mergeMap`, `catchTag`, `tap`, … plain function or generator — is
executed through the injector's function wrappers, like a service method or a
query loader. Correlation tracking, `provideTakeAppSnapshot` and your own
wrappers therefore see stream work. With no wrapper installed the handler runs
as is, and a synchronous pipeline stays synchronous.

**`provideStreamTrace` observes root subscriptions.** A _root_ is where a stream
is consumed: `subscribe`, a program terminal, `streamSignal`, an adapter. Inner
streams (`mergeMap`, `switchMap`, …) are part of their root, not roots
themselves.

```ts
import { provideStreamTrace } from '@craft-ts/stream';

provideStreamTrace((event, context) => {
  // context: { streamId, name, root, startCorrelationId }
  // event.kind: 'subscribe' | 'next' | 'exception' | 'error' | 'complete' | 'unsubscribe'
  console.debug(context.name ?? context.streamId, event.kind);
});
```

- `name` comes from the `{ name }` option of `subscribe` / `captureStreamContext`;
  `streamSignal` passes its own.
- `startCorrelationId` is the user gesture that was current when the stream
  started — the link between "the user clicked Save" and "this feed emitted
  four seconds later".
- `unsubscribe` is reported only when the consumer leaves before any terminal
  notification.
- Observers are passive: they run in the stream's injector, cannot alter the
  stream, and one that throws is ignored.

**A defect takes an app snapshot.** A stream that ends with a defect (`error`,
never a typed exception) triggers `provideTakeAppSnapshot`, even when the defect
comes from a source rather than a handler. A handler that already went through a
snapshot wrapper is not snapshotted a second time. `streamSignal` also appears
in app snapshots, tagged with its host.

All of it is development-only, like `provideCraftHttpTrace`: under
`provideCraftProduction()` a root subscription runs unwrapped.

## Interop with RxJS

`Subscribable` is structural: an RxJS `Observable` is assignable to it, so
`fromSubscribable(observable$)` needs no adapter. Going the other way, wrap the
`Subscribable` returned by `toSubscribable(stream)`:

```typescript
const exposed = toSubscribable(stream$);
const observable$ = new Observable((subscriber) => exposed.subscribe(subscriber));
```

## Effect interop

`@craft-ts/stream-effect` adapts between a craft stream and Effect's `Stream`, `Queue`,
`PubSub`, `SubscriptionRef` and `Schedule`. It is a separate package, so using
`@craft-ts/effect` never forces `@craft-ts/stream` on you.

```typescript
import { fromStream, toStream } from '@craft-ts/stream-effect';

const prices$ = fromStream(priceStream); // Stream -> CraftStream
const effectStream = toStream(prices$); // CraftStream -> Stream
```

- A typed Effect failure becomes a craft **exception** tagged with the error's `_tag`
  (so `catchTag` works on it); a defect (`die`) stays a defect; an interruption is neither.
- `fromStream` resolves the Effect injector level (`provideLayer`) **at subscription**,
  flattens chunks, and interrupts the fiber when unsubscribed or when the owner is
  destroyed. A stream with requirements the type cannot see provided does not compile.
- `toStream` has a **bounded** buffer (64, sliding by default): a craft stream pushes and
  cannot be told to wait, so back-pressure is lost at this boundary by nature.
- `fromQueue`, `fromPubSub` and `fromSubscriptionRef` read Effect's primitives. There is
  deliberately no automatic two-way bridge between a subject and a queue: it would echo.
- `toEffectSchedule(craftSchedule)` and `fromEffectSchedule(effectSchedule)` convert
  schedules; the latter only accepts **pure** ones (it steps them synchronously) and
  raises `CraftScheduleNotPure` otherwise.

## Migrating from RxJS

craft-ts no longer depends on RxJS. The `craft-migrate-streams` codemod rewrites RxJS
pipelines to `@craft-ts/stream`:

```bash
npx craft-migrate-streams --dry-run
npx craft-migrate-streams --write
```

It is **all-or-nothing per file**: a file is rewritten only when every rxjs symbol it
imports has an equivalent and every `.pipe(...)` receiver can be recognised; otherwise it is
left untouched and a diagnostic names what blocks it: a symbol that is in none of its tables
(it names the symbol), an alias that would clash with another name in the file, a namespace
import used as a plain value, or an operator in a form that cannot be expressed. Aliased
imports (`map as rxMap`) and namespace imports (`rx.of`, `rx.operators.map`, `rx.Observable`)
are expanded, renaming every reference; a `.pipe` whose receiver's type cannot be established
is wrapped in `from(...)` with a review notice. `from`, `scheduled`, `generate` (positional
form included), `bindCallback`, `fromFetch`, `ajax`, `webSocket` and every publish-family
form (selector forms become `connect(...)`) are translated. Subjects become `subject()` / `behaviorSubject()` / `replaySubject()`,
`subscribe(fn)` becomes `subscribe({ next: fn })`, `mergeMap(project, 3)` becomes
`mergeMap(project, { concurrency: 3 })`, `lastValueFrom` / `firstValueFrom` move to
`@craft-ts/core`, scheduler arguments (`asyncScheduler`, `asapScheduler`, `queueScheduler`,
`animationFrameScheduler`) are dropped with a review notice — there is one scheduler, the
temporal runtime — `x.pipe(…, publish())` becomes `connectable(x.pipe(…))` (and
`publishReplay` / `publishBehavior` / `multicast` get their `connector`), and the operators and creators with the same name (`interval`, `timer`, `fromEvent`, `defer`,
`throwError`, `concat`, `first`, `last`, `reduce`, `auditTime`, `expand`, …) move over unchanged.

Semantic changes are reported as **review notices** on a migrated file: `catchError(() => x$)`
becomes `orElse(() => x$)`, which continues on a *typed* exception of a craft stream and does
not catch defects — prefer `catchTag` so the handler is typed per exception; `timeout` raises
a typed exception; `retry` retries typed exceptions only; `zip` buffers without bound.

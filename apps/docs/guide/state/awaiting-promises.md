# Awaiting Promise-based SDKs

Use `craftAwait` when a generator loader needs a browser API, generated client,
or other Promise-based SDK. It works inside `query`, `mutation`,
`asyncProcess`, and asynchronous route guards/resolvers.

```typescript
import { craftAwait, query } from '@craft-ts/core';

const user = yield* query('user', {
  params: () => userId,
  loader: function* ({ params, abortSignal }) {
    const profile = yield* craftAwait(() => sdk.readUser(params, abortSignal));
    return profile;
  },
});
```

The resolved SDK value keeps its type. Pass either a `PromiseLike<T>` or a
factory returning one; a factory starts when the program runs. Plain promises
are not iterable, so replace `yield* sdk.readUser(...)` or
`yield sdk.readUser(...)` with `yield* craftAwait(() => sdk.readUser(...))`.

## Rejections and recovery

A rejected promise or a synchronous factory throw becomes the typed
`CRAFT_PROMISE_REJECTED` exception, with the original error in `payload.cause`.
The enclosing resource reports `status() === 'exception'`, and exposes the
failure through `exception()` and `exceptions().loader.CRAFT_PROMISE_REJECTED`.
It does not require access to an internal technical `error` member.

Recover locally with a program operator:

```typescript
import { catchTag, CRAFT_PROMISE_REJECTED_CODE, craftAwait } from '@craft-ts/core';

const profile = yield* craftAwait(() => sdk.readUser(userId, abortSignal)).pipe(
  catchTag(CRAFT_PROMISE_REJECTED_CODE, function* () {
    return cachedProfile;
  }),
);
```

Returning a native Promise from a loader remains supported for interoperability.
`craftAwait` provides composition inside a generator and the typed rejection
channel shown above.

## Cancellation

Pass the loader's `abortSignal` to an SDK that accepts it. For a producer with
its own release operation, provide `cancel`:

```typescript
const task = sdk.startRead();
const result = yield* craftAwait(task.promise, { cancel: () => task.cancel() });
```

While the program is suspended, its driver invokes `cancel` when its owning
injector is destroyed or its operation is aborted. A query also aborts its old
loader when parameters change. A successful await releases the cancellation
listener without calling `cancel`. The helper does not add retries.

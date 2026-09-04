# asyncProcess

`asyncProcess` runs an async operation and tracks its status, for work that is
neither a server read nor a server write.

**Use it when** you need to know whether something asynchronous is running: a
debounced search, a share sheet, a file export, a delay, a browser API call.
**Not when** you fetch ([`query`](/guide/state/server-state)) or write
([`mutation`](/guide/state/mutations)) — those give you caching, params
reactivity and mutation wiring on top.

## The common case

```typescript
import { asyncProcess, craftComputed } from '@craft-ts/core';

const { delay } =
  yield *
  asyncProcess('delay', {
    method: (successResult: string) => successResult,
    loader: async ({ params: successResult }) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return successResult;
    },
  });

// In a tracked generator, consume the trigger with yield*.
yield * delay.method('success');

delay.status(); // 'idle' | 'loading' | 'resolved' | 'exception'
delay.isLoading();
delay.hasValue();
delay.value(); // never throws
```

::: warning `method` always takes exactly one parameter
Pass an object when you need several values.
:::

## Wrapping a browser API

This is the case `asyncProcess` exists for — turning a promise-returning native
API into something with an observable status:

```typescript
const { shareContent } =
  yield *
  asyncProcess(
    'shareContent',
    {
      method: (payload: { title: string; url: string }) => payload,
      loader: function* ({ params }) {
        return (yield* BrowserNavigator.share(params)) as Promise<undefined>;
      },
    },
    ({ resource }) => ({
      isMenuOpen: craftComputed(function* () {
        return (yield* resource.status()) === 'loading';
      }),
    }),
  );

yield * shareContent.method({ title: 'Hello AI!', url: 'https://example.com' });
yield* shareContent.isMenuOpen();
```

Yielding the browser API through a service — rather than touching `navigator`
directly — is also what makes it mockable in tests. See
[Browser boundaries](/guide/testing/browser-boundaries).

## Triggering from an event

Use a [`source$`](/guide/reactivity/source) when the process should run on an
event rather than on a call — which is also where debouncing belongs:

```typescript
import { on$, source$ } from '@craft-ts/core';

const searchSource = source$<string>('searchSource');

const { delayedSearch } =
  yield *
  asyncProcess('delayedSearch', {
    method: on$(searchSource, (term) => term),
    loader: async ({ params: term }) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return term;
    },
  });

searchSource.emit('query text'); // runs automatically

delayedSearch.source; // ReadonlySource
delayedSearch.status();
```

## Exceptions

Split by origin, exactly like `query` and `mutation` — `params` for what
`method` rejected, `loader` for what the operation produced:

```typescript
const { loadUser } =
  yield *
  asyncProcess('loadUser', {
    method: (value: string) =>
      value.length < 3
        ? craftException(
            { _tag: 'SEARCH_TERM_TOO_SHORT' },
            { min: 3, received: value.length },
          )
        : value,
    loader: async ({ params }) =>
      params === 'blocked'
        ? craftException({ _tag: 'USER_ACCESS_FORBIDDEN' }, { id: params })
        : { id: params, name: 'John Doe' },
  });

yield * loadUser.method('ab');
loadUser.hasException(); // true
loadUser.exceptions().params?.SEARCH_TERM_TOO_SHORT;

yield * loadUser.method('blocked');
loadUser.exceptions().loader?.USER_ACCESS_FORBIDDEN;
```

## Pitfalls

**`method` needs its one parameter**, even when you have nothing to pass.

`value()` is safe to read in templates and computed signals — it returns
`undefined` when the process has no resolved value.

**Reaching for it to fetch data.** If it's an HTTP read, `query` gives you
reactive `params` and mutation wiring you'd otherwise rebuild by hand.

::: details Advanced — parallel runs by identifier
`identifier` keeps one resource per key so several runs coexist:

```typescript
const { debouncedById } =
  yield *
  asyncProcess('debouncedById', {
    method: (payload: { successResult: string; id: string }) => payload,
    identifier: ({ id }) => id,
    loader: async ({ params: { successResult } }) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return successResult;
    },
  });

yield * debouncedById.method({ id: '1', successResult: data1 });
yield * debouncedById.method({ id: '2', successResult: data2 });

debouncedById.select('1')?.value(); // data1
debouncedById.select('2')?.value(); // data2
```

:::

::: details Advanced — yielding dependencies
`method` and `loader` are generators, and `providers` scopes dependencies to
this process alone. A loader must not be `async` or return a native `Promise`:
use `yield*` for asynchronous Craft operations:

```typescript
const { loadProfile } =
  yield *
  asyncProcess('loadProfile', {
    providers: [provideAsyncLogger(), provideProfileGateway()],
    method: function* (userId: string) {
      yield* AsyncLogger.log(`load:${userId}`);
      return userId;
    },
    loader: function* ({ params }) {
      return yield* ProfileGateway.load(params);
    },
  });
```

:::

::: tip Advanced — injectable writes
Insertion methods provide `injectAsyncProcessMethodRuntimeContext()`, and the
process value itself is published to
`providePrimitiveResourceRuntimeObserver`. Both expose `get`, `set`, `update`,
and `patch` for wrappers, WebMCP tools, and other advanced patterns. See
[Anatomy of a primitive](/guide/concepts/primitive-anatomy#injectable-runtime-context).
:::

## See Also

- [Which primitive should I use?](/guide/concepts/choose-primitive)
- [Browser boundaries](/guide/testing/browser-boundaries) — mocking native APIs
- [Anatomy of a primitive](/guide/concepts/primitive-anatomy)

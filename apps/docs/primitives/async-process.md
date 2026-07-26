# AsyncProcess

The `asyncProcess` primitive creates an async operation that manages asynchronous execution with automatic state tracking.

## Import

```typescript
import { asyncProcess, craftUse } from '@craft-ng/core';
```

## Consuming the primitive

Calling `asyncProcess(...)` (like every craft primitive) returns a **generator**
that carries the primitive's dependency map. Consume it where you create it:

- inside a generator host (a `craftService` factory, `craftGen`, …) with
  `yield* asyncProcess({...})` — the dependencies fold into the enclosing service
  tree automatically;
- anywhere else (typically a component field) with
  `craftUse(asyncProcess({...}))`.

A factory arrow that returns the primitive directly stays valid — the runtime
drives the generator for you: `craftService({...}, () => asyncProcess({...}))`.
The generator is single-use: consume each invocation exactly once.

For brevity, the examples below focus on the configuration and omit the
`yield*` / `craftUse` wrapper.

## Basic Examples

### Basic method-based async method

```typescript
const delay = asyncProcess({
  method: (successResult: string) => successResult,
  loader: async ({ params: successResult }) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return successResult;
  },
});

// Trigger manually
delay.method('success');

// Track state
console.log(delay.status()); // 'loading'
console.log(delay.isLoading()); // true

// After completion
console.log(delay.status()); // 'resolved'
console.log(delay.value()); // 'success' (throws if status is 'exception')
console.log(delay.safeValue()); // 'success' (never throws)
console.log(delay.hasValue()); // true
```

::: warning
The method based always needs one parameter.
:::

### Source-based async method for automatic execution

```typescript
import { source$, on$ } from '@craft-ng/core';

const searchSource = source$<void>();
const delayedSearch = asyncProcess({
  method: on$(searchSource, (term) => term),
  loader: async ({ params: term }) => {
    // Debounce at source level
    await new Promise((resolve) => setTimeout(resolve, 300));
    return term;
  },
});

// Triggers automatically when source emits
searchSource.emit('query text');
// autoSearch executes automatically

// No manual method, only source
console.log(delayedSearch.source); // ReadonlySource
console.log(delayedSearch.status()); // Current state
```

### Async method with identifier for parallel operations

```typescript
const debouncedById = asyncProcess({
  method: (payload: { successResult: string; id: string }) => payload,
  identifier: ({ id }) => id,
  loader: async ({ params: { successResult } }) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return successResult;
  },
});

debouncedById.method({
  id: '1',
  successResult: data1,
});
debouncedById.method({
  id: '2',
  successResult: data2,
});

// Access individual states
const debouncedById1 = debouncedById.select('1');
console.log(debouncedById1?.status()); // 'loading' or 'resolved'
console.log(debouncedById1?.value()); // data1 once resolved

const debouncedById2 = debouncedById.select('2');
console.log(debouncedById2?.status()); // 'loading' or 'resolved'
console.log(debouncedById2?.value()); // data2 once resolved
```

### Add providers to asyncProcess

```typescript
const loadProfile = asyncProcess({
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

### AsyncProcess exceptions (`hasException` / `exceptions()`)

```typescript
import { asyncProcess, craftException } from '@craft-ng/core';

const loadUser = asyncProcess({
  method: (value: string) =>
    value.length < 3
      ? craftException(
          { code: 'SEARCH_TERM_TOO_SHORT' },
          { min: 3, received: value.length },
        )
      : value,
  loader: async ({ params }) =>
    params === 'blocked'
      ? craftException({ code: 'USER_ACCESS_FORBIDDEN' }, { id: params })
      : { id: params, name: 'John Doe' },
});

loadUser.method('ab');
console.log(loadUser.hasException()); // true
console.log(loadUser.exceptions().params?.SEARCH_TERM_TOO_SHORT);

loadUser.method('blocked');
console.log(loadUser.exceptions().loader?.USER_ACCESS_FORBIDDEN);
```

## Track async native JS api status

```typescript
const shareContent = asyncProcess(
  {
    method: (payload: { title: string; url: string }) => payload,
    loader: function* ({ params }) {
      return (yield* BrowserNavigator.share(params)) as Promise<undefined>;
    },
  },
  ({ resource }) => ({
    isMenuOpen: computed(() => resource.status() === 'loading'),
  }),
);

// Trigger shareContent
shareContent.method({ title: 'Hello AI!', url: 'https://example.com' });
shareContent.isMenuOpen(); // true while loading
```

## Safe Value Access

Use `safeValue()` instead of `value()` when you want to access the async method value without throwing an error:

```typescript
// value() throws an error when status is 'exception'
try {
  console.log(delay.value());
} catch (e) {
  console.log('Error accessing value');
}

// safeValue() never throws, returns undefined when status is 'exception'
console.log(delay.safeValue()); // undefined on exception, value otherwise
```

::: tip
Prefer `safeValue()` in templates and computed signals to avoid unexpected errors propagation.
:::

## Use Cases

**Debounced operations**: Search, validation with delay
**Wrapping js native api**: Track JS native API status

## Best Practices

✅ **Use method-based** for explicit control
✅ **Use source-based** for automatic reactivity
✅ **Use identifier** for parallel operations

## See Also

- [state](/primitives/state) - For synchronous state
- [query](/primitives/query) - For data fetching with caching
- [mutation](/primitives/mutation) - For server mutations

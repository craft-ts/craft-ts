# asyncMethod

The `asyncMethod` primitive creates an async operation that manages asynchronous execution with automatic state tracking.

## Import

```typescript
import { asyncMethod } from '@ng-angular-stack/craft';
```

## Basic Examples

### Basic method-based async method

```typescript
const delay = asyncMethod({
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
console.log(delay.value()); // 'success'
console.log(delay.hasValue()); // true
```

::: warning
The method based always needs one parameter.
:::

### Source-based async method for automatic execution

```typescript
import { source, afterRecomputation } from '@ng-angular-stack/craft';

const searchSource = source();
const delayedSearch = asyncMethod({
  method: afterRecomputation(searchSource, (term) => term),
  loader: async ({ params: term }) => {
    // Debounce at source level
    await new Promise((resolve) => setTimeout(resolve, 300));
    return term;
  },
});

// Triggers automatically when source emits
searchSource.set('query text');
// autoSearch executes automatically

// No manual method, only source
console.log(delayedSearch.source); // ReadonlySource
console.log(delayedSearch.status()); // Current state
```

### Async method with identifier for parallel operations

```typescript
const debouncedById = asyncMethod({
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

## Track async native JS api status

```typescript
const shareContent = asyncMethod(
  {
    method: (payload: { title: string; url: string }) => payload,
    stream: async ({ params }) => {
      return navigator.share(params);
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

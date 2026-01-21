# craftAsyncMethods

Creates async method definitions for use within a craft store, enabling reactive management of asynchronous operations.

## Import

```typescript
import { craftAsyncMethods } from '@ng-craft/core';
```

## Introduction

`craftAsyncMethods` integrates multiple `asyncMethod()` instances into a craft store by:

- Registering async methods as a group with automatic state tracking
- Generating prefixed `set` methods for each async method (e.g., `setMethodName`)
- Exposing async method state signals (value, status, error, isLoading)
- Supporting both method-based and source-based async method triggering
- Managing async methods with identifiers for parallel execution
- Enabling insertions for extending functionality (persistence, etc.)

## Naming Convention

- Async methods are accessible as: `store.methodName`
- Trigger methods are prefixed: `store.setMethodName(args)`
- Source-based async methods (bound to sources) do not expose `set` methods

## Difference from Mutations

- **Async Methods**: General-purpose async operations without automatic query coordination
- **Mutations**: Server data modifications with built-in query synchronization patterns

## Use Cases

- **Debounced operations**: Search, validation, autosave with delay
- **File operations**: Upload, download with progress tracking
- **Background tasks**: Processing, computation without blocking UI
- **Third-party APIs**: External service calls with status tracking
- **Polling**: Periodic checks or updates
- **Cancellable operations**: Long-running tasks with abort capability

## Context Access

- Sources: Bind async methods to sources for automatic execution
- Queries: Access query state for conditional logic
- States: Read and react to state changes
- Injections: Access Angular services and dependencies

## Store Integration

- Async method state accessible as: `store.methodName.value()`, `store.methodName.status()`
- Trigger async methods: `store.setMethodName(args)`
- With identifier: `store.methodName.select(id)` for individual instances
- Other craft entries can access async methods for coordination

## Signature

```ts
function craftAsyncMethods<Context, StoreConfig, AsyncMethods>(
  asyncMethodsFactory: (context: CraftFactoryEntries<Context>) => AsyncMethods,
): CraftAsyncMethodsOutputs<Context, StoreConfig, AsyncMethods>;
```

## Parameters

### `asyncMethodsFactory`

Factory function that receives the craft context and returns a record of async methods.
Has access to all other craft entries (sources, queries, states, injections) defined before it.

## Return Value

A craft factory utility that integrates async methods into the store with:

- `store.methodName`: Async method state and signals
- `store.setMethodName(args)`: Method to trigger the async operation (for method-based async methods)
- Full type safety for async method parameters and results

## Examples

### Basic method-based async method

```ts
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftAsyncMethods(() => ({
    delay: asyncMethod({
      method: (delay: number) => delay,
      loader: async ({ params }) => {
        await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate delay
        return 'done';
      },
    }),
  })),
);

const store = injectCraft();

// Trigger manually
store.setDelay(500);

// Track state
console.log(store.delay.status()); // 'loading'
console.log(store.delay.isLoading()); // true

// After completion
console.log(store.delay.status()); // 'resolved'
console.log(store.delay.value()); // 'done'
console.log(store.delay.hasValue()); // true
```

### Source-based async method for automatic execution

```ts
const delaySource = source<number>();

const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftAsyncMethods(() => ({
    delay: asyncMethod({
      method: afterRecomputation(delaySource, (term) => term),
      loader: async ({ params }) => {
        // Debounce at source level
        await new Promise((resolve) => setTimeout(resolve, 300));
        return 'done';
      },
    }),
  })),
);

const store = injectCraft();

// Triggers automatically when source emits
delaySource.set(500);
// -> delay executes automatically

// No manual method, only source
console.log(store.delay.source); // ReadonlySource<number>
console.log(store.delay.status()); // Current state
```

### Async method with identifier for parallel operations

```ts
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftAsyncMethods(() => ({
    delayById: asyncMethod({
      method: (id: string) => id,
      identifier: (id) => id,
      loader: async () => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return 'done'; // Simulate delay
      },
    }),
  })),
);

const store = injectCraft();

// Execute multiple operations in parallel
store.setDelayById('id1');
store.setDelayById('id2');
store.setDelayById('id3');

// Access individual states
const delay1 = store.delayById.select('id1');
console.log(delay1?.status()); // 'loading' or 'resolved'
console.log(delay1?.value()); // Result for id1

const delay2 = store.delayById.select('id2');
console.log(delay2?.status()); // Independent state
```

### Calling async js native API

```ts
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftAsyncMethods(() => ({
    shareContent: asyncMethod(
      {
        method: (payload: { title: string; url: string }) => payload,
        loader: async ({ params }) => {
          return navigator.share(params);
        },
      },
      ({ resource }) => ({
        isMenuOpen: computed(() => resource.status() === 'loading'),
      }),
    ),
  })),
);

const store = injectCraft();

// Trigger shareContent
store.setShareContent({ title: 'Hello AI!', url: 'https://example.com' });
console.log(store.shareContent.isMenuOpen()); // true while loading
```

## Craft Utilities

Links to all craft utilities implemented in `libs/core/src/lib`:

- [craft](./craft.md)
- [craftState](./craft-state.md)
- [craftSources](./craft-sources.md)
- [craftInputs](./craft-inputs.md)
- [craftComputedStates](./craft-computed.md)
- [craftAsyncMethods](./craft-async-method.md)
- [craftQuery](./craft-query.md)
- [craftQueryParam](./craft-query-param.md)
- [craftQueryParams](./craft-query-params.md)
- [craftMutations](./craft-mutation.md)
- [craftSetAllQueriesParamsStandalone](./craft-set-all-queries-params-standalone.md)
- [craftInject](./craft-inject.md)

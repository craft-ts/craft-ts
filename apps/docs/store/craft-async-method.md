# craftAsyncMethods

Creates async method definitions for use within a craft store, enabling reactive management of asynchronous operations.

## Import

```typescript
import { craftAsyncMethods } from '@ngcraft/core';
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

### Basic async method for debounced search

```ts
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftAsyncMethods(() => ({
    search: asyncMethod({
      method: (searchTerm: string) => searchTerm,
      loader: async ({ params }) => {
        // Debounce happens at call site
        await new Promise((resolve) => setTimeout(resolve, 300));

        const response = await fetch(`/api/search?q=${params}`);
        return response.json();
      },
    }),
  })),
);

const store = injectCraft();

// Trigger search
store.setSearch('query text');

// Track status
console.log(store.search.status()); // 'loading'
console.log(store.search.isLoading()); // true

// After completion
console.log(store.search.status()); // 'resolved'
console.log(store.search.value()); // Search results
```

### Async method with identifier for parallel operations

```ts
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftAsyncMethods(() => ({
    uploadFile: asyncMethod({
      method: (file: File) => ({ fileId: file.name, file }),
      identifier: (params) => params.fileId,
      loader: async ({ params }) => {
        const formData = new FormData();
        formData.append('file', params.file);

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        return response.json();
      },
    }),
  })),
);

const store = injectCraft();

// Upload multiple files in parallel
store.setUploadFile(file1);
store.setUploadFile(file2);
store.setUploadFile(file3);

// Track individual upload states
const file1Upload = store.uploadFile.select(file1.name);
console.log(file1Upload?.status()); // 'loading' or 'resolved'
console.log(file1Upload?.value()); // Upload result

const file2Upload = store.uploadFile.select(file2.name);
console.log(file2Upload?.status()); // Independent state
```

### Source-based async method for automatic execution

```ts
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftSources({
    formChange: source<FormData>(),
  }),
  craftAsyncMethods(({ formChange }) => ({
    autoSave: asyncMethod({
      method: afterRecomputation(formChange, (data) => data),
      loader: async ({ params }) => {
        // Wait 2 seconds before saving
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const response = await fetch('/api/autosave', {
          method: 'POST',
          body: JSON.stringify(params),
        });
        return response.json();
      },
    }),
  })),
);

const store = injectCraft();

// Async method executes automatically when source emits
store.setFormChange({ name: 'John', email: 'john@example.com' });
// -> autoSave async method executes automatically after 2s
// Note: No store.setAutoSave method exposed (source-based)

// Access async method state
console.log(store.autoSave.status()); // 'loading'
console.log(store.autoSave.value()); // Result after completion
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

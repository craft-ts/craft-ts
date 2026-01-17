# asyncMethod

The `asyncMethod` primitive creates an async operation that manages asynchronous execution with automatic state tracking.

## Import

```typescript
import { asyncMethod } from '@ngcraft/core';
```

## Basic Examples

### Basic method-based async method

```typescript
const search = asyncMethod({
  method: (searchTerm: string) => searchTerm,
  loader: async ({ params }) => {
    const response = await fetch(`/api/search?q=${params}`);
    return response.json();
  },
});

// Trigger manually
search.method('query text');

// Track state
console.log(search.status()); // 'loading'
console.log(search.isLoading()); // true

// After completion
console.log(search.status()); // 'resolved'
console.log(search.value()); // Search results
console.log(search.hasValue()); // true
```

### Source-based async method for automatic execution

```typescript
import { source, afterRecomputation } from '@ngcraft/core';

const searchSource = source();
const autoSearch = asyncMethod({
  method: afterRecomputation(searchSource, (term) => term),
  loader: async ({ params }) => {
    // Debounce at source level
    await new Promise((resolve) => setTimeout(resolve, 300));
    const response = await fetch(`/api/search?q=${params}`);
    return response.json();
  },
});

// Triggers automatically when source emits
searchSource.set('query text');
// autoSearch executes automatically

// No manual method, only source
console.log(autoSearch.source); // ReadonlySource
console.log(autoSearch.status()); // Current state
```

### Async method with identifier for parallel operations

```typescript
const uploadFile = asyncMethod({
  method: (file: File) => ({ id: file.name, file }),
  identifier: (params) => params.id,
  loader: async ({ params }) => {
    const formData = new FormData();
    formData.append('file', params.file);

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });
    return response.json();
  },
});

// Upload multiple files in parallel
uploadFile.method(file1);
uploadFile.method(file2);
uploadFile.method(file3);

// Access individual states
const file1Upload = uploadFile.select(file1.name);
console.log(file1Upload?.status()); // 'loading' or 'resolved'
console.log(file1Upload?.value()); // Upload result for file1

const file2Upload = uploadFile.select(file2.name);
console.log(file2Upload?.status()); // Independent state
```

## API

### Configuration

```typescript
asyncMethod({
  method: (args) => params, // Function to convert args to params
  loader: async ({ params }) => result, // Async operation
  identifier: (params) => string, // Optional: for parallel execution
});
```

### State Signals

```typescript
const method = asyncMethod(config);

// Available signals
method.value(); // Result value or undefined
method.status(); // 'idle' | 'loading' | 'resolved' | 'error'
method.error(); // Error or undefined
method.isLoading(); // Boolean
method.hasValue(); // Boolean
```

### Methods

```typescript
// Method-based: trigger manually
method.method(args);

// Source-based: automatic from source
method.source; // ReadonlySource
```

### With Identifier

```typescript
// Access individual instances
const instance = method.select(id);
console.log(instance?.status());
console.log(instance?.value());
```

## Use Cases

**Debounced operations**: Search, validation with delay
**Background tasks**: Processing without blocking UI
**Polling**: Periodic data updates
**Parallel operations**: Multiple concurrent file uploads
**Streaming data**: Progressive updates from server

## State Management

- **idle**: Initial state, no operation started
- **loading**: Operation in progress
- **resolved**: Operation completed successfully
- **error**: Operation failed

## Best Practices

✅ **Use method-based** for explicit control
✅ **Use source-based** for automatic reactivity
✅ **Use identifier** for parallel operations
✅ **Handle all states** in your UI
✅ **Debounce at source level** for frequent triggers

## See Also

- [state](/primitives/state) - For synchronous state
- [query](/primitives/query) - For data fetching with caching
- [mutation](/primitives/mutation) - For server mutations

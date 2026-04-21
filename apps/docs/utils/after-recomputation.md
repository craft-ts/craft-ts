# afterRecomputation

Creates a derived readonly source that transforms source emissions through a callback function.

// todo expose signals limits

## Overview

This function binds queries, mutations, and async methods to sources for automatic execution by:

- Listening to source emissions and computing new values
- Providing a readonly source suitable for method binding
- Maintaining reactivity through Angular's effect system
- Enabling source-based triggering patterns

## Signature

```typescript
function afterRecomputation<State, SourceType>(
  _source: Source<SourceType>,
  callback: (source: SourceType) => State,
): ReadonlySource<State>;
```

### Parameters

- **`_source`** - The source to listen to. When this source emits, the callback is invoked.
- **`callback`** - Function that transforms source values. Receives the emitted value and returns the transformed result.

### Returns

A readonly source that emits transformed values. Can be used as the `method` parameter in queries, mutations, and async methods.

## Primary Use Case

Bind queries/mutations/async methods to sources for automatic execution:

```typescript
method: afterRecomputation(mySource, (data) => data);
```

This pattern makes queries/mutations execute automatically when the source emits.

## Execution Flow

1. Source emits a value via `source.set(value)`
2. `afterRecomputation` callback transforms the value
3. Resulting readonly source emits the transformed value
4. Bound query/mutation/async method executes with the new value

## Difference from computedSource

- **`afterRecomputation`**: Designed for binding to method parameters
- **`computedSource`**: General-purpose source transformation
- Both transform source values, but `afterRecomputation` is optimized for method binding

## Common Patterns

- **Identity transformation**: `afterRecomputation(source, (x) => x)` - pass value through
- **Field extraction**: `afterRecomputation(source, (data) => data.id)` - extract specific field
- **Validation**: `afterRecomputation(source, (data) => validate(data))` - transform and validate
- **Mapping**: `afterRecomputation(source, (data) => mapToDto(data))` - convert to different type

## Examples

### Binding a query to a source for automatic execution

```typescript
import { afterRecomputation, query, source$ } from '@craft-ng/core';

const userIdChange = source$<string>();
const user = query({
  method: afterRecomputation(userIdChange, (userId) => userId),
  loader: async ({ params }) => {
    const response = await fetch(`/api/users/${params}`);
    return response.json();
  },
});

// Query executes automatically when source emits
userIdChange.emit('user-123');
// -> query loader executes with params 'user-123'

userIdChange.emit('user-456');
// -> query loader executes again with params 'user-456'
```

### Binding a mutation to a source

```typescript
import { afterRecomputation, mutation, source$ } from '@craft-ng/core';

const submitForm = source$<{ name: string; email: string }>();
const submit = mutation({
  method: afterRecomputation(submitForm, (formData) => formData),
  loader: async ({ params }) => {
    const response = await fetch('/api/submit', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return response.json();
  },
});

// Mutation executes automatically when source emits
submitForm.emit({ name: 'John', email: 'john@example.com' });
// -> mutation loader executes with form data
// Note: No submit.mutate(...) call is needed here
```

### Binding async method to a source

```typescript
import { afterRecomputation, asyncProcess, source$ } from '@craft-ng/core';

const searchInput = source$<string>();
const search = asyncProcess({
  method: afterRecomputation(searchInput, (term) => term),
  loader: async ({ params }) => {
    // Debounce at source level before setting
    const response = await fetch(`/api/search?q=${params}`);
    return response.json();
  },
});

// Async method executes automatically
searchInput.emit('query');
// -> search loader executes
```

### Extracting specific field from complex data

```typescript
type FormData = {
  user: { id: string; name: string };
  address: { city: string };
};

import { afterRecomputation, mutation, source$ } from '@craft-ng/core';

const formSubmit = source$<FormData>();
const updateUser = mutation({
  // Extract only user data
  method: afterRecomputation(formSubmit, (data) => data.user),
  loader: async ({ params }) => {
    const response = await fetch(`/api/users/${params.id}`, {
      method: 'PATCH',
      body: JSON.stringify(params),
    });
    return response.json();
  },
});

// Only user data is passed to mutation
formSubmit.emit({
  user: { id: 'user-1', name: 'John' },
  address: { city: 'NYC' },
});
// -> mutation receives only { id: 'user-1', name: 'John' }
```

### Transforming data before execution

```typescript
import { afterRecomputation, query, source$ } from '@craft-ng/core';

const searchParams = source$<{ query: string; filters: string[] }>();
const results = query({
  method: afterRecomputation(searchParams, (params) => ({
    q: params.query.trim().toLowerCase(),
    f: params.filters.join(','),
  })),
  loader: async ({ params }) => {
    const queryString = new URLSearchParams(params);
    const response = await fetch(`/api/search?${queryString}`);
    return response.json();
  },
});

// Data is transformed before query execution
searchParams.emit({
  query: '  Angular  ',
  filters: ['tutorial', 'advanced'],
});
// -> query receives { q: 'angular', f: 'tutorial,advanced' }
```

### Validation and type narrowing

```typescript
import { afterRecomputation, asyncProcess, source$ } from '@craft-ng/core';

const inputChange = source$<string>();
const validate = asyncProcess({
  method: afterRecomputation(inputChange, (input) => {
    // Only proceed if input is valid
    const trimmed = input.trim();
    if (trimmed.length < 3) {
      throw new Error('Input too short');
    }
    return trimmed;
  }),
  loader: async ({ params }) => {
    const response = await fetch('/api/validate', {
      method: 'POST',
      body: JSON.stringify({ input: params }),
    });
    return response.json();
  },
});

// Invalid input throws error in callback
inputChange.emit('ab'); // Error: Input too short

// Valid input proceeds
inputChange.emit('valid input'); // Validation executes
```

### Multiple sources with different transformations

```typescript
import { afterRecomputation, query, source$ } from '@craft-ng/core';

const quickSearch = source$<string>();
const advancedSearch = source$<{ query: string; options: unknown }>();

const quickResults = query({
  method: afterRecomputation(quickSearch, (term) => ({
    query: term,
    mode: 'quick',
  })),
  loader: async ({ params }) => {
    const response = await fetch('/api/search', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return response.json();
  },
});

const advancedResults = query({
  method: afterRecomputation(advancedSearch, ({ query, options }) => ({
    query,
    options,
    mode: 'advanced',
  })),
  loader: async ({ params }) => {
    const response = await fetch('/api/search/advanced', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return response.json();
  },
});

// Quick search with simple string
quickSearch.emit('angular');
// -> query receives { query: 'angular', mode: 'quick' }

advancedSearch.emit({
  query: 'angular',
  options: { tags: ['signals'] },
});
// -> query receives { query: 'angular', options: { ... }, mode: 'advanced' }
```

### Identity transformation (pass-through)

```typescript
import { afterRecomputation, mutation, source$ } from '@craft-ng/core';

const dataUpdate = source$<{ id: string; payload: unknown }>();
const update = mutation({
  // Pass data through unchanged
  method: afterRecomputation(dataUpdate, (data) => data),
  loader: async ({ params }) => {
    const response = await fetch(`/api/data/${params.id}`, {
      method: 'PUT',
      body: JSON.stringify(params.payload),
    });
    return response.json();
  },
});

// Data passed through unchanged
dataUpdate.emit({ id: 'item-1', payload: { value: 123 } });
// -> mutation receives exact same object
```

# mutation

The `mutation` primitive handles server updates (POST, PUT, DELETE) with loading states and error handling.

## Import

```typescript
import { mutation } from '@craft-ng/core';
```

## Basic Examples

### Method-based mutation

```typescript
const createUser = mutation({
  method: (payload: { name: string; email: string }) => payload,
  loader: async ({ params }) => {
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return response.json();
  },
});

// Execute mutation
createUser.mutate({ name: 'John', email: 'john@example.com' });

// Access state
console.log(createUser.isLoading()); // true/false
console.log(createUser.error()); // Error or undefined
console.log(createUser.value()); // Created user data (throws if status is 'error')
console.log(createUser.safeValue()); // Created user data (never throws)
```

### source-based mutation

```typescript
const deleteUserSource = source$<{ name: string; email: string; id: string }>();
const deleteUser = mutation({
  method: on$(deleteUserSource, (payload) => payload),
  loader: async ({ params }) => {
    const response = await fetch('/api/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return response.json();
  },
});

// Execute mutation
deleteUserSource.emit({ name: 'John', email: 'john@example.com', id: '5' });

// Access state
console.log(deleteUser.isLoading()); // true/false
console.log(deleteUser.error()); // Error or undefined
console.log(deleteUser.value()); // Created user data
```

### Parallel mutation

```typescript
const deleteUser = mutation({
  method: (payload: { name: string; email: string; id: string }) => payload,
  identifier: ({ id }) => id,
  loader: async ({ params }) => {
    const response = await fetch('/api/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return response.json();
  },
});

// Execute mutation
deleteUser.mutate({ name: 'John', email: 'john@example.com', id: '5' });

// Access state
console.log(deleteUser.select('5')?.isLoading()); // true/false
console.log(deleteUser.select('5')?.error()); // Error or undefined
console.log(deleteUser.select('5')?.value()); // Created user data
```

### Mutation exceptions (`hasException` / `exceptions()`)

```typescript
import { craftException, mutation } from '@craft-ng/core';

const updateUser = mutation({
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
      : { id: params, updated: true },
});

updateUser.mutate('ab');
console.log(updateUser.hasException()); // true
console.log(updateUser.exceptions().params?.SEARCH_TERM_TOO_SHORT);

updateUser.mutate('blocked');
console.log(updateUser.exceptions().loader?.USER_ACCESS_FORBIDDEN);
```

## Safe Value Access

Use `safeValue()` instead of `value()` when you want to access the mutation value without throwing an error:

```typescript
// value() throws an error when status is 'error'
try {
  console.log(createUser.value());
} catch (e) {
  console.log('Error accessing value');
}

// safeValue() never throws, returns undefined when status is 'error'
console.log(createUser.safeValue()); // undefined on error, value otherwise
```

::: tip
Prefer `safeValue()` in templates and computed signals to avoid unexpected errors propagation.
:::

## Important Notes

⚠️ **Injection Context**: This function must be called within an injection context. If called outside, it will only return an object containing the configuration under `_config`.

## See Also

- [query](/primitives/query) - For data fetching
- [AsyncProcess](/primitives/async-process) - For simple async operations
- [craftService](/store/craft-service) - For integrating mutations inside reusable services

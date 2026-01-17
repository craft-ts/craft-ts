# query

The `query` primitive manages server data fetching with automatic caching, loading states, and smart refetching.

## Import

```typescript
import { query } from '@ngcraft/core';
```

## Basic Examples

### Params-based query

```typescript
const myQuery = query({
  params: { id: 1 },
  loader: async ({ params }) => {
    const response = await fetch(`/api/users/${params.id}`);
    return response.json();
  },
});

// Access query state
console.log(myQuery.value()); // User data
console.log(myQuery.isLoading()); // true/false
console.log(myQuery.error()); // Error or undefined
```

### Identifier-based queries (for parallel queries)

```typescript
const query1 = query({
  identifier: 'user-1',
  params: { id: 1 },
  loader: async ({ params }) => {
    const response = await fetch(`/api/users/${params.id}`);
    return response.json();
  },
});

const query2 = query({
  identifier: 'user-2',
  params: { id: 2 },
  loader: async ({ params }) => {
    const response = await fetch(`/api/users/${params.id}`);
    return response.json();
  },
});

// Both queries run in parallel
console.log(query1.value()); // User 1 data
console.log(query2.value()); // User 2 data
```

## API

### Configuration

```typescript
query({
  // Required: Parameters for the query
  params: { id: 1, filter: 'active' },

  // Required: Loader function
  loader: async ({ params, source }) => {
    // Fetch and return data
    return fetchData(params);
  },

  // Optional: Unique identifier for parallel queries
  identifier?: string,

  // Optional: Source to trigger refetch
  source?: Signal<any>,
})
```

### Query State

```typescript
const myQuery = query(config);

// State signals
myQuery.value(); // T | undefined
myQuery.isLoading(); // boolean
myQuery.error(); // Error | undefined
myQuery.status(); // 'idle' | 'loading' | 'resolved' | 'error'
```

### Methods

For method-based queries:

```typescript
// Execute query manually
myQuery.mutate(args);
```

For queries with identifier:

```typescript
// Select a specific query instance by ID
const specificQuery = myQuery.select('query-id');
```

## Common Patterns

### Query with reactive params

```typescript
const userId = signal(1);

const userQuery = query({
  params: { id: userId() },
  loader: async ({ params }) => {
    const response = await fetch(`/api/users/${params.id}`);
    return response.json();
  },
});

// When userId changes, query refetches automatically
userId.set(2);
```

### Query with source trigger

```typescript
const refreshTrigger = signal(0);

const dataQuery = query({
  params: {},
  loader: async () => {
    const response = await fetch('/api/data');
    return response.json();
  },
  source: refreshTrigger,
});

// Trigger manual refetch
refreshTrigger.update((v) => v + 1);
```

### Parallel queries with different identifiers

```typescript
const users = query({
  identifier: 'users-list',
  params: {},
  loader: async () => {
    const response = await fetch('/api/users');
    return response.json();
  },
});

const posts = query({
  identifier: 'posts-list',
  params: {},
  loader: async () => {
    const response = await fetch('/api/posts');
    return response.json();
  },
});

// Both queries run in parallel
```

### React to mutation with insertReactOnMutation

```typescript
import { insertReactOnMutation } from '@ngcraft/core';

const updateUserMutation = mutation({
  method: (data: { id: string; name: string; email: string }) => data,
  loader: async ({ params }) => {
    const response = await fetch(`/api/users/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return response.json();
  },
});

const userQuery = query(
  {
    params: () => ({ userId: currentUserId() }),
    loader: async ({ params }) => {
      const response = await fetch(`/api/users/${params.userId}`);
      return response.json();
    },
  },
  insertReactOnMutation(updateUserMutation, {
    // Optimistically update while mutation is loading
    optimisticPatch: {
      name: ({ mutationParams }) => mutationParams.name,
      email: ({ mutationParams }) => mutationParams.email,
    },
    // Apply final update when mutation resolves
    patch: {
      name: ({ mutationParams }) => mutationParams.name,
      email: ({ mutationParams }) => mutationParams.email,
    },
  }),
);

// When mutation is triggered, query updates immediately (optimistic)
updateUserMutation.mutate({
  id: '123',
  name: 'New Name',
  email: 'new@email.com',
});
// userQuery.value() is updated optimistically

// When mutation completes, patch confirms the change
```

### Query with reload after mutation

```typescript
const createPostMutation = mutation({
  method: (data: { title: string; content: string }) => data,
  loader: async ({ params }) => {
    const response = await fetch('/api/posts', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return response.json();
  },
});

const postsQuery = query(
  {
    params: () => ({ page: 1 }),
    loader: async ({ params }) => {
      const response = await fetch(`/api/posts?page=${params.page}`);
      return response.json();
    },
  },
  insertReactOnMutation(createPostMutation, {
    // Reload the posts list when mutation completes
    reload: {
      onMutationResolved: true, // Reload on success
    },
  }),
);

// When mutation completes, postsQuery automatically reloads
createPostMutation.mutate({ title: 'New Post', content: 'Content' });
```

## Important Notes

⚠️ **Injection Context**: This function must be called within an injection context. If called outside, it will only return an object containing the configuration under `_config`.

⚠️ **Automatic refetch**: Query automatically refetches when `params` change.

⚠️ **Unique identifiers**: Use `identifier` when creating multiple queries that might have same params structure.

## Best Practices

✅ **Use meaningful identifiers** for parallel queries
✅ **Keep params simple and serializable**
✅ **Handle loading and error states** in your UI
✅ **Use source triggers** for manual refetch control
✅ **Type your query data** properly

### Query with insertions for custom methods

```typescript
const todosQuery = query(
  {
    params: () => ({ completed: showCompleted() }),
    loader: async ({ params }) => {
      const response = await fetch(`/api/todos?completed=${params.completed}`);
      return response.json();
    },
  },
  ({ value, isLoading }) => ({
    count: computed(() => value()?.length ?? 0),
    isEmpty: computed(() => !isLoading() && value()?.length === 0),
  }),
);

// Access custom computed properties
console.log(todosQuery.count()); // Number of todos
console.log(todosQuery.isEmpty()); // true/false
```

### Preserve previous value to avoid flickering

```typescript
const postsQuery = query({
  params: () => ({ page: currentPage() }),
  preservePreviousValue: () => true, // Keep showing old data while loading
  loader: async ({ params }) => {
    const response = await fetch(`/api/posts?page=${params.page}`);
    return response.json();
  },
});

// When page changes, old data remains visible until new data loads
```

## Best Practices

✅ **Use meaningful identifiers** for parallel queries
✅ **Keep params simple and serializable**
✅ **Handle loading and error states** in your UI
✅ **Use source triggers** for manual refetch control
✅ **Type your query data** properly
✅ **Use preservePreviousValue** to avoid flickering during navigation
✅ **Use insertions** to add custom computed properties and methods

## See Also

- [mutation](/primitives/mutation) - For server updates
- [asyncMethod](/primitives/async-method) - For one-off async operations
- [insertReactOnMutation](/insertions/insert-react-on-mutation) - React to mutation changes
- [Store Query](/store/craft-query) - For store integration

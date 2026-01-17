# craftQuery

Integrate queries into craft stores for server data fetching with automatic state management.

## Import

```typescript
import { craft, craftQuery, query } from '@ngcraft/core';
```

## Basic Pattern

```typescript
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftQuery('user', () =>
    query({
      params: () => currentUserId(),
      loader: async ({ params }) => {
        const response = await fetch(`/api/users/${params}`);
        return response.json();
      },
    }),
  ),
);

const store = injectCraft();

// Access query state
console.log(store.user.status()); // 'idle' | 'loading' | 'resolved' | 'error'
console.log(store.user.isLoading()); // boolean
console.log(store.user.value()); // User data or undefined
console.log(store.user.error()); // Error or undefined
```

## With Identifier (Parallel Queries)

```typescript
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftQuery('user', () =>
    query({
      params: () => currentUserId(),
      identifier: (userId) => userId,
      loader: async ({ params }) => {
        const response = await fetch(`/api/users/${params}`);
        return response.json();
      },
    }),
  ),
);

const store = injectCraft();

// Access specific query instances
const user1 = store.user.select('user-1');
console.log(user1?.status()); // Individual status
console.log(user1?.value()); // Individual result
```

## With Mutation Reactions

```typescript
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftMutations(() => ({
    updateUser: mutation({
      method: (user: User) => user,
      loader: async ({ params }) => {
        const response = await fetch(`/api/users/${params.id}`, {
          method: 'PUT',
          body: JSON.stringify(params),
        });
        return response.json();
      },
    }),
  })),
  craftQuery('user', ({ updateUser }) =>
    query(
      {
        params: () => '5',
        loader: async ({ params }) => {
          const response = await fetch(`/api/users/${params}`);
          return response.json();
        },
      },
      insertReactOnMutation(updateUser, {
        optimisticPatch: {
          name: ({ mutationParams }) => mutationParams.name,
          email: ({ mutationParams }) => mutationParams.email,
        },
        reload: {
          onMutationResolved: true,
        },
      }),
    ),
  ),
);

const store = injectCraft();

// When mutation is triggered, query updates optimistically
store.mutateUpdateUser({ id: '5', name: 'John', email: 'john@example.com' });
```

For detailed documentation, see [query primitive](/primitives/query).

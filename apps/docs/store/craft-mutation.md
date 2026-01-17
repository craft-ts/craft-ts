# craftMutations

Integrate mutations into craft stores for server updates with automatic state management.

## Import

```typescript
import { craft, craftMutations, mutation } from '@ngcraft/core';
```

## Basic Pattern

```typescript
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftMutations(() => ({
    updateUser: mutation({
      method: (user: User) => user,
      loader: async ({ params }) => {
        const response = await fetch(`/api/users/${params.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        return response.json();
      },
    }),
  })),
);

const store = injectCraft();

// Trigger mutation
store.mutateUpdateUser({ id: 1, name: 'John', email: 'john@example.com' });

// Access state
console.log(store.updateUser.status()); // 'idle' | 'loading' | 'resolved' | 'error'
console.log(store.updateUser.isLoading()); // boolean
console.log(store.updateUser.value()); // Updated user data or undefined
console.log(store.updateUser.error()); // Error or undefined
```

## With Identifier (Parallel Operations)

```typescript
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftMutations(() => ({
    updateUser: mutation({
      method: (user: User) => user,
      identifier: (params) => params.id,
      loader: async ({ params }) => {
        const response = await fetch(`/api/users/${params.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        return response.json();
      },
    }),
  })),
);

const store = injectCraft();

// Update multiple users in parallel
store.mutateUpdateUser({ id: '1', name: 'John', email: 'john@example.com' });
store.mutateUpdateUser({ id: '2', name: 'Jane', email: 'jane@example.com' });

// Track individual states
const user1Update = store.updateUser.select('1');
console.log(user1Update?.status()); // Individual status
console.log(user1Update?.value()); // Individual result
```

For detailed documentation, see [mutation primitive](/primitives/mutation).

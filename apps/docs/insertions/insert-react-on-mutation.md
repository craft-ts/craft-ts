# insertReactOnMutation

The `insertReactOnMutation` insertion allows state to automatically react to mutations, enabling powerful patterns like cache invalidation, optimistic updates, and side effects.

## Import

```typescript
import { insertReactOnMutation } from '@craft-ng/core';
```

## Basic Usage

```typescript
const updateUser = mutation({
  method: (user: User) => user,
  loader: function* ({ params: user }) {
    return yield* CraftHttpClient.patch(({ response }) => ({
      url: `/api/users/${user.id}`,
      body: user,
      success: response<User>(),
    }));
    return response.json();
  },
});

const queryRef = query(
  {
    params: () => '5',
    loader: async ({ params }) => ({
      id: params,
      name: 'John',
    }),
  },
  insertReactOnMutation(updateUser, {
    patch: {
      name: ({ mutationParams: { name } }) => name,
    },
  }),
);
```

```typescript
const updateUser = mutation({
  method: (user: User) => user,
  loader: function* ({ params: user }) {
    return yield* CraftHttpClient.patch(({ response }) => ({
      url: `/api/users/${user.id}`,
      body: user,
      success: response<User>(),
    }));
    return response.json();
  },
});

// parallel query
const queryRef = query(
  {
    params: userId,
    identifier: (userId) => userId,
    loader: function* ({ params }) {
      return yield* CraftHttpClient.get(({ response }) => ({
        url: `/api/users/${params}`,
        success: response<User>(),
      }));
    },
  },
  insertReactOnMutation(updateUser, {
    filter: ({ queryIdentifier, mutationParams }) =>
      mutationParams.id === queryIdentifier,
    patch: {
      name: ({ mutationParams: { name } }) => name,
    },
  }),
);
```

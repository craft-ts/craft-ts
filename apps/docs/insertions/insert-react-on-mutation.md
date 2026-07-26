# insertReactOnMutation

The `insertReactOnMutation` insertion allows state to automatically react to mutations, enabling powerful patterns like cache invalidation, optimistic updates, and side effects.

## Import

```typescript
import { insertReactOnMutation } from '@craft-ng/core';
```

## Combining several reactions (and other insertions)

A query accepts a single insertion; compose several `insertReactOnMutation`
(and any other insertion) with
[craftPipe](/insertions/craft-pipe) — this is the primary
real-world use case for the pipe:

```typescript
const users = query(
  {
    params: pagination,
    identifier: (params) => `${params.page}-${params.pageSize}`,
    loader: function* ({ params }) {
      return yield* ApiService.getDataList(params);
    },
  },
  (context) =>
    craftPipe(
      context,
      insertLocalStoragePersister({ storeName: 'app', key: 'users' }),
      insertReactOnMutation(deleteUser, {
        filter: ({ mutationIdentifier, queryResource }) =>
          !!queryResource.safeValue()?.some((u) => u.id === mutationIdentifier),
        optimisticUpdate: ({ queryResource, mutationIdentifier }) =>
          removeOne({ entities: queryResource.value(), id: mutationIdentifier }),
        reload: { onMutationException: true },
      }),
      insertReactOnMutation(deleteUser, {
        // reload the current page when it becomes empty
        filter: ({ queryResource }) => queryResource.safeValue()?.length === 0,
        reload: { onMutationResolved: true },
      }),
      insertReactOnMutation(bulkDelete, {
        filter: ({ queryResource }) => (queryResource.safeValue()?.length ?? 0) > 0,
        optimisticUpdate: ({ queryResource, mutationParams }) =>
          removeMany({ entities: queryResource.value(), ids: mutationParams }),
      }),
    ),
);
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

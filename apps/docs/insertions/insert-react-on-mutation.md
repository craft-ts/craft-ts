# insertReactOnMutation

The `insertReactOnMutation` insertion allows state to automatically react to mutations, enabling powerful patterns like cache invalidation, optimistic updates, and side effects.

## Import

```typescript
import { insertReactOnMutation } from '@ngcraft/core';
```

## Basic Usage

```typescript
// simple query
const mutationRef = mutation({
  method: (payload: { name: string }) => payload,
  loader: async ({ params }) => params,
});

const queryRef = query(
  {
    params: () => '5',
    loader: async ({ params }) => ({
      id: params,
      name: 'John',
    }),
  },
  insertReactOnMutation(mutationRef, {
    patch: {
      name: ({ mutationParams }) => mutationParams.name,
    },
  }),
);
-------
// parallel query
const mutationRef = mutation({
  method: (payload: { name: string; id: string }) => payload,
  loader: async ({ params }) => params,
});

const queryRef = query(
  {
    params: () => '5',
    identifier: (params) => params,
    loader: async ({ params }) => ({
      id: params,
      name: 'John',
    }),
  },
  insertReactOnMutation(mutationRef, {
    filter: ({ queryIdentifier, mutationParams }) =>
      mutationParams.id === queryIdentifier,
    patch: {
      name: ({ mutationParams }) => mutationParams.name,
    },
  }),
);
```

# Reacting to mutations

`insertReactOnMutation` declares the link between a write and the reads it
affects: patch the query optimistically, reload it, or both — without calling
`refetch()` from the mutation's call site.

**Use it when** a mutation makes some query stale.
**Not when** the two are unrelated — a reaction that fires on every write is just
a hidden coupling.

```typescript
import { insertReactOnMutation } from '@craft-ng/core';
```

## The common case

```typescript
const updateUser = yield* mutation('updateUser', {
  method: (user: User) => user,
  loader: function* ({ params: user }) {
    return yield* CraftHttpClient.patch(({ response }) => ({
      url: `/api/users/${user.id}`,
      body: user,
      success: response<User>(),
    }));
  },
});

const queryRef = yield* query(
  'queryRef',
  {
    params: () => '5',
    loader: async ({ params }) => ({ id: params, name: 'John' }),
  },
  insertReactOnMutation(updateUser, {
    patch: {
      name: ({ mutationParams: { name } }) => name,
    },
  }),
);
```

Three levers, combinable:

| Option             | Effect                                                       |
| ------------------ | ------------------------------------------------------------ |
| `patch`            | Apply a field-by-field change once the mutation resolves     |
| `optimisticPatch`  | Apply it **immediately**, before the server answers          |
| `optimisticUpdate` | Same, but you compute the whole new value                    |
| `reload`           | Re-run the loader — `onMutationSuccess` / `onMutationException` / `onMutationResolved` |
| `filter`           | Only react when this predicate passes                        |

The usual pairing is an optimistic change plus
`reload: { onMutationException: true }` — show the result instantly, and go get
the truth back if the write failed.

## Targeting the right parallel query

With `identifier`, several query instances coexist. Use `filter` so the reaction
only touches the one the mutation concerns:

```typescript
const queryRef = yield* query(
  'queryRef',
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

## Several reactions on one query

A query accepts a single insertion, so compose them with
[`insertQueryPipe`](/guide/concepts/insertion-pipes) to keep this composition
readable:

```typescript
import {
  insertQueryPipe,
  insertReactOnMutation,
  insertStoragePersister,
} from '@craft-ng/core';

const { users } = query(
  'users',
  {
    params: pagination,
    identifier: (params) => `${params.page}-${params.pageSize}`,
    loader: function* ({ params }) {
      return yield* ApiService.getDataList(params);
    },
  },
  insertQueryPipe(
      insertStoragePersister(craftUnique({
        storeName: 'app',
        key: 'users',
      })),
      insertReactOnMutation(deleteUser, {
        filter: ({ mutationIdentifier, queryResource }) =>
          !!queryResource.value()?.some((u) => u.id === mutationIdentifier),
        optimisticUpdate: ({ queryResource, mutationIdentifier }) =>
          removeOne({
            entities: queryResource.value(),
            id: mutationIdentifier,
          }),
        reload: { onMutationException: true },
      }),
      insertReactOnMutation(deleteUser, {
        // reload the current page when it becomes empty
        filter: ({ queryResource }) => queryResource.value()?.length === 0,
        reload: { onMutationResolved: true },
      }),
      insertReactOnMutation(bulkDelete, {
        filter: ({ queryResource }) =>
          (queryResource.value()?.length ?? 0) > 0,
        optimisticUpdate: ({ queryResource, mutationParams }) =>
          removeMany({ entities: queryResource.value(), ids: mutationParams }),
      }),
    ),
);
```


## Pitfalls

**Optimistic without a fallback.** `optimisticPatch` / `optimisticUpdate` show a
change that has not happened yet. Pair them with
`reload: { onMutationException: true }` so a failed write is corrected rather
than silently left on screen.

**Forgetting `filter` on parallel queries.** Without it, a mutation on one entity
patches every cached instance.

`queryResource.value()` returns `undefined` when the query is in exception;
handle that case inside a `filter`.

## See Also

- [query](/guide/state/server-state) — the read side
- [Mutations](/guide/state/mutations) — the write side
- [Insertions](/guide/concepts/insertions) — composing several reactions
- [Architecture rules](/guide/testing/architecture) — `assertMutationHasReactOn` flags a mutation no query reacts to

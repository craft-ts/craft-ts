# Persistence

`insertStoragePersister` saves a primitive's value through the configured storage backend and
restores it on the next visit — with expiry, background revalidation and a
validation hook, so stale or corrupt entries don't leak into your app.

**Use it when** a value should survive a reload: a draft, a preference, a list
you'd rather show instantly than fetch again.
**Not when** the value is sensitive, or when it must be correct rather than fast
— a restored value is by definition a value from the past.

Works with `state()`, `query()`, `mutation()` and `asyncProcess()`.

```typescript
import { craftUnique, insertStoragePersister } from '@craft-ts/core';
```

Configure the storage backend once in `appConfig`. The default application
selection remains `localStorage`; a child route, feature or test can select
`sessionStorage` instead.

```typescript
import {
  LocalStoragePersister,
  SessionStoragePersister,
  provideLocalStoragePersister,
  provideSessionStoragePersister,
  provideStoragePersister,
} from '@craft-ts/core';

providers: [
  provideLocalStoragePersister(),
  provideSessionStoragePersister(),
  provideStoragePersister(function* () {
    return yield* LocalStoragePersister();
  }),
];
```

The `StoragePersister` provider is required by `craftAppConfig` and follows
the normal Craft DI hierarchy. A child route, feature or test can override
the active backend:

```typescript
providers: [
  provideStoragePersister(function* () {
    return yield* SessionStoragePersister();
  }),
];
```

## The common case

```typescript
const { myState } = state(
  'myState',
  0,
  insertStoragePersister(craftUnique({
    storeName: 'myApp',
    key: 'myState',
  })),
);

const { myQuery } = query(
  'myQuery',
  {
    params: () => 'test',
    loader: async () => {
      return { data: 'testData' };
    },
  },
  insertStoragePersister(craftUnique({
    storeName: 'myApp',
    key: 'myQuery',
  })),
);
```

## Options

The identity (`storeName` + `key`) is the first argument, wrapped in `craftUnique` so the static graph can guarantee it appears only once. Options are the second argument.

| Option                                     | Type                          | Default     | Description                                                                                                                                                                                    |
| ------------------------------------------ | ----------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cacheTime`                                | `number`                      | `300000`    | Time in ms after which cached data is deleted from the configured storage backend (garbage collection). Set to `0` to disable expiration.                                                       |
| `staleTime`                                | `number`                      | `undefined` | Time in ms after which cached data is considered stale. The cached value is still restored immediately, but a background `reload()` is triggered (SWR pattern). Must be less than `cacheTime`. |
| `validate`                                 | `(value: unknown) => boolean` | `undefined` | Called on the deserialized value before restoring it. Return `false` to discard the entry and load fresh. Useful when the data model has changed.                                              |
| `waitForParamsSrcToBeEqualToPreviousValue` | `boolean`                     | `true`      | If `true`, waits for the params signal to stabilize before trying to restore the cache. Useful when params start as `undefined`. Not applicable to `state()`.                                  |

## cacheTime vs staleTime

|                          | Data deleted?                         | Reload triggered?              |
| ------------------------ | ------------------------------------- | ------------------------------ |
| **`cacheTime`** exceeded | Yes — entry removed from the configured backend | No                             |
| **`staleTime`** exceeded | No — data is still restored                    | Yes — `reload()` in background |

`cacheTime` always takes priority: if `cacheTime` is exceeded, the entry is discarded entirely, regardless of `staleTime`.

## SWR Pattern (staleTime)

Use `staleTime` to display cached data immediately while silently refreshing in the background — the same pattern used by SWR and TanStack Query.

```typescript
const { userQuery } = query(
  'userQuery',
  {
    params: () => currentUserId(),
    loader: async ({ params }) => fetchUser(params),
  },
  insertStoragePersister(craftUnique({
    storeName: 'myApp',
    key: 'user',
  }), {
    cacheTime: 10 * 60_000,
    // delete from the configured backend after 10 min
    staleTime: 60_000,
    // show cached + reload in background after 1 min,
  }),
);

// On page load:
// - If cache is < 1 min old  → status: 'local', no reload
// - If cache is 1–10 min old → status: 'loading', value still visible (SWR)
// - If cache is > 10 min old → entry deleted, loads fresh
```

## Validation

Use `validate` to guard against corrupt or outdated data in the configured storage backend (e.g. after a model change or manual user edit). Works with Zod or any type guard.

```typescript
import { z } from 'zod';

const UserSchema = z.object({ id: z.string(), name: z.string() });
type User = z.infer<typeof UserSchema>;

const { userQuery } = query(
  'userQuery',
  {
    params: () => currentUserId(),
    loader: async ({ params }) => fetchUser(params),
  },
  insertStoragePersister(craftUnique({
    storeName: 'myApp',
    key: 'user',
  }), {
    validate: (v): v is User => UserSchema.safeParse(v).success,
  }),
);

// If the stored value fails validation → entry is discarded, resource loads fresh
// If it passes → restored normally
```

## Parallel resources

With `query(name, { identifier })`, each instance is cached individually under
its identifier — no extra configuration:

```typescript
const postsQuery = yield* query(
  'postsQuery',
  {
    params: () => currentPostId(),
    identifier: (id) => id,
    loader: async ({ params }) => fetchPost(params),
  },
  insertStoragePersister(craftUnique({
    storeName: 'myApp',
    key: 'posts',
  }), {
    cacheTime: 15 * 60_000,
    staleTime: 2 * 60_000,
  }),
);
```

## Pitfalls

**`staleTime` must be smaller than `cacheTime`.** Otherwise the entry is deleted
before it ever gets a chance to be revalidated.

**A shipped model change invalidates nothing by itself.** Users carry the old
shape in their configured storage backend. Use `validate` — that is what it is for.

**Restoring a value is not the same as having loaded it.** Check
`isPlaceHolderData` / the status before treating a restored value as fresh.

::: details Managing stored data globally
Clearing, inspecting or migrating persisted entries across the whole app goes
through [GlobalPersisterHandler](/guide/state/persistence-handler). It delegates
to the active `StoragePersister`, so the built-in localStorage and
sessionStorage backends clear their own persisted entries.
:::

## See Also

- [GlobalPersisterHandler](/guide/state/persistence-handler)
- [query](/guide/state/server-state)
- [Insertions](/guide/concepts/insertions) — composing with other insertions
- [Architecture rules](/guide/testing/architecture) — `assertCraftUnique` on storage identities, `assertPersistedPrimitiveHasUnique` when a persister has no identity

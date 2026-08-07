# Mutations

`mutation` is `query`'s counterpart for writes: same shape, triggered
explicitly, owning its own loading and failure state.

**Use it when** you send something to a server — POST, PUT, PATCH, DELETE.
**Not when** you read ([`query`](/guide/state/server-state)) or run an async
action that isn't a server write
([`asyncProcess`](/guide/state/async-process)).

## The common case

```typescript
import { CraftHttpClient, mutation } from '@craft-ng/core';

const { createUser } =
  yield *
  mutation('createUser', {
    method: (payload: { name: string; email: string }) => payload,
    loader: function* ({ params: user }) {
      return yield* CraftHttpClient.post(({ response }) => ({
        url: '/api/users',
        body: user,
        success: response<User>(),
      }));
    },
  });

// In a tracked generator, consume the trigger with yield*.
yield * createUser.mutate({ name: 'John', email: 'john@example.com' });

createUser.isLoading();
createUser.value(); // never throws
createUser.exception();
```

`method` is the entry point: it takes what the caller passes and returns what
the loader receives as `params`. It is also where you reject bad input before any
request happens.

::: tip
`value()` is safe to read in templates and computed signals: it returns
`undefined` when the mutation has no resolved value.
:::

## Connecting it to the read side

A mutation on its own leaves your list stale. Declare the link on the query
rather than reloading by hand:

```typescript
insertReactOnMutation(createUser, { reload: { onMutationSuccess: true } });
```

That, plus optimistic updates, is on
[Reacting to mutations](/guide/state/react-on-mutation).

## Triggering from an event

Use a [`source$`](/guide/reactivity/source) as the trigger instead of calling
`.mutate(...)`:

```typescript
const deleteUserSource = source$<{ name: string; email: string; id: string }>();

const { deleteUser } =
  yield *
  mutation('deleteUser', {
    method: on$(deleteUserSource, (payload) => payload),
    loader: function* ({ params: user }) {
      return yield* CraftHttpClient.delete(({ response }) => ({
        url: '/api/users',
        body: user,
        success: response<User>(),
      }));
    },
  });

deleteUserSource.emit({ name: 'John', email: 'john@example.com', id: '5' });
```

## Rejecting bad input, and reading exceptions

`exceptions()` is split by **origin** — `params` for what `method` rejected
before any request, `loader` for what the request produced — and typed from the
codes you declared:

```typescript
const { deleteUser } =
  yield *
  mutation('deleteUser', {
    method: (payload: { userId: string }) =>
      payload.userId.length < 18
        ? craftException(
            { code: 'INVALID_ID' },
            { min: 18, received: payload.userId.length },
          )
        : payload.userId,
    loader: function* ({ params }) {
      return yield* CraftHttpClient.delete(({ response }) => ({
        url: '/api/user',
        body: params,
        success: response<User>(),
        exceptions: [
          function* ({ status }) {
            if (!(yield* status(403))) return;
            return craftException(
              { code: 'USER_ACCESS_FORBIDDEN' },
              { payload: params },
            );
          },
        ],
      }));
    },
  });

yield * deleteUser.mutate({ userId: 'ab' });
deleteUser.hasException(); // true
deleteUser.exceptions().params?.INVALID_ID;

yield * deleteUser.mutate({ userId: '12345-12344_27365453-2625434357282827' });
deleteUser.exceptions().loader?.USER_ACCESS_FORBIDDEN;
```

Returning a `craftException` from `method` means the loader never runs.

## Pitfalls

**One in-flight run replaces the previous one** unless you declare an
`identifier` (below). Deleting three rows at once without one gives you the
state of the last delete only.

**No value is available yet.** Check `hasValue()` or handle the `undefined`
result while the mutation is loading or in exception.

::: details Advanced — parallel mutations by identifier
`identifier` keeps one resource per key, so each row tracks its own state:

```typescript
const { deleteUser } =
  yield *
  mutation('deleteUser', {
    method: (payload: { name: string; email: string; id: string }) => payload,
    identifier: ({ id }) => id,
    loader: function* ({ params: user }) {
      return yield* CraftHttpClient.delete(({ response }) => ({
        url: '/api/users',
        body: user,
        success: response<User>(),
      }));
    },
  });

yield * deleteUser.mutate({ name: 'John', email: 'john@example.com', id: '5' });

deleteUser.select('5')?.isLoading();
deleteUser.select('5')?.exception();
deleteUser.select('5')?.value();
```

:::

::: details Advanced — yielding dependencies
`method`, `loader` and the insertion can all be generators, and `providers`
scopes dependencies to this mutation alone:

```typescript
const { saveUser } =
  yield *
  mutation('saveUser', {
    providers: [provideMutationLogger(), provideUserApiService()],
    method: function* (user: { id: string; name: string }) {
      yield* MutationLogger.log(`mutate:${user.id}`);
      return user;
    },
    loader: function* ({ params }) {
      return yield* UserApiService.save(params);
    },
  });
```

Inside `craftMutations(...)`, `providers` stays on each `mutation(name, ...)`
config, not on the wrapper:

```typescript
const userFeature = craft(
  { name: 'userFeature', providedIn: 'root' },
  craftMutations(() => ({
    saveUser: mutation('saveUser', {
      providers: [provideMutationLogger(), provideUserApiService()],
      method: function* (user: { id: string; name: string }) {
        yield* MutationLogger.log(`mutate:${user.id}`);
        return user;
      },
      loader: function* ({ params }) {
        return yield* UserApiService.save(params);
      },
    }).saveUser,
  })),
);
```

:::

## See Also

- [query](/guide/state/server-state) — the read side
- [Reacting to mutations](/guide/state/react-on-mutation)
- [Submitting a form](/guide/forms/submit) — wiring a form to a mutation

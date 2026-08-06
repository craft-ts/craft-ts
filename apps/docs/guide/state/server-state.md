# query

`query` fetches data and owns its whole lifecycle — loading, resolved,
exception — re-running itself when its inputs change.

**Use it when** you display data that lives on a server.
**Not when** you write to the server ([`mutation`](/guide/state/mutations)) or
run a one-off async action that isn't a fetch
([`asyncProcess`](/guide/state/async-process)).

::: warning One source of truth
Don't copy a query's result into a `state`. The query _is_ the state.
:::

## The common case

```typescript
import { CraftHttpClient, query } from '@craft-ng/core';

const { userQuery } =
  yield *
  query('userQuery', {
    params: () => ({ userId: currentUserId() }),
    loader: function* ({ params }) {
      return yield* CraftHttpClient.get(({ response }) => ({
        url: `/api/users/${params.userId}`,
        success: response<User>(),
      }));
    },
  });
```

`params` is reactive: when what it returns changes, the loader runs again. The
result carries the full async state:

```typescript
userQuery.value(); // User — throws when the status is 'exception'
userQuery.safeValue(); // User | undefined — never throws
userQuery.isLoading(); // boolean
userQuery.status(); // 'idle' | 'loading' | 'resolved' | 'exception'
userQuery.exception(); // craftException | undefined
```

::: tip Prefer `safeValue()` in templates
`value()` throws on exception, which propagates badly inside a template or a
`computed`. See [Anatomy of a primitive](/guide/concepts/primitive-anatomy).
:::

## Triggering it yourself

When the trigger is a user action rather than a reactive input, use `method`
instead of `params`:

```typescript
const { searchQuery } =
  yield *
  query('searchQuery', {
    method: (term: string) => term,
    loader: function* ({ params: term }) {
      return yield* CraftHttpClient.get(({ response }) => ({
        url: `/api/search?q=${term}`,
        success: response<Array<{ id: string; title: string }>>(),
      }));
    },
  });

// In a tracked generator, consume the trigger with yield*.
yield * searchQuery.call('angular');
```

From an ordinary UI callback, the imperative form remains valid:
`click: () => searchQuery.call(term)`. Do not put either form in a
`craftEffect` dependency graph; use reactive `params` for data loading.

## Adding derived values

Same insertion mechanism as any primitive:

```typescript
const { todosQuery } =
  yield *
  query(
    'todosQuery',
    {
      params: () => ({ completed: showCompleted() }),
      loader: async ({ params }) =>
        (await fetch(`/api/todos?completed=${params.completed}`)).json(),
    },
    ({ value, isLoading }) => ({
      count: computed(() => value()?.length ?? 0),
      isEmpty: computed(() => !isLoading() && value()?.length === 0),
    }),
  );

todosQuery.count();
```

An insertion can also be a `function*` when it needs to yield services.

## Avoiding the flicker when inputs change

**This is already the default.** When `params` change, the previous value stays
visible until the new one resolves, so a paginated list never blanks out
mid-navigation.

You only touch the option to turn it **off**:

```typescript
query('postsQuery', {
  params: () => ({ page: currentPage() }),
  preservePreviousValue: () => false, // clear the value while loading
  loader: async ({ params }) =>
    (await fetch(`/api/posts?page=${params.page}`)).json(),
});
```

::: tip Not consulted for parallel queries
With an `identifier`, each key keeps its own resource, so there is no "previous
value" to preserve — the option is ignored on that path.
:::

## Reacting to a mutation

Rather than reloading by hand after a write, declare the link:

```typescript
import { insertQueryPipe, insertReactOnMutation } from '@craft-ng/core';

const { userQuery } = yield* query(
  'userQuery',
  {
    params: () => ({ userId: currentUserId() }),
    loader: /* … */,
  },
  insertQueryPipe(
      insertReactOnMutation(updateUserMutation, {
        // apply the change immediately, before the server answers
        optimisticPatch: {
          name: ({ mutationParams }) => mutationParams.name,
          email: ({ mutationParams }) => mutationParams.email,
        },
        // and go get the truth back if the mutation failed
        reload: { onMutationException: true },
      }),
      insertLocalStoragePersister({
        storeName: 'demo-app',
        key: 'user-query',
      }),
    ),
);
```

Full options on [Reacting to mutations](/guide/state/react-on-mutation).

## Exceptions

`exceptions()` is split by **origin** and typed from the codes you declared —
`params` for what your `method` rejected before any request, `loader` for what
the request produced:

```typescript
import { craftException, query } from '@craft-ng/core';

const { userQuery } =
  yield *
  query('userQuery', {
    method: (value: string) =>
      value.length < 3
        ? craftException(
            { code: 'SEARCH_TERM_TOO_SHORT' },
            { min: 3, received: value.length },
          )
        : value,
    loader: async ({ params }) =>
      params === 'forbidden'
        ? craftException({ code: 'USER_ACCESS_FORBIDDEN' }, { id: params })
        : { id: params, name: 'John Doe' },
  });

yield * userQuery.call('ab');
userQuery.hasException(); // true
userQuery.exceptions().params?.SEARCH_TERM_TOO_SHORT;

yield * userQuery.call('forbidden');
userQuery.exceptions().loader?.USER_ACCESS_FORBIDDEN;
```

Returning a `craftException` from `method` means the loader never runs — you
don't send a request you already know will fail.

## Pitfalls

**`value()` throws.** Reach for `safeValue()` anywhere a throw is inconvenient.

**`params` must be cheap and pure.** It runs inside a reactive computation; side
effects belong in the loader.

::: details Advanced — parallel queries by identifier
`identifier` keeps one resource per key, so several runs coexist instead of
replacing each other:

```typescript
const userId = signal<number | undefined>(undefined);

const { userQuery } =
  yield *
  query('userQuery', {
    params: userId,
    identifier: (id) => id,
    loader: function* ({ params }) {
      return yield* CraftHttpClient.get(({ response }) => ({
        url: `/api/users/${params}`,
        success: response<User>(),
      }));
    },
  });

userId.set(1);
userId.set(2);

userQuery.select('1').value(); // user 1
userQuery.select('2').value(); // user 2
```

:::

::: details Advanced — typed HTTP exceptions
Loader exceptions are matched declaratively: each matcher yields predicates on
the response and returns a `craftException` when it recognises the failure.

```typescript
loader: function* ({ params }) {
  return yield* CraftHttpClient.get(({ response }) => ({
    url: `/api/users/${params}`,
    success: response<User>(),
    exceptions: [
      function* ({ status, code, content }) {
        if (!(yield* status(400))) return;
        if (!(yield* code('PASSWORD_REQUIRED'))) return;
        if (!(yield* content('Password is required'))) return;

        return craftException({
          code: 'PASSWORD_REQUIRED',
          scope: 'UsersFeatureForDependencies',
        });
      },
      function* ({ body, header }) {
        const payload = yield* body<{
          errors?: Array<{ field: 'password' }>;
        }>();

        if (!payload.errors?.some((error) => error.field === 'password')) return;
        if (!(yield* header('x-error-kind', 'validation'))) return;

        return craftException({
          code: 'VALIDATION_HEADER_ERROR',
          scope: 'UsersFeatureForDependencies',
        });
      },
    ],
  }));
}
```

Working source:
[exceptions demo](https://github.com/ng-angular-stack/ng-craft/blob/main/apps/demo/src/app/examples/primitives/exceptions/exceptions.ts).
:::

::: details Advanced — yielding dependencies from `params`
`params` can be a generator, and so can an insertion:

```typescript
const { userQuery } =
  yield *
  query(
    'userQuery',
    {
      providers: [provideUserService(), provideUserApiService()],
      params: function* () {
        return yield* UserService.userId();
      },
      loader: function* ({ params: userId }) {
        return yield* UserApiService.get(userId);
      },
    },
    function* () {
      const queryTools = yield* QueryTools();
      return { queryKey: `${queryTools.prefix()}:details` };
    },
  );
```

:::

## See Also

- [Mutations](/guide/state/mutations) — the write side
- [Reacting to mutations](/guide/state/react-on-mutation)
- [Anatomy of a primitive](/guide/concepts/primitive-anatomy)

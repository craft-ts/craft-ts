# query

`query` fetches data and owns its whole lifecycle — loading, resolved,
exception — re-running itself when its inputs change.

**Use it when** you display data that lives on a server.
**Not when** you write to the server ([`mutation`](/guide/state/mutations)) or
run a one-off async action that isn't a fetch
([`asyncProcess`](/guide/state/async-process)).

::: warning One source of truth
Don't copy a query's result into a `state`. The query _is_ the state.
Don't reload it from a `craftEffect` either — put the inputs in `params` so
the loader re-runs when they change.
:::

## The common case

```typescript
import { CraftHttpClient, craftComputed, craftUse, query, settled } from '@craft-ts/core';

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
userQuery.value(); // User | undefined — never throws
userQuery.isLoading(); // boolean
userQuery.status(); // 'idle' | 'loading' | 'resolved' | 'exception'
userQuery.exception(); // craftException | undefined
```

::: tip
`value()` is safe to read in templates and computed signals: it returns
`undefined` when the query has no resolved value.
:::

## Reading only settled data

Use `settledValue` when a template or derived computation requires a real
value. It suspends to the nearest `pendingNode` while the first value is
unavailable, propagates query exceptions to a `catchNode`, and keeps the
previous value during a reload.

```typescript
const userName = craftComputed('userName', function* () {
  return (yield* settled(userQuery)).name;
});

const user = craftUse(userQuery.settledValue());
```

Insertion contexts keep the existing fallback behaviour of `state()`. Use
`settledState()` when `yield*` (or `craftUse`) should return a non-nullable
value and suspend until the current resource is available.

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
yield * searchQuery.call('craft');
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
      count: craftComputed(function* () {
        return (yield* value())?.length ?? 0;
      }),
      isEmpty: craftComputed(function* () {
        return !(yield* isLoading()) && (yield* value())?.length === 0;
      }),
    }),
  );

yield* todosQuery.count();
```

An insertion can also be a `function*` when it needs to yield services.

## Enriching every item in a list

When a query returns an array, `insertQuerySelect` attaches an insertion to each
selected item. The selector keeps the item type, so derived values can use its
properties without casting:

```typescript
import { craftComputed as computed } from '@craft-ts/core';
import { CraftHttpClient, insertQuerySelect, query } from '@craft-ts/core';

type User = {
  id: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'member';
};

const { usersQuery } =
  yield *
  query(
    'usersQuery',
    {
      params: () => ({ teamId: currentTeamId() }),
      loader: function* ({ params }) {
        return yield* CraftHttpClient.get(({ response }) => ({
          url: `/api/teams/${params.teamId}/users`,
          success: response<User[]>(),
        }));
      },
    },
    insertQuerySelect('user', ({ state }) => ({
      displayName: craftComputed(function* () {
        const user = yield* state();
        return `${user.firstName} ${user.lastName}`;
      }),
      roleLabel: craftComputed(function* () {
        return (yield* state()).role === 'admin' ? 'Administrator' : 'Member';
      }),
    })),
  );

// `selectUser` targets one item in the returned array.
const firstUser = usersQuery.selectUser(0);
yield* firstUser?.displayName(); // 'Ada Lovelace'
yield* firstUser?.roleLabel(); // 'Administrator'
```

The same pattern supports selecting a nested object property with
`insertQuerySelect`, while preserving the selected property's type.

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
import {
  insertQueryPipe,
  insertReactOnMutation,
  insertStoragePersister,
} from '@craft-ts/core';

const userQuery = yield* query(
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
      insertStoragePersister(craftUnique({
        storeName: 'demo-app',
        key: 'user-query',
      })),
    ),
);
```

Full options on [Reacting to mutations](/guide/state/react-on-mutation).

## Exceptions

`exceptions()` is split by **origin** and typed from the codes you declared —
`params` for what your `method` rejected before any request, `loader` for what
the request produced:

```typescript
import { craftException, query } from '@craft-ts/core';

const { userQuery } =
  yield *
  query('userQuery', {
    method: (value: string) =>
      value.length < 3
        ? craftException(
            { _tag: 'SEARCH_TERM_TOO_SHORT' },
            { min: 3, received: value.length },
          )
        : value,
    loader: async ({ params }) =>
      params === 'forbidden'
        ? craftException({ _tag: 'USER_ACCESS_FORBIDDEN' }, { id: params })
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

**No value is available yet.** Check `hasValue()` or handle the `undefined`
result while the query is loading or in exception.

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
          _tag: 'PASSWORD_REQUIRED',
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
          _tag: 'VALIDATION_HEADER_ERROR',
          scope: 'UsersFeatureForDependencies',
        });
      },
    ],
  }));
}
```

Working source:
[exceptions demo](https://github.com/craft-ts/craft-ts/blob/main/apps/demo/src/app/examples/primitives/exceptions/exceptions.ts).
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

::: tip Advanced — injectable writes
Insertion methods provide `injectQueryMethodRuntimeContext()`, and the query
value itself is published to `providePrimitiveResourceRuntimeObserver`. Both
expose `get`, `set`, `update`, and `patch`, so wrappers, WebMCP tools, and
other advanced patterns can seed or replace a result without going through the
insertion callback. See
[Anatomy of a primitive](/guide/concepts/primitive-anatomy#injectable-runtime-context).
:::

## See Also

- [Mutations](/guide/state/mutations) — the write side
- [Reacting to mutations](/guide/state/react-on-mutation)
- [Anatomy of a primitive](/guide/concepts/primitive-anatomy)

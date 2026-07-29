# query

The `query` primitive manages server data fetching - that can be easily extended for syncing with localStorage, reacting to mutations (that unlock optimistic update, update, reload on failed...).

## Import

```typescript
import { query, craftUse } from '@craft-ng/core';
```

## Consuming the primitive

Every craft primitive takes its **name** as first argument and resolves to a
single-key record, so you always consume it by destructuring:

- inside a generator host (a `craftService` factory, `craftGen`, …) with
  `const { userQuery } = yield* query('userQuery', {...})` — the dependencies fold into
  the enclosing service tree automatically;
- anywhere else (typically a component field) with
  `const { userQuery } = craftUse(query('userQuery', {...}))`.

The name is more than a label: it tags the primitive's injector
(`query:userQuery`), so it identifies the primitive in snapshots, logs and
observability.

A factory arrow that returns the primitive directly now resolves to the
**record**, not the ref. Drive the primitive yourself when the service should
expose the ref:

```typescript
craftService({ name: 'MyService', scope: 'global' }, function* () {
  const { userQuery } = yield* query('userQuery', {
    /* ... */
  });
  return userQuery;
});
```

The generator is single-use: consume each invocation exactly once.

For brevity, the examples below focus on the configuration and omit the
`yield*` / `craftUse` wrapper.

## Basic Examples

### Params-based query

```typescript
const id = signal(1);
const { myQuery } = query('myQuery', {
  params: id,
  loader: function* ({ params: userId }) {
    return yield* CraftHttpClient.get(({ response }) => ({
      url: `/api/users/${userId}`,
      success: response({
        decode: (input: unknown) => input as { id: string; email: string },
      }),
    }));
  },
});

// Access query state
console.log(myQuery.value()); // User data (throws if status is 'exception')
console.log(myQuery.safeValue()); // User data (never throws, returns undefined on exception)
console.log(myQuery.isLoading()); // true/false
console.log(myQuery.exception()); // craftException or undefined
console.log(myQuery.status()); // 'idle' | 'loading' | 'resolved' | 'exception'
```

### Method-based query

```typescript
const { searchQuery } = query('searchQuery', {
  method: (term: string) => term,
  loader: function* ({ params: term }) {
    return yield* CraftHttpClient.get(({ response }) => ({
      url: `/api/search?q=${term}`,
      success: response({
        decode: (input: unknown) =>
          input as Array<{ id: string; title: string }>,
      }),
    }));
  },
});
// Trigger the query by calling it with a search term
searchQuery.call('angular');
```

### Identifier-based queries (for parallel queries)

```typescript
const userId = signal<number | undefined>(undefined);
const { userQuery } = query('userQuery', {
  params: userId,
  identifier: (id) => id,
  loader: function* ({ params: userId }) {
    return yield* CraftHttpClient.get(({ response }) => ({
      url: `/api/users/${userId}`,
      success: response({
        decode: (input: unknown) => input as { id: string; email: string },
      }),
    }));
  },
});

// Both queries run in parallel
userId.set(1);
// later
userId.set(2);
// Once all queries are resolved
console.log(userQuery.select('1').value()); // User 1 data
console.log(userQuery.select('2').value()); // User 2 data
```

### Dependency-based query

```typescript
const { userQuery } = query(
  'userQuery',
  {
    params: function* () {
      return yield* UserService.userId();
    },
    loader: function* ({ params: userId }) {
      return yield* UserApiService.get(userId);
    },
  },
  //insertions can also be generator functions to yield dependencies
  function* () {
    const queryTools = yield* QueryTools();
    return {
      queryKey: `${queryTools.prefix()}:details`,
    };
  },
);
```

### Add providers to query

```typescript
const { userQuery } = query('userQuery', {
  providers: [provideUserService(), provideUserApiService()],
  params: function* () {
    return yield* UserService.userId();
  },
  loader: function* ({ params: userId }) {
    return yield* UserApiService.get(userId);
  },
});
```

### React to mutation with insertReactOnMutation and persist in local storage

```typescript
import { craftPipe, insertReactOnMutation } from '@craft-ng/core';

const { updateUserMutation } = mutation('updateUserMutation', {
  method: (data: { id: string; name: string; email: string }) => data,
  loader: function* ({ params }) {
    return yield* CraftHttpClient.post(({ response }) => ({
      url: `/api/users/${params.id}`,
      body: { name: params.name, email: params.email },
      success: response<User>(),
    }));
  },
});

const { userQuery } = query(
  'userQuery',
  {
    params: () => ({ userId: currentUserId() }),
    loader: function* ({ params }) {
      return yield* CraftHttpClient.get(({ response }) => ({
        url: `/api/users/${params.userId}`,
        success: response<User>(),
      }));
    },
  },
  // several insertions compose into one with craftPipe
  (context) =>
    craftPipe(
      context,
      insertReactOnMutation(updateUserMutation, {
        // Optimistically update while mutation is loading
        optimisticPatch: {
          name: ({ mutationParams }) => mutationParams.name,
          email: ({ mutationParams }) => mutationParams.email,
        },
        // Reload the query if updateUserMutation failed
        reload: { onMutationException: true },
      }),
      insertLocalStoragePersister({
        storeName: 'demo-app',
        key: 'user-query',
      }),
    ),
);

// When mutation is triggered, query updates immediately (optimistic)
updateUserMutation.mutate({
  id: '123',
  name: 'New Name',
  email: 'new@email.com',
});
// userQuery.value() is updated optimistically

// When mutation completes, patch confirms the change
```

### Query exceptions (`hasException` / `exceptions()`)

```typescript
import { craftException, query } from '@craft-ng/core';

const { userQuery } = query('userQuery', {
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

userQuery.call('ab');
console.log(userQuery.hasException()); // true
console.log(userQuery.exceptions().params?.SEARCH_TERM_TOO_SHORT);

userQuery.call('forbidden');
console.log(userQuery.exceptions().loader?.USER_ACCESS_FORBIDDEN);
```

### Query with http exceptions

```typescript
const { userQuery } = query('userQuery', {
  params: () => ({ userId: currentUserId() }),
  loader: function* ({ params: userId }) {
    return yield* CraftHttpClient.get(({ response }) => ({
      url: `/api/users/${userId}`,
      success: response<User>(),
      exceptions: [
        function* ({ status, code, content }) {
          if (!(yield* status(400))) {
            return;
          }

          if (!(yield* code('PASSWORD_REQUIRED'))) {
            return;
          }

          if (!(yield* content('Password is required'))) {
            return;
          }

          return craftException({
            code: 'PASSWORD_REQUIRED',
            scope: 'UsersFeatureForDependencies',
          });
        },
        function* ({ body, header }) {
          const payload = yield* body<{
            errors?: Array<{ field: 'password' }>;
          }>();

          if (!payload.errors?.some((error) => error.field === 'password')) {
            return;
          }

          if (!(yield* header('x-error-kind', 'validation'))) {
            return;
          }

          return craftException({
            code: 'VALIDATION_HEADER_ERROR',
            scope: 'UsersFeatureForDependencies',
          });
        },
      ],
    }));
  },
});
```

Demo source:

- [Exceptions demo source (`query` business exceptions)](https://github.com/ng-angular-stack/ng-craft/blob/main/apps/demo/src/app/examples/primitives/exceptions/exceptions.ts)

## Important Notes

⚠️ **Injection Context**: This function must be called within an injection context. If called outside, it will only return an object containing the configuration under `_config`.

## Query with insertions for custom methods

```typescript
const { todosQuery } = query(
  'todosQuery',
  {
    params: () => ({ completed: showCompleted() }),
    loader: async ({ params }) => {
      const response = await fetch(`/api/todos?completed=${params.completed}`);
      return response.json();
    },
  },
  ({ value, isLoading }) => ({
    count: computed(() => value()?.length ?? 0),
    isEmpty: computed(() => !isLoading() && value()?.length === 0),
  }),
);

// Access custom computed properties
console.log(todosQuery.count()); // Number of todos
console.log(todosQuery.isEmpty()); // true/false
```

### Preserve previous value to avoid flickering

```typescript
const { postsQuery } = query('postsQuery', {
  params: () => ({ page: currentPage() }),
  preservePreviousValue: () => true, // Keep showing old data while loading
  loader: async ({ params }) => {
    const response = await fetch(`/api/posts?page=${params.page}`);
    return response.json();
  },
});

// When page changes, old data remains visible until new data loads
```

## Safe Value Access

Use `safeValue()` instead of `value()` when you want to access the query value without throwing an error:

```typescript
// value() throws an error when status is 'exception'
// This can cause issues in templates or computed signals
try {
  console.log(myQuery.value());
} catch (e) {
  console.log('Error accessing value');
}

// safeValue() never throws, returns undefined when status is 'exception'
console.log(myQuery.safeValue()); // undefined on exception, value otherwise
```

::: tip
Prefer `safeValue()` in templates and computed signals to avoid unexpected errors propagation.
:::

## Best Practices

✅ **Use preservePreviousValue** to avoid flickering during navigation
✅ **Use insertions** to add custom computed properties and methods

## See Also

- [mutation](/primitives/mutation) - For server updates
- [AsyncProcess](/primitives/async-process) - For one-off async operations
- [insertReactOnMutation](/insertions/insert-react-on-mutation) - React to mutation changes
- [craftService](/store/craft-service) - For integrating queries inside reusable services

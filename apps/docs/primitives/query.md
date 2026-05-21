# query

The `query` primitive manages server data fetching - that can be easily extended for syncing with localStorage, reacting to mutations (that unlock optimistic update, update, reload on failed...).

## Import

```typescript
import { query } from '@craft-ng/core';
```

## Basic Examples

### Params-based query

```typescript
const id = signal(1);
const myQuery = query({
  params: () => ({ id: id() }),
  loader: function* () {
    return yield* CraftHttpClient.get(({ response }) => ({
      url: '/api/users',
      success: response<User[]>(),
    }));
  },
});

// Access query state
console.log(myQuery.value()); // User data (throws if status is 'error')
console.log(myQuery.safeValue()); // User data (never throws, returns undefined on error)
console.log(myQuery.isLoading()); // true/false
console.log(myQuery.error()); // Error or undefined
```

### Method-based query

```typescript
const searchQuery = query({
  method: (term: string) => term,
  loader: function* ({ params: term }) {
    return yield* CraftHttpClient.get(({ response }) => ({
      url: `/api/search?q=${term}`,
      success: response<SearchResult[]>(),
    }));
  },
});
// Trigger the query by calling it with a search term
searchQuery.call('angular');
```

### Identifier-based queries (for parallel queries)

```typescript
const userId = signal<number | undefined>(undefined);
const query = query({
  params: userId,
  identifier: (id) => id,
  loader: function* ({ params: userId }) {
    return yield* CraftHttpClient.get(({ response }) => ({
      url: `/api/users/${userId}`,
      success: response<User>(),
    }));
  },
});

// Both queries run in parallel
userId.set(1);
// later
userId.set(2);
// Once all queries are resolved
console.log(query.select('1').value()); // User 1 data
console.log(query.select('2').value()); // User 2 data
```

### Dependency-based query

```typescript
const query = query(
  {
    params: function* () {
      return yield* UserServiceToYield.userId();
    },
    loader: function* ({ params: userId }) {
      return yield* UserApiServiceToYield.get(userId);
    },
  },
  //insertions can also be generator functions to yield dependencies
  function* () {
    const queryTools = yield* QueryToolsToYield();
    return {
      queryKey: `${queryTools.prefix()}:details`,
    };
  },
);
```

### Add providers to query

````typescript
const query = query(
  {
    providers: [provideUserService(), provideUserApiService()],
    params: function* () {
      return yield* UserServiceToYield.userId();
    },
    loader: function* ({ params: userId }) {
      return yield* UserApiServiceToYield.get(userId);
    },
  },
);
```

### React to mutation with insertReactOnMutation and persist in local storage

```typescript
import { insertReactOnMutation } from '@craft-ng/core';

const updateUserMutation = mutation({
  method: (data: { id: string; name: string; email: string }) => data,
  loader: function* ({ params }) {
    return yield* CraftHttpClient.post(({ response }) => ({
      url: `/api/users/${params.id}`,
      body: { name: params.name, email: params.email },
      success: response<User>(),
    }));
  },
});

const userQuery = query(
  {
    params: () => ({ userId: currentUserId() }),
    loader: function* ({ params }) {
      return yield* CraftHttpClient.get(({ response }) => ({
        url: `/api/users/${params.userId}`,
        success: response<User>(),
      }));
    },
  },
  insertReactOnMutation(updateUserMutation, {
    // Optimistically update while mutation is loading
    optimisticPatch: {
      name: ({ mutationParams }) => mutationParams.name,
      email: ({ mutationParams }) => mutationParams.email,
    },
    // Reload the query if updateUserMutation failed
    reload: { onMutationError: true },
  }),
  insertLocalStoragePersister({
    storeName: 'demo-app',
    key: 'user-query',
  }),
);

// When mutation is triggered, query updates immediately (optimistic)
updateUserMutation.mutate({
  id: '123',
  name: 'New Name',
  email: 'new@email.com',
});
// userQuery.value() is updated optimistically

// When mutation completes, patch confirms the change
````

### Query exceptions (`hasException` / `exceptions()`)

```typescript
import { craftException, query } from '@craft-ng/core';

const userQuery = query({
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
const userQuery = query({
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
const todosQuery = query(
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
const postsQuery = query({
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
// value() throws an error when status is 'error'
// This can cause issues in templates or computed signals
try {
  console.log(myQuery.value());
} catch (e) {
  console.log('Error accessing value');
}

// safeValue() never throws, returns undefined when status is 'error'
console.log(myQuery.safeValue()); // undefined on error, value otherwise
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

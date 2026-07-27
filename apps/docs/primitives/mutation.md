# mutation

The `mutation` primitive handles server updates (POST, PUT, DELETE) with loading states and error handling.

## Import

```typescript
import { mutation, craftUse } from '@craft-ng/core';
```

## Consuming the primitive

Every craft primitive takes its **name** as first argument and resolves to a
single-key record, so you always consume it by destructuring:

- inside a generator host (a `craftService` factory, `craftGen`, …) with
  `const { saveUser } = yield* mutation('saveUser', {...})` — the dependencies fold into
  the enclosing service tree automatically;
- anywhere else (typically a component field) with
  `const { saveUser } = craftUse(mutation('saveUser', {...}))`.

The name is more than a label: it tags the primitive's injector
(`mutation:saveUser`), so it identifies the primitive in snapshots, logs and
observability.

A factory arrow that returns the primitive directly now resolves to the
**record**, not the ref. Drive the primitive yourself when the service should
expose the ref:

```typescript
craftService({ name: 'MyService', scope: 'global' }, function* () {
  const { saveUser } = yield* mutation('saveUser', {
    /* ... */
  });
  return saveUser;
});
```

The generator is single-use: consume each invocation exactly once.

For brevity, the examples below focus on the configuration and omit the
`yield*` / `craftUse` wrapper.

## Basic Examples

### Method-based mutation

```typescript
const { createUser } = mutation('createUser', {
  method: (payload: { name: string; email: string }) => payload,
  loader: function* ({ params: user }) {
    return yield* CraftHttpClient.post(({ response }) => ({
      url: '/api/users',
      body: user,
      success: response<User>(),
    }));
  },
});

// Execute mutation
createUser.mutate({ name: 'John', email: 'john@example.com' });

// Access state
console.log(createUser.isLoading()); // true/false
console.log(createUser.exception()); // craftException or undefined
console.log(createUser.value()); // Created user data (throws if status is 'exception')
console.log(createUser.safeValue()); // Created user data (never throws)
```

### source-based mutation

```typescript
const deleteUserSource = source$<{ name: string; email: string; id: string }>();
const { deleteUser } = mutation('deleteUser', {
  method: on$(deleteUserSource, (payload) => payload),
  loader: function* ({ params: user }) {
    return yield* CraftHttpClient.delete(({ response }) => ({
      url: '/api/users',
      body: user,
      success: response<User>(),
    }));
  },
});

// Execute mutation
deleteUserSource.emit({ name: 'John', email: 'john@example.com', id: '5' });

// Access state
console.log(deleteUser.isLoading()); // true/false
console.log(deleteUser.exception()); // craftException or undefined
console.log(deleteUser.value()); // Created user data
```

### Parallel mutation

```typescript
const { deleteUser } = mutation('deleteUser', {
  method: (payload: { name: string; email: string; id: string }) => payload,
  identifier: ({ id }) => id,
  loader: function* ({ params: user }) {
    return yield* CraftHttpClient.delete(({ response }) => ({
      url: '/api/users',
      body: user,
      success: response<User>(),
    }));
    return response.json();
  },
});

// Execute mutation
deleteUser.mutate({ name: 'John', email: 'john@example.com', id: '5' });

// Access state
console.log(deleteUser.select('5')?.isLoading()); // true/false
console.log(deleteUser.select('5')?.exception()); // craftException or undefined
console.log(deleteUser.select('5')?.value()); // Created user data
```

### Mutation exceptions (`hasException` / `exceptions()`)

```typescript
const { deleteUser } = mutation('deleteUser', {
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
          if (!(yield* status(403))) {
            return;
          }

          return craftException(
            { code: 'USER_ACCESS_FORBIDDEN' },
            { payload: params },
          );
        },
      ],
    }));
  },
});

deleteUser.mutate({ userId: 'ab' });
console.log(deleteUser.hasException()); // true
console.log(deleteUser.exceptions().params?.INVALID_ID);

deleteUser.mutate({ userId: '12345-12344_27365453-2625434357282827' });
console.log(deleteUser.exceptions().loader?.USER_ACCESS_FORBIDDEN);
```

### Dependency-based mutation

```typescript
const { mutationRef } = mutation(
  'mutationRef',
  {
    method: function* (userId: string) {
      const logger = yield* MutationLoggerRuntime.log(`mutate:${userId}`);
      return userId;
    },
    loader: function* ({ params }) {
      return yield* MutationApiRuntime.save(params);
    },
  },
  function* () {
    const logger = yield* MutationLoggerRuntime.log('insert:init');
    return {
      initialized: true,
    };
  },
);
```

### Add providers to mutation

```typescript
const { saveUser } = mutation('saveUser', {
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

### Add providers to a mutation inside `craftMutations`

`providers` stays on each `mutation(name, ...)` config, not on the `craftMutations(...)` wrapper:

```typescript
const userFeature = craft(
  {
    name: 'userFeature',
    providedIn: 'root',
  },
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

## Safe Value Access

Use `safeValue()` instead of `value()` when you want to access the mutation value without throwing an error:

```typescript
// value() throws an error when status is 'exception'
try {
  console.log(createUser.value());
} catch (e) {
  console.log('Error accessing value');
}

// safeValue() never throws, returns undefined when status is 'exception'
console.log(createUser.safeValue()); // undefined on exception, value otherwise
```

::: tip
Prefer `safeValue()` in templates and computed signals to avoid unexpected errors propagation.
:::

## Important Notes

⚠️ **Injection Context**: This function must be called within an injection context. If called outside, it will only return an object containing the configuration under `_config`.

## See Also

- [query](/primitives/query) - For data fetching
- [AsyncProcess](/primitives/async-process) - For simple async operations
- [craftService](/store/craft-service) - For integrating mutations inside reusable services

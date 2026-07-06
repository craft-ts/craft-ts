# Introduction

## What is @craft-ng/core?

**@craft-ng/core** is a fully declarative and type-safe solution with explicit dependency tracking. Powered by a type-safe Dependency Injection system, it enables you to represent state and UX behavior in a composable, logic-driven manner. Ideal for improving readability, maintainability, testability, and AI generation.

## Core Philosophy

## The deriving principle

All helpers are designed to be used declaratively. The library derives as much logic as possible. This helps preserve and reuse data without explicit types.

### Type-Safe system

By tracking component and service dependencies at the type level, @craft-ng/core provides a fully type-safe system that eliminates a whole class of runtime errors and enhances developer confidence.

- Promotes declaring state and logic as close as possible to where they are used.
- Type-safe routing.
- Better testability (service isolation testing is easy, and browser-boundary isolation follows the same approach).

### Granular dependency tracking

When injecting or yielding a service, you can derive only the part you need. This makes code more explicit and simplifies tests, since you only provide the required slice of the service.

### Focus on What Matters

Stop wasting precious time on common application logic. @craft-ng/core provides utilities that handle the repetitive patterns found in every Angular application, so you can focus on delivering value to your users.

`state`, `queryParam`, `query`, `mutation`, and `asyncProcess` are reactive primitives that significantly improve the developer experience.

### Type-safe routing

- Navigation is type-safe
- Passing route inputs (params or data) is type-safe
- Query parameters can live directly in the route
- Injecting route params, data or query params is type-safe

### Powered by Signals

**100% based on Signals** - RxJS is optional. Reactive primitives integrate seamlessly into your Angular components and services.

### Compose all your reactive primitive logic

```typescript
const myState = state(
  0,
  ({ update, set }) => ({
    increment: () => update((current) => current + 1),
    reset: () => set(0),
  }),
  ({ state }) => ({
    isOdd: computed(() => state() % 2 === 1),
  }),
);

myState(); // 0
myState.increment();
myState(); // 1
myState.isOdd(); // true
myState.reset();
myState(); // 0
```

### Use existing insertions 💎 for composition and reusability

Designed for logic composition and reuse:

- **localStorage synchronization**
- **Optimistic updates**
- **Smart loading states**
- **And much more...**

```typescript
import { state, query, insertLocalStoragePersister } from '@craft-ng/core';

// Compose state with localStorage sync
const myState = state(
  0,
  insertLocalStoragePersister({
    storeName: 'myStore',
    key: 'myState',
  }),
);

const myQuery = query(
  {
    params: () => 1,
    loader: async ({ params }) => {
      const response = await fetch(`/api/users/${params}`);
      return response.json();
    },
  },
  insertLocalStoragePersister({
    storeName: 'myStore',
    key: 'myUserQuery',
  }),
);
```

### Flexible Architecture

**Adaptable to any architecture:**

- Method-based approach for simple scenarios
- Source-based approach for event-driven-like architecture
- Hybrid patterns for more flexibility

```typescript
const resetSource$ = source$<void>();

const counter = state(0, ({ set, update }) => ({
  // method-based
  increment: () => update((v) => v + 1),
  // source-based (reset, is not exposed)
  reset: on$(resetSource$, (value) => set(0)),
}));
```

### Granular And Declarative State Management

Promotes creating **granular state** with declarative patterns, isolating each state for better maintainability and testability.

```typescript
const resetSource$ = source$<void>();

const search = state('', ({ set }) => ({
  // method-based
  set,
  // source-based (reset, is not exposed)
  reset: on$(resetSource$, (value) => set('')),
}));

const page = state(1, ({ set, update }) => ({
  // method-based
  increment: () => update((v) => v + 1),
  // source-based (reset, is not exposed)
  reset: on$(resetSource$, (value) => set(1)),
}));
```

When `resetSource.emit()` is called, `search` resets to `''` and `page` resets to `1`.

[on$](/utils/on$) - For more info.

### Service Composition

Compose named services that package primitives and Angular dependencies behind an explicit API:

- **`craftService`** for the services you author
- **`toCraftService`** to adapt existing Angular services or tokens
- **Explicit scopes** for app-wide, provider-mounted, or factory-style lifecycles

```typescript
type User = { id: string; email: string };

const { UserApiToYield } = craftService(
  { name: 'UserApi', scope: 'function' },
  function* () {
    const http = yield* CraftHttpClient;
    return {
      getUser: (id: string) =>
        http.get(({ response }) => ({
          url: `users/${id}`,
          success: response<User>(),
        })),
      updateEmail: (payload: { id: string; email: string }) =>
        http.patch(({ response }) => ({
          url: `users/${payload.id}`,
          body: JSON.stringify(payload),
          success: response<User>(),
        })),
    };
  },
);

const { injectUserProfile } = craftService(
  { name: 'UserProfile', scope: 'global' },
  function* () {
    const userId = state('5', ({ set }) => ({ set }));

    const updateEmail = mutation({
      method: (payload: { id: string; email: string }) => payload,
      loader: function* ({ params }) {
        return yield* api.updateEmail(params);
      },
    });

    const user = query(
      {
        params: userId,
        loader: function* ({ params }) {
          return yield* api.getUser(params);
        },
      },
      insertReactOnMutation(updateEmail, {
        optimisticPatch: {
          email: ({ mutationParams }) => mutationParams.email,
        },
        reload: {
          onMutationException: true,
        },
      }),
    );

    return {
      userId,
      user,
      updateEmail,
    };
  },
);

const profile = injectUserProfile();
profile.userId.set('42');
profile.updateEmail.mutate({ id: '42', email: 'new@email.com' });
console.log(profile.user.value().email);
```

`craftService` composes the primitives you author. `toCraftService` adapts existing Angular dependencies so they can participate in the same typed composition and testing workflow.

### 100% type-safe - Maximum TypeScript Inference

Utilizes TypeScript inference to the maximum, limiting types you need to declare and avoiding human errors.

### Frictionless Developer Experience

Designed for a **smooth developer experience** with:

- Declarative state creation
- Explicit service composition
- Clear and intuitive API

## Key Features

✅ **State Management** - Reactive state with signals
✅ **Async Operations** - Built-in async method handling
✅ **Query Parameters** - URL state synchronization
✅ **Server Queries** - Data fetching with caching
✅ **Mutations** - Server updates with optimistic UI
✅ **Insertions** - Composable state enhancements
✅ **Utilities** - Source, toSource, and more

## Import Path

```typescript
import {
  state,
  AsyncProcess,
  queryParam,
  query,
  mutation,
  craftService,
  toCraftService,
  // ... and more
} from '@craft-ng/core';
```

## Next Steps

Ready to dive in? Start with:

- [Primitives](/primitives/state) - Learn the building blocks
- [craftService](/store/craft-service) - Compose reusable service boundaries
- [toCraftService](/store/to-craft-service) - Adapt Angular services into the same model
- [Examples](/examples) - See it in action

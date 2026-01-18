# Introduction

## What is @ngcraft?

**@ngcraft** is a reactive state management tool designed specifically for Angular applications. It focuses on URL, Client, and Server state management, allowing you to concentrate on business value and user experience.

## Core Philosophy

### Focus on What Matters

Stop wasting precious time on common application logic. @ngcraft provides utilities that handle the repetitive patterns found in every Angular application, so you can focus on delivering value to your users.

`state`, `asyncState`, `queryParam`, `query`, `mutation` and `asyncMethod` are reactive primitive that will make your developer experience a lot better.

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

### Use existing Insertions 💎 - For Composition & Reusability

Designed for logic composition and reuse:

- **localStorage synchronization**
- **Optimistic updates**
- **Smart loading states**
- **And much more...**

```typescript
import { state, insertLocalStorage } from '@ngcraft/core';

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
- Hybrid patterns for complex applications

```typescript
const resetSource = source<{}>();

const counter = state(0, ({ set, update }) => ({
  // method-based
  increment: () => update((v) => v + 1),
  // source-based (reset, is not exposed)
  reset: afterRecomputation(resetSource, (value) => set(0)),
}));
```

### Granular And Declarative State Management

Promotes creating **granular state** with declarative patterns, isolating each state for better maintainability and testability.

```typescript
const resetSource = source<{}>();

const search = state('', ({ set }) => ({
  // method-based
  set,
  // source-based (reset, is not exposed)
  reset: afterRecomputation(resetSource, (value) => set('')),
}));

const page = state(1, ({ set, update }) => ({
  // method-based
  increment: () => update((v) => v + 1),
  // source-based (reset, is not exposed)
  reset: afterRecomputation(resetSource, (value) => set(1)),
}));
```

When `resetSource.set({})` is called, `search` will be reset to `''` and `page`to `1`.

[afterRecomputation](/utils/after-recomputation) - For more info.

### Store Composition

Create stores (global, local, or feature-level) designed for composition that integrate effortlessly:

- **Global stores** for application-wide state
- **Local stores** for component-specific state
- **Feature stores** for reusable pieces of logic

```typescript
// 👇 create a global store, that enable to fetch an user, mutate his email and optimize the UX by performing a type-safe optimistic update and a reload if an error occurred.
const { injectUserGlobalCraft } = craft(
  {
    name: 'userGlobal',
    providedIn: 'root',
  },
  craftMutations(() => ({
    userEmail: mutation({
      method: (payload: { id: string; email: string }) => payload,
      loader: async ({ params }) => {
        const response = await fetch('/api/users', {
          method: 'POST',
          body: JSON.stringify(params),
        });
        return response.json() as User;
      },
    }),
  })),
  craftQuery('user', ({ userEmail }) =>
    query(
      {
        params: () => '5',
        loader: async ({ params }) => {
          const response = await fetch(`/api/users/${params}`);
          return response.json() as User;
        },
      },
      insertReactOnMutation(userEmail, {
        optimisticUpdate: ({ queryResource, mutationParams }) => {
          return {
            ...queryResource.value(),
            email: mutationParams.email,
          };
        },
        reload: {
          onMutationError: true,
        },
      }),
    ),
  ),
);
```

Bind shared store inputs and methods to the host states and sources.

> Here a common example of a feature store that manage user posts with pagination and filtering capabilities, resetting filters and pagination when needed, and displaying post details when a post is selected.

```typescript
const { craftPaginationFeature } = craft(
  {
    name: 'pagination',
    providedIn: 'feature',
  },
  craftQueryParams(() => ({
    pagination: queryParam(
      {
        state: {
          page: {
            fallbackValue: 1,
            parse: (value: string) => parseInt(value, 10),
            serialize: (value: unknown) => String(value),
          },
          pageSize: {
            fallbackValue: 10,
            parse: (value: string) => parseInt(value, 10),
            serialize: (value: unknown) => String(value),
          },
        },
      },
      ({ set, reset }) => ({ set, reset }),
    ),
  })),
);

const { craftPostDetailsFeature } = craft(
  {
    name: 'postDetails',
    providedIn: 'feature',
  },
  craftInputs({
    postId: undefined as string | undefined,
    userId: undefined as string | undefined,
  }),
  craftQuery('post', ({ userId, postId }) =>
    query({
      params: () => ({
        userId: userId(),
        postId: postId(),
      }),
      loader: async ({ params: { userId, postId } }) => {
        const response = await fetch(`/api/users/${userId}/posts/${postId}`);
        return response.json();
      },
    }),
  ),
);

const { injectUserPostsCraft } = craft(
  {
    name: 'userPosts',
    providedIn: 'root',
  },
  craftInputs({
    userId: undefined as string | undefined,
  }),
  craftSources({
    resetFilters: source<{}>(),
  }),
  craftPaginationFeature(({ reset }) => ({
    methods: {
      // bind pagination reset to the resetFilters source
      reset: resetFilters,
    },
  })),
  craftQueryParams(({ reset }) => ({
    postCategory: queryParam(
      {
        state: {
          categoryName: {
            fallbackValue: '',
            parse: (value: string) => value,
            serialize: (value: unknown) => value,
          },
        },
      },
      ({ set, reset }) => ({
        set,
        reset: afterRecomputation(resetFilters, () => reset()),
      }),
    ),
  })),
  craftQuery('posts', ({ userId, pagination, postCategory }) =>
    query({
      params: () => ({
        pagination: pagination(),
        userId: userId(),
        postCategory: postCategory(),
      }),
      loader: async ({
        params: {
          userId,
          pagination: { page, pageSize },
          postCategory: { categoryName },
        },
      }) => {
        const response = await fetch(
          `/api/users/${userId}/posts?page=${page}&size=${pageSize}&category=${categoryName}`,
        );
        return response.json();
      },
    }),
  ),
  craftState('selectedPostId', ({ resetFilters }) =>
    state(undefined as string | undefined, ({ set }) => ({
      set,
      reset: afterRecomputation(resetFilters, () => set(undefined)),
    })),
  ),
  craftPostDetailsFeature(({ userId, selectedPostId }) => ({
    inputs: {
      userId: input.required<string>(),
      postId: selectedPostId,
    },
  })),
);

// In a component:
@Component()
class UserPostsComponent {
  readonly userId = input.required<string>();

  readonly store = injectUserPostsCraft({
    input: {
      // bind the store inputs to component signal variable
      userId: this.userId,
    },
  });
}
```

### 100% type-safe - Maximum TypeScript Inference

Utilizes TypeScript inference to the maximum, limiting types you need to declare and avoiding human errors.

### Frictionless Developer Experience

Designed for a **smooth developer experience** with:

- Declarative state creation
- Evolutionary store composition
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
  asyncMethod,
  queryParam,
  query,
  mutation,
  craft,
  // ... and more
} from '@ngcraft/core';
```

## Next Steps

Ready to dive in? Start with:

- [Primitives](/primitives/state) - Learn the building blocks
- [Store](/store/craft) - Create composable stores
- [Examples](/examples) - See it in action

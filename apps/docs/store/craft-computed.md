# craftComputedStates

Create computed signals derived from craft store entries.

## Import

```typescript
import { craft, craftComputedStates } from '@ngcraft/core';
import { computed } from '@angular/core';
```

## Basic Pattern

```typescript
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftState('count', () => state(0)),
  craftComputedStates(({ count }) => ({
    doubled: computed(() => count() * 2),
    isEven: computed(() => count() % 2 === 0),
    message: computed(() => `Count is ${count()}`),
  })),
);

const store = injectCraft();

console.log(store.doubled()); // 0
console.log(store.isEven()); // true
console.log(store.message()); // 'Count is 0'
```

## From Query Results

```typescript
type Todo = { id: string; text: string; done: boolean };

const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftQuery('todos', () =>
    query({
      params: () => ({}),
      loader: async () => {
        const response = await fetch('/api/todos');
        return response.json() as Todo[];
      },
    }),
  ),
  craftComputedStates(({ todos }) => ({
    completedCount: computed(() => {
      const list = todos.value();
      return list?.filter((t) => t.done).length ?? 0;
    }),
    pendingCount: computed(() => {
      const list = todos.value();
      return list?.filter((t) => !t.done).length ?? 0;
    }),
    totalCount: computed(() => todos.value()?.length ?? 0),
    allCompleted: computed(() => {
      const list = todos.value();
      return list ? list.length > 0 && list.every((t) => t.done) : false;
    }),
  })),
);

const store = injectCraft();

// Use in template
// <div>{{ store.completedCount() }} / {{ store.totalCount() }} completed</div>
// <button [disabled]="store.allCompleted()">Complete All</button>
```

## Combining Multiple Queries

```typescript
type User = { id: string; name: string };
type Post = { id: string; userId: string; title: string };

const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftQuery('users', () =>
    query({
      params: () => ({}),
      loader: async () => {
        const response = await fetch('/api/users');
        return response.json() as User[];
      },
    }),
  ),
  craftQuery('posts', () =>
    query({
      params: () => ({}),
      loader: async () => {
        const response = await fetch('/api/posts');
        return response.json() as Post[];
      },
    }),
  ),
  craftComputedStates(({ users, posts }) => ({
    postsWithAuthors: computed(() => {
      const userList = users.value();
      const postList = posts.value();

      if (!userList || !postList) return [];

      return postList.map((post) => ({
        ...post,
        author: userList.find((u) => u.id === post.userId),
      }));
    }),
    userPostCount: computed(() => {
      const postList = posts.value();
      if (!postList) return new Map();

      return postList.reduce((map, post) => {
        map.set(post.userId, (map.get(post.userId) ?? 0) + 1);
        return map;
      }, new Map<string, number>());
    }),
  })),
);

const store = injectCraft();

// Automatically combines data from both queries
const enrichedPosts = store.postsWithAuthors();
const postCounts = store.userPostCount();
```

## From States

```typescript
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftState('items', () => state([] as CartItem[])),
  craftComputedStates(({ items }) => ({
    itemCount: computed(() => items().length),
    subtotal: computed(() =>
      items().reduce((sum, item) => sum + item.price * item.quantity, 0),
    ),
    tax: computed(() => {
      const subtotal = items().reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
      );
      return subtotal * 0.1;
    }),
    total: computed(() => {
      const subtotal = items().reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
      );
      return subtotal * 1.1;
    }),
  })),
);

const store = injectCraft();

console.log(store.itemCount()); // 0
console.log(store.total()); // 0
```

## Key Features

- **Automatic updates**: Computed signals update when dependencies change
- **Memoization**: Values are cached and only recompute when needed
- **Type safety**: Full TypeScript support for computed values
- **Direct access**: No prefix, access as `store.computedName()`
- **Performance**: Efficient for expensive calculations

## See Also

- [craftState](/store/craft-state) - Create base states
- [craftQuery](/store/craft-query) - Query data to compute from
- [craft](/store/craft) - Base store creation

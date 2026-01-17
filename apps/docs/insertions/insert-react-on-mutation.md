# insertReactOnMutation

The `insertReactOnMutation` insertion allows state to automatically react to mutations, enabling powerful patterns like cache invalidation, optimistic updates, and side effects.

## Import

```typescript
import { insertReactOnMutation } from '@ngcraft/core';
```

## Basic Usage

```typescript
import { Component } from '@angular/core';
import { state, mutation, insertReactOnMutation } from '@ngcraft/core';

@Component({
  selector: 'app-user-list',
  template: `
    <div>
      <ul>
        @for (user of users(); track user.id) {
          <li>{{ user.name }}</li>
        }
      </ul>
      <p>Count: {{ users().length }}</p>
    </div>
  `,
})
export class UserListComponent {
  addUser = mutation(async (user: User) => {
    const response = await fetch('/api/users', {
      method: 'POST',
      body: JSON.stringify(user),
    });
    return response.json();
  });

  // Automatically update list when user is added
  users = state<User[]>([], {
    insertions: [
      insertReactOnMutation(this.addUser, (currentUsers, newUser) => {
        return [...currentUsers, newUser];
      }),
    ],
  });
}
```

## API

### Basic Reaction

```typescript
const myMutation = mutation(mutationFn);

const myState = state(initialValue, {
  insertions: [
    insertReactOnMutation(myMutation, (currentState, mutationResult) => {
      // Return new state based on mutation result
      return updatedState;
    }),
  ],
});
```

### Multiple Mutations

```typescript
const addItem = mutation(addItemFn);
const removeItem = mutation(removeItemFn);

const items = state<Item[]>([], {
  insertions: [
    insertReactOnMutation(addItem, (items, newItem) => [...items, newItem]),
    insertReactOnMutation(removeItem, (items, removedId) =>
      items.filter((item) => item.id !== removedId),
    ),
  ],
});
```

## Advanced Usage

### Cache Invalidation

```typescript
@Component({
  selector: 'app-todos',
  template: `
    <div>
      <ul>
        @for (todo of todos(); track todo.id) {
          <li>
            {{ todo.title }}
            <button (click)="deleteTodo.mutate(todo.id)">Delete</button>
          </li>
        }
      </ul>
      @if (needsRefresh()) {
        <p>Data updated, refetching...</p>
      }
    </div>
  `,
})
export class TodosComponent {
  deleteTodo = mutation(async (id: number) => {
    await fetch(`/api/todos/${id}`, { method: 'DELETE' });
    return id;
  });

  needsRefresh = state(false, {
    insertions: [insertReactOnMutation(this.deleteTodo, () => true)],
  });

  todos = state<Todo[]>([], {
    insertions: [
      insertReactOnMutation(this.deleteTodo, (todos, deletedId) => {
        // Remove deleted todo from cache
        return todos.filter((todo) => todo.id !== deletedId);
      }),
    ],
  });
}
```

### Optimistic Updates

```typescript
@Component({
  selector: 'app-post-likes',
  template: `
    <div>
      <button (click)="toggleLike.mutate(post.id)">
        {{ isLiked() ? '❤️ Unlike' : '🤍 Like' }}
      </button>
      <span>{{ likeCount() }} likes</span>
      @if (toggleLike.loading()) {
        <span class="spinner">⏳</span>
      }
    </div>
  `,
})
export class PostLikesComponent {
  @Input() post!: Post;

  toggleLike = mutation(async (postId: number) => {
    const response = await fetch(`/api/posts/${postId}/like`, {
      method: 'POST',
    });
    return response.json();
  });

  isLiked = state(false, {
    insertions: [insertReactOnMutation(this.toggleLike, (current) => !current)],
  });

  likeCount = state(0, {
    insertions: [
      insertReactOnMutation(this.toggleLike, (count, result) => {
        return result.liked ? count + 1 : count - 1;
      }),
    ],
  });
}
```

### Cascade Updates

```typescript
@Component({
  selector: 'app-cart',
  template: `
    <div>
      <div>Items: {{ itemCount() }}</div>
      <div>Total: ${{ total() }}</div>
      <div>Tax: ${{ tax() }}</div>
      <div>Grand Total: ${{ grandTotal() }}</div>
    </div>
  `,
})
export class CartComponent {
  addToCart = mutation(addToCartFn);
  removeFromCart = mutation(removeFromCartFn);

  items = state<CartItem[]>([], {
    insertions: [
      insertReactOnMutation(this.addToCart, (items, newItem) =>
        [...items, newItem]
      ),
      insertReactOnMutation(this.removeFromCart, (items, removedId) =>
        items.filter(item => item.id !== removedId)
      ),
    ]
  });

  itemCount = computed(() => this.items().length);

  total = computed(() =>
    this.items().reduce((sum, item) => sum + item.price * item.quantity, 0)
  );

  tax = computed(() => this.total() * 0.1);

  grandTotal = computed(() => this.total() + this.tax());
}
```

### Conditional Reactions

```typescript
const updateUser = mutation(updateUserFn);

const users = state<User[]>([], {
  insertions: [
    insertReactOnMutation(updateUser, (users, updatedUser) => {
      // Only update if user exists in list
      const exists = users.some((u) => u.id === updatedUser.id);
      if (!exists) return users;

      return users.map((user) =>
        user.id === updatedUser.id ? updatedUser : user,
      );
    }),
  ],
});
```

### Side Effects

```typescript
@Component({
  selector: 'app-notification-center',
  template: `
    <div>
      @for (notification of notifications(); track notification.id) {
        <div class="notification">{{ notification.message }}</div>
      }
    </div>
  `,
})
export class NotificationCenterComponent {
  saveData = mutation(saveDataFn);
  deleteData = mutation(deleteDataFn);

  notifications = state<Notification[]>([], {
    insertions: [
      insertReactOnMutation(this.saveData, (notifications) => {
        const newNotification = {
          id: Date.now(),
          message: 'Data saved successfully!',
        };
        return [...notifications, newNotification];
      }),
      insertReactOnMutation(this.deleteData, (notifications) => {
        const newNotification = {
          id: Date.now(),
          message: 'Data deleted successfully!',
        };
        return [...notifications, newNotification];
      }),
    ],
  });
}
```

### Aggregate from Multiple Mutations

```typescript
@Component({
  selector: 'app-activity-log',
  template: `
    <div>
      <h3>Recent Activity</h3>
      @for (activity of activityLog(); track activity.id) {
        <div>{{ activity.timestamp }}: {{ activity.action }}</div>
      }
    </div>
  `,
})
export class ActivityLogComponent {
  createPost = mutation(createPostFn);
  updatePost = mutation(updatePostFn);
  deletePost = mutation(deletePostFn);

  activityLog = state<Activity[]>([], {
    insertions: [
      insertReactOnMutation(this.createPost, (log, post) => [
        ...log,
        {
          id: Date.now(),
          action: `Created post: ${post.title}`,
          timestamp: new Date(),
        },
      ]),
      insertReactOnMutation(this.updatePost, (log, post) => [
        ...log,
        {
          id: Date.now(),
          action: `Updated post: ${post.title}`,
          timestamp: new Date(),
        },
      ]),
      insertReactOnMutation(this.deletePost, (log, id) => [
        ...log,
        {
          id: Date.now(),
          action: `Deleted post #${id}`,
          timestamp: new Date(),
        },
      ]),
    ],
  });
}
```

## Reaction Timing

Reactions occur when the mutation completes successfully:

```typescript
const myMutation = mutation(async (data) => {
  // 1. Mutation starts
  const result = await someAsyncOperation(data);
  // 2. Mutation completes
  return result;
});

const myState = state(initialValue, {
  insertions: [
    insertReactOnMutation(myMutation, (state, result) => {
      // 3. Reaction executes after successful completion
      return newState;
    }),
  ],
});

// Reactions do NOT execute on mutation error
```

## Best Practices

✅ **Keep reactions pure** - No side effects in reaction functions
✅ **Handle all mutation cases** - Consider success, error, loading
✅ **Use for cache updates** - Optimistic UI and cache synchronization
✅ **Combine with computed** - Derive state from reacted state
✅ **React to multiple mutations** - Comprehensive state updates
✅ **Return new state** - Immutable updates

## Common Patterns

### Undo/Redo Stack

```typescript
const updateData = mutation(updateDataFn);

const history = state<State[]>([initialState], {
  insertions: [
    insertReactOnMutation(updateData, (history, newState) => {
      return [...history, newState].slice(-10); // Keep last 10
    }),
  ],
});

const canUndo = computed(() => history().length > 1);
```

### Error Tracking

```typescript
const saveMutation = mutation(saveFn);

const errors = state<Error[]>([], {
  insertions: [
    insertReactOnMutation(saveMutation, (errors, result) => {
      // Only executed on success, use mutation.error() for errors
      return errors; // Clear errors on success
    }),
  ],
});
```

## See Also

- [mutation](/primitives/mutation) - Base mutation primitive
- [state](/primitives/state) - Base state primitive
- [insertLocalStorage](/insertions/insert-local-storage) - Persist state
- [Store](/store/craft) - Compose insertions in stores

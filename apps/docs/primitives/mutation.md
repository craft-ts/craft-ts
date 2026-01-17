# mutation

The `mutation` primitive handles server updates (POST, PUT, DELETE) with loading states and error handling.

## Import

```typescript
import { mutation } from '@ngcraft/core';
```

## Basic Examples

### Method-based mutation

```typescript
const createUser = mutation({
  method: (args: { name: string; email: string }) => ({ ...args }),
  loader: async ({ params }) => {
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return response.json();
  },
});

// Execute mutation
createUser.mutate({ name: 'John', email: 'john@example.com' });

// Access state
console.log(createUser.isLoading()); // true/false
console.log(createUser.error()); // Error or undefined
console.log(createUser.value()); // Created user data
```

### Source-based mutation (triggered by signal)

```typescript
const saveForm = signal<{ name: string } | null>(null);

const saveMutation = mutation({
  source: saveForm,
  loader: async ({ source }) => {
    if (!source) return;
    const response = await fetch('/api/save', {
      method: 'POST',
      body: JSON.stringify(source),
    });
    return response.json();
  },
});

// Trigger mutation by updating signal
saveForm.set({ name: 'Alice' });
```

## API

### Configuration

```typescript
mutation({
  // Option 1: Method-based (execute manually)
  method: (args: TArgs) => params,
  loader: async ({ params }) => {
    // Perform mutation
    return result;
  },

  // Option 2: Source-based (auto-execute on signal change)
  source: Signal<TSource>,
  loader: async ({ source }) => {
    // Perform mutation
    return result;
  },
});
```

### Mutation State

```typescript
const myMutation = mutation(config);

// State signals
myMutation.value(); // T | undefined
myMutation.isLoading(); // boolean
myMutation.error(); // Error | undefined
myMutation.status(); // 'idle' | 'loading' | 'resolved' | 'error'
```

### Methods

For method-based mutations:

```typescript
// Execute mutation
myMutation.mutate(args);
```

## Common Patterns

### Form submission with method

```typescript
const updateProfile = mutation({
  method: (profile: { name: string; bio: string }) => profile,
  loader: async ({ params }) => {
    const response = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return response.json();
  },
});

// In component
function handleSubmit(formData: { name: string; bio: string }) {
  updateProfile.mutate(formData);
}
```

### Auto-save with source

```typescript
const formData = signal({ name: '', email: '' });

const autoSave = mutation({
  source: formData,
  loader: async ({ source }) => {
    if (!source.name) return; // Skip if empty
    const response = await fetch('/api/autosave', {
      method: 'POST',
      body: JSON.stringify(source),
    });
    return response.json();
  },
});

// Triggers mutation automatically
formData.set({ name: 'John', email: 'john@example.com' });
```

### Delete operation

```typescript
const deleteUser = mutation({
  method: (userId: number) => ({ id: userId }),
  loader: async ({ params }) => {
    await fetch(`/api/users/${params.id}`, {
      method: 'DELETE',
    });
    return params.id;
  },
});

// Execute
deleteUser.mutate(123);
```

### With error handling

```typescript
const updateSettings = mutation({
  method: (settings: Settings) => settings,
  loader: async ({ params }) => {
    const response = await fetch('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      throw new Error('Failed to update settings');
    }
    return response.json();
  },
});

// In template
// @if (updateSettings.error()) {
//   <p class="error">{{ updateSettings.error()?.message }}</p>
// }
```

## Important Notes

⚠️ **Injection Context**: This function must be called within an injection context. If called outside, it will only return an object containing the configuration under `_config`.

⚠️ **Method vs Source**: Use `method` for manual execution (e.g., button clicks), use `source` for automatic execution (e.g., auto-save).

⚠️ **Error handling**: Always handle potential errors in your loader function.

## Best Practices

✅ **Use method for user-triggered actions** (form submit, delete)
✅ **Use source for reactive updates** (auto-save, filters)
✅ **Handle loading states** in your UI
✅ **Provide user feedback** on success/error
✅ **Type your mutation data** properly

## See Also

- [query](/primitives/query) - For data fetching
- [asyncMethod](/primitives/async-method) - For simple async operations
- [Store Mutation](/store/craft-mutation) - For store integration
  return { previousUsers };
  },
  onError: (error, userId, context) => {
  // Restore on error
  usersQuery.setData(context.previousUsers);
  },
  onSuccess: () => {
  usersQuery.invalidate();
  },
  },
  );

````

### Multiple Mutations

```typescript
@Component({
  selector: 'app-todo-item',
  template: `
    <div class="todo-item">
      <input
        type="checkbox"
        [checked]="todo.completed"
        (change)="toggleTodo.mutate({ ...todo, completed: !todo.completed })"
        [disabled]="toggleTodo.loading() || deleteTodo.loading()"
      />
      <span>{{ todo.title }}</span>
      <button
        (click)="deleteTodo.mutate(todo.id)"
        [disabled]="deleteTodo.loading() || toggleTodo.loading()"
      >
        {{ deleteTodo.loading() ? 'Deleting...' : 'Delete' }}
      </button>
    </div>
  `,
})
export class TodoItemComponent {
  @Input() todo!: Todo;

  todosQuery = query(['todos'], fetchTodos);

  toggleTodo = mutation(
    async (todo: Todo) => {
      const response = await fetch(`/api/todos/${todo.id}`, {
        method: 'PUT',
        body: JSON.stringify(todo),
      });
      return response.json();
    },
    {
      onSuccess: () => this.todosQuery.invalidate(),
    },
  );

  deleteTodo = mutation(
    async (id: number) => {
      await fetch(`/api/todos/${id}`, {
        method: 'DELETE',
      });
    },
    {
      onSuccess: () => this.todosQuery.invalidate(),
    },
  );
}
````

### Sequential Mutations

```typescript
const createPost = mutation(createPostFn);
const publishPost = mutation(publishPostFn);

async function createAndPublish(postData: PostData) {
  try {
    const newPost = await createPost.mutate(postData);
    await publishPost.mutate(newPost.id);
    console.log('Post created and published!');
  } catch (error) {
    console.error('Failed:', error);
  }
}
```

### Form with Mutation

```typescript
@Component({
  selector: 'app-post-editor',
  template: `
    <form [formGroup]="form" (submit)="handleSubmit()">
      <input formControlName="title" placeholder="Title" />
      <textarea formControlName="content" placeholder="Content"></textarea>

      @if (savePost.error()) {
        <div class="error">{{ savePost.error()?.message }}</div>
      }

      <button type="submit" [disabled]="form.invalid || savePost.loading()">
        {{ savePost.loading() ? 'Saving...' : 'Save Post' }}
      </button>
    </form>
  `,
})
export class PostEditorComponent {
  form = new FormGroup({
    title: new FormControl('', Validators.required),
    content: new FormControl('', Validators.required),
  });

  savePost = mutation(
    async (post: { title: string; content: string }) => {
      const response = await fetch('/api/posts', {
        method: 'POST',
        body: JSON.stringify(post),
      });
      return response.json();
    },
    {
      onSuccess: () => {
        this.form.reset();
        // Navigate to post list or show success message
      },
    },
  );

  handleSubmit() {
    if (this.form.valid) {
      this.savePost.mutate(this.form.value as any);
    }
  }
}
```

## Options

### onMutate

Called before mutation, useful for optimistic updates:

```typescript
const updateUser = mutation(updateUserFn, {
  onMutate: (variables) => {
    // Optimistic update logic
    const previous = currentData();
    updateCache(variables);
    return { previous };
  },
});
```

### onSuccess

Called on successful mutation:

```typescript
const createUser = mutation(createUserFn, {
  onSuccess: (data, variables) => {
    console.log('User created:', data);
    // Invalidate queries, show notification, etc.
  },
});
```

### onError

Called on mutation error:

```typescript
const updateUser = mutation(updateUserFn, {
  onError: (error, variables, context) => {
    console.error('Update failed:', error);
    // Rollback optimistic update
    if (context?.previous) {
      restoreData(context.previous);
    }
  },
});
```

### onSettled

Called after mutation (success or error):

```typescript
const saveData = mutation(saveDataFn, {
  onSettled: (data, error) => {
    // Always runs after mutation
    cleanup();
  },
});
```

## Best Practices

✅ **Implement optimistic updates** - Better perceived performance
✅ **Handle rollbacks** - Restore state on error
✅ **Invalidate related queries** - Keep data consistent
✅ **Show loading states** - Disable buttons during mutation
✅ **Display error messages** - Clear feedback for users
✅ **Use onMutate for context** - Store previous state for rollback
✅ **Reset after success** - Clean slate for next operation

## See Also

- [query](/primitives/query) - For data fetching
- [Insertions - React on Mutation](/insertions/insert-react-on-mutation) - Advanced reactions
- [Store Mutation](/store/craft-mutation) - For store integration

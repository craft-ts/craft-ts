# craft

Create composable stores by combining state, queries, mutations, and other craft utilities.

## Import

```typescript
import { craft } from '@ngcraft/core';
```

## Basic Pattern

```typescript
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftState('count', () => state(0)),
  craftComputedStates(({ count }) => ({
    doubled: computed(() => count() * 2),
    isEven: computed(() => count() % 2 === 0),
  })),
);

// In a component
@Component({
  selector: 'app-counter',
  template: `
    <div>
      <p>Count: {{ store.count() }}</p>
      <p>Doubled: {{ store.doubled() }}</p>
      <p>Is Even: {{ store.isEven() }}</p>
      <button (click)="store.countIncrement()">+</button>
      <button (click)="store.countDecrement()">-</button>
    </div>
  `,
})
export class CounterComponent {
  store = injectCraft();
}
```

## Store Configuration

```typescript
craft(
  {
    name: 'StoreName',        // Required: Store name
    providedIn: 'root',       // 'root' | 'feature'
    implements?: contract<T>() // Optional: Type contract
  },
  ...craftFactories           // Craft utilities
)
```

### Root vs Feature Stores

```typescript
// Root store - Single shared instance across app
const { injectUserCraft } = craft(
  { name: 'User', providedIn: 'root' },
  craftState('user', () => state(null as User | null)),
);

// Feature store - New instance for each injection context
const { injectFormCraft } = craft(
  { name: 'Form', providedIn: 'feature' },
  craftState('data', () => state({})),
);
```

## Complete Example

```typescript
type Todo = { id: string; text: string; done: boolean };

const { injectTodoCraft } = craft(
  { name: 'Todo', providedIn: 'root' },

  // Query todos from API
  craftQuery('todos', () =>
    query({
      params: () => ({}),
      loader: async () => {
        const response = await fetch('/api/todos');
        return response.json() as Todo[];
      },
    }),
  ),
  // Mutations for CRUD operations
  craftMutations(() => ({
    addTodo: mutation({
      method: (text: string) => text,
      loader: async ({ params }) => {
        const response = await fetch('/api/todos', {
          method: 'POST',
          body: JSON.stringify({ text, done: false }),
        });
        return response.json() as Todo;
      },
    }),
    toggleTodo: mutation({
      method: (id: string) => id,
      loader: async ({ params }) => {
        const response = await fetch(`/api/todos/${params}/toggle`, {
          method: 'PATCH',
        });
        return response.json() as Todo;
      },
    }),
    deleteTodo: mutation({
      method: (id: string) => id,
      loader: async ({ params }) => {
        await fetch(`/api/todos/${params}`, { method: 'DELETE' });
      },
    }),
  })),
  // Computed values
  craftComputedStates(({ todos }) => ({
    completedCount: computed(
      () => todos.value()?.filter((t) => t.done).length ?? 0,
    ),
    pendingCount: computed(
      () => todos.value()?.filter((t) => !t.done).length ?? 0,
    ),
  })),
);

// In a component
@Component({
  selector: 'app-todos',
  template: `
    @if (store.todos.value(); as todos) {
      <ul>
        @for (todo of todos; track todo.id) {
          <li>
            <input
              type="checkbox"
              [checked]="todo.done"
              (change)="store.toggleTodoMutate(todo.id)"
            />
            {{ todo.text }}
            <button (click)="store.deleteTodoMutate(todo.id)">Delete</button>
          </li>
        }
      </ul>
    }
    <div>
      Completed: {{ store.completedCount() }} / Pending:
      {{ store.pendingCount() }}
    </div>
    <input #input placeholder="New todo" />
    <button (click)="store.addTodoMutate(input.value); input.value = ''">
      Add
    </button>
  `,
})
export class TodosComponent {
  store = injectTodoCraft();
}
```

## Store Composition

Plug stores together to compose functionality.

### Plugging a Root Store

```typescript
// Reusable pagination store
const { craftPaginationData } = craft(
  { name: 'PaginationData', providedIn: 'feature' },
  craftState('page', () => state(1)),
  craftState('pageSize', () => state(10)),
);

// User store uses pagination
const { injectUserListCraft } = craft(
  { name: 'UserList', providedIn: 'root' },
  craftPaginationData(), // Plug the store
  craftQuery('users', ({ page, pageSize }) =>
    query({
      params: () => ({ page: page(), pageSize: pageSize() }),
      loader: async ({ params }) => {
        const response = await fetch(
          `/api/users?page=${params.page}&pageSize=${params.pageSize}`,
        );
        return response.json();
      },
    }),
  ),
);

const store = injectUserListCraft();
// Access: store.page(), store.pageSize(), store.users.value()
```

### Plugging a Feature Store

```typescript
// Feature store - new instance per injection
const { craftLocalFilter } = craft(
  { name: 'LocalFilter', providedIn: 'feature' },
  craftInputs({
    defaultValue: '' as string,
  }),
  craftState('filter', ({ defaultValue }) =>
    state(linkedSignal(() => defaultValue())),
  ),
);

// Use feature store in multiple contexts
const { injectProductsCraft } = craft(
  { name: 'Products', providedIn: 'root' },
  craftLocalFilter(({ filter }) => ({
    inputs: {
      defaultValue: computed(() => ''), // Provide input
    },
  })),
  craftQuery('products', ({ filter }) =>
    query({
      params: filter,
      loader: async ({ params }) => {
        const response = await fetch(`/api/products?filter=${params}`);
        return response.json();
      },
    }),
  ),
);

const { injectOrdersCraft } = craft(
  { name: 'Orders', providedIn: 'root' },
  craftLocalFilter(({ filter }) => ({
    inputs: {
      defaultValue: computed(() => 'pending'),
    },
  })),
  craftQuery('orders', ({ filter }) =>
    query({
      params: filter,
      loader: async ({ params }) => {
        const response = await fetch(`/api/orders?status=${params}`);
        return response.json();
      },
    }),
  ),
);
// Each gets its own filter instance with different defaults
```

### Connecting Methods

Override or extend plugged store methods.

```typescript
const { craftShared } = craft(
  { name: 'Shared', providedIn: 'root' },
  craftSources({
    reset: source<{}>(),
  }),
  craftState('data', ({ reset }) =>
    state([], ({ state, set }) => ({
      add: (item: any) => set([...state(), item]),
      reset: afterRecomputation(reset, () => set([])),
    })),
  ),
);

const { injectHostCraft } = craft(
  { name: 'Host', providedIn: 'root' },
  craftState('counter', () => state(0)),
  craftShared(({ dataReset }) => ({
    methods: {
      dataReset: () => {
        console.log('Custom reset logic');
        dataReset(); // Call original
      },
    },
  })),
);

const store = injectHostCraft();
store.dataReset(); // Logs then resets
```

## Type Contract

Enforce store shape with contracts.

```typescript
type UserStoreContract = {
  user: Signal<User | null>;
  userSetName: (name: string) => { name: string; id: number };
};

const { injectUserCraft } = craft(
  {
    name: 'User',
    providedIn: 'root',
    implements: contract<UserStoreContract>(), // Type enforcement
  },
  craftState('user', () =>
    state(null as User | null, ({ state, set }) => ({
      setName: (name: string) => {
        const current = state();
        if (!current) return { name, id: -1 };
        const updated = { ...current, name };
        set(updated);
        return updated;
      },
    })),
  ),
);
// TypeScript ensures store matches UserStoreContract
```

## Standalone Outputs

Craft utilities can export standalone functions.

```typescript
const { setPaginationQueryParams } = craft(
  { name: 'Pagination', providedIn: 'root' },
  craftQueryParam('pagination', () =>
    queryParam({
      state: {
        page: {
          fallbackValue: 1,
          parse: (value: string) => parseInt(value, 10),
          serialize: (value: unknown) => String(value),
        },
      },
    }),
  ),
);

// Use standalone without injecting store
setPaginationQueryParams({ page: 2 });
```

## Key Features

- **Composition**: Combine multiple craft utilities
- **Type safety**: Full TypeScript support
- **Scoping**: Root (singleton) or feature (multi-instance)
- **Store plugging**: Reuse stores within other stores
- **Method overriding**: Extend plugged store behavior
- **Contract enforcement**: Type-check store shape
- **Standalone exports**: Use utilities outside stores

## See Also

- [craftState](/store/craft-state) - Create reactive state
- [craftQuery](/store/craft-query) - Query data from APIs
- [craftMutations](/store/craft-mutations) - Mutate server state
- [craftAsyncMethods](/store/craft-async-methods) - Execute async operations
- [craftComputedStates](/store/craft-computed) - Derive computed values
- [craftInputs](/store/craft-inputs) - Dynamic parameter injection
- [craftInject](/store/craft-inject) - Inject Angular services
- [craftQueryParam](/store/craft-query-params) - Sync with URL params

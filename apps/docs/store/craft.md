# craft

Creates a type-safe, composable state management store with Angular dependency injection.

## Import

```typescript
import { craft } from '@craft-ng/core';
```

## Introduction

`craft` is the core function for building craft stores. It enables:

- **Type-safe composition**: Chain multiple craft utilities (craftState, craftQuery, craftMutation, etc.)
- **Dependency injection**: Choose between root-level or feature-level provision
- **Smart naming**: Auto-generates injection and composition functions based on store name
- **Store composition**: Connect stores together via craftX functions with input/method binding
- **Standalone methods**: Export methods that can be called outside injection context
- **Contract enforcement**: Optional type contracts for store implementation
- **Error detection**: Type-level errors for configuration mistakes

## Naming Convention

Based on the `options.name` parameter, craft automatically generates:

- **Injection function**: `inject{Name}Craft()` - Injects the store instance
- **Composition function**: `craft{Name}(config?)` - Composes this store into another
- **Injection token**: `{Name}Craft` - Angular injection token for the store
- **Metadata**: `_{UPPERCASE_NAME}_META_STORE_CONTEXT` - Type metadata for the store

### Naming Examples

| Name               | Injection Function            | Composition Function    |
| ------------------ | ----------------------------- | ----------------------- |
| `'counter'`        | `injectCounterCraft()`        | `craftCounter()`        |
| `'userAuth'`       | `injectUserAuthCraft()`       | `craftUserAuth()`       |
| `'dataPagination'` | `injectDataPaginationCraft()` | `craftDataPagination()` |

## ProvidedIn Strategy

The `providedIn` option controls how Angular provides the store:

### `'root'` (Global singleton)

- Single instance shared across the entire application
- Survives route changes and component destruction
- Ideal for: global state, authentication, app configuration
- When composed into other stores, the same instance is reused

### `'feature'` (Scoped instances)

- New instance created per injection context
- Does not survive outside its injection scope
- Ideal for: component-specific state, route-scoped data, isolated features
- When composed into other stores, each host gets its own instance

## Store Composition

Use the generated `craft{Name}()` function to compose one store into another:

- Access another store's state, methods, and capabilities
- Bind inputs from host store to composed store
- Connect host methods to composed store sources
- Unbound inputs/methods are automatically propagated to the host
- Type-safe with error detection for invalid bindings

## Injection with Input/Method Binding

The `inject{Name}Craft()` function accepts a configuration object to:

- **Bind inputs**: Pass signals or values to store inputs
- **Connect methods to sources**: Replace methods with source emissions
- Enable dynamic configuration at injection time
- Reduce boilerplate when the store is used

## Error Detection

The type system provides compile-time errors for:

- **`errorMethodMsg`**: When connecting methods that don't exist in the composed store
- **`errorInputsMsg`**: When binding inputs that aren't defined in the composed store
- **Contract violations**: When the store doesn't satisfy its `implements` contract
- These errors appear as properties on the configuration object with descriptive messages

## Standalone Methods

Craft utilities (craftSources, craftMutations, etc.) can expose standalone methods:

- These are returned directly from `craft()` and can be destructured
- Can be called outside Angular's injection context
- Useful for event handlers, callbacks, external integrations
- Examples: `setReset()`, `setPaginationQueryParams()`

## Signature

```ts
function craft<Context, StoreConfig, ProvidedIn, Name, ToImplementContract>(
  options: {
    name: string;
    providedIn: 'root' | 'feature';
    implements?: Contract<ToImplementContract>;
  },
  ...factories: CraftFactory[]
): CraftResult;
```

## Parameters

### `options`

Store configuration object:

- **`name`**: Store name (camelCase recommended). Used to generate function names.
- **`providedIn`**: Angular injection scope. `'root'` for global singleton, `'feature'` for scoped instances.
- **`implements`**: Optional contract type. Use `contract<YourType>()` to enforce implementation.

### `factories`

Variable number of craft utility functions (craftState, craftQuery, craftSources, etc.). Each factory receives the accumulated context from previous factories.

## Return Value

An object containing:

- **`inject{Name}Craft`**: Function to inject the store with optional input/method binding
- **`craft{Name}`**: Function to compose this store into another store
- **`{Name}Craft`**: Angular injection token for manual injection
- **`_{UPPERCASE_NAME}_META_STORE_CONTEXT`**: Type metadata (for advanced use cases)
- **Standalone methods**: Any standalone outputs from craft utilities (e.g., `setReset()`)

## Examples

### Basic counter store with sources and state

```ts
const { injectCounterCraft, setIncrement, setDecrement, setReset } = craft(
  { name: 'counter', providedIn: 'root' },
  craftSources({
    increment: source$<void>(),
    decrement: source$<void>(),
    reset: source$<void>(),
  }),
  craftState('count', ({ increment, decrement, reset }) =>
    state(0, ({ state, set }) => ({
      increment: on$(increment, () => set(state() + 1)),
      decrement: on$(decrement, () => set(state() - 1)),
      reset: on$(reset, () => set(0)),
    })),
  ),
);

// In a component
const store = injectCounterCraft();
console.log(store.count()); // 0
store.setIncrement(); // count: 1
// wait another cycle
store.setDecrement(); // count: 0
// wait another cycle
store.setReset(); // count: 0

// Standalone methods work outside injection context
document.addEventListener('click', () => {
  setIncrement(); // Works!
});
```

### Store with inputs for dynamic configuration

```ts
const { injectTimerCraft } = craft(
  { name: 'timer', providedIn: 'feature' }, // Feature-scoped
  craftInputs({
    initialValue: undefined as number | undefined,
    step: undefined as number | undefined,
  }),
  craftSources({
    tick: source$<void>(),
  }),
  craftState('time', ({ initialValue, step, tick }) =>
    state(
      linkedSignal(() => initialValue() ?? 0),
      ({ state, set }) => ({
        tick: on$(tick, () => {
          set(state() + (step() ?? 1));
        }),
      }),
    ),
  ),
);

// Inject with input binding
const timer1 = injectTimerCraft({
  inputs: {
    initialValue: signal(100),
    step: signal(5),
  },
});

const timer2 = injectTimerCraft({
  inputs: {
    initialValue: signal(0),
    step: signal(1),
  },
});

// Each instance is independent (feature-scoped)
timer1.time(); // 100
timer2.time(); // 0
```

### Store composition with root-level singleton

```ts
// Global authentication store
const { craftAuth } = craft(
  { name: 'auth', providedIn: 'root' }, // Global singleton
  craftState('user', () =>
    state({ id: null, name: '' }, ({ set }) => ({
      login: (user: { id: number; name: string }) => set(user),
      logout: () => set({ id: null, name: '' }),
    })),
  ),
);

// Dashboard store uses auth
const { injectDashboardCraft } = craft(
  { name: 'dashboard', providedIn: 'root' },
  craftAuth(), // No config needed, uses shared instance
  craftState('dashboardData', ({ user }) =>
    state(
      linkedSignal(() => `Dashboard for ${user().name}`),
      () => ({}),
    ),
  ),
);

// Profile store also uses auth
const { injectProfileCraft } = craft(
  { name: 'profile', providedIn: 'root' },
  craftAuth(), // Same auth instance
  craftState('profileData', ({ user }) =>
    state(
      linkedSignal(() => `Profile: ${user().name}`),
      () => ({}),
    ),
  ),
);

// Both stores share the same auth instance
const dashboard = injectDashboardCraft();
const profile = injectProfileCraft();

dashboard.userLogin({ id: 1, name: 'Alice' });
console.log(dashboard.user().name); // 'Alice'
console.log(profile.user().name); // 'Alice' (same instance!)
```

### Store composition with feature-level scoping

```ts
// Reusable pagination store
const { craftPagination } = craft(
  { name: 'pagination', providedIn: 'feature' }, // Scoped instance
  craftInputs({
    pageSize: undefined as number | undefined,
  }),
  craftState('page', ({ pageSize }) =>
    state(
      { current: 1, size: linkedSignal(() => pageSize() ?? 10) },
      ({ state, set }) => ({
        nextPage: () => set({ ...state(), current: state().current + 1 }),
        prevPage: () => set({ ...state(), current: state().current - 1 }),
      }),
    ),
  ),
);

// Users table with pagination
const { injectUsersTableCraft } = craft(
  { name: 'usersTable', providedIn: 'root' },
  craftPagination(() => ({
    inputs: { pageSize: signal(20) },
  })),
  craftState('users', () => state([], () => ({}))),
);

// Products table with pagination
const { injectProductsTableCraft } = craft(
  { name: 'productsTable', providedIn: 'root' },
  craftPagination(() => ({
    inputs: { pageSize: signal(50) },
  })),
  craftState('products', () => state([], () => ({}))),
);

// Each table has its own pagination instance
const usersTable = injectUsersTableCraft();
const productsTable = injectProductsTableCraft();

usersTable.page().size; // 20
productsTable.page().size; // 50
usersTable.pageNextPage();
usersTable.page().current; // 2
productsTable.page().current; // 1 (independent!)
```

### Binding methods to sources during composition

```ts
const { craftLogger } = craft(
  { name: 'logger', providedIn: 'root' },
  craftSources({
    log: source$<string>(),
  }),
  craftState('logs', ({ log }) =>
    state([] as string[], ({ state, set }) => ({
      addLog: on$(log, (message) => {
        set([...state(), message]);
      }),
      clear: () => set([]),
    })),
  ),
);

const { injectAppCraft } = craft(
  { name: 'app', providedIn: 'root' },
  craftSources({
    appError: source$<string>(),
  }),
  craftState('errorCount', ({ appError }) =>
    state(0, ({ state, set }) => ({
      onError: on$(appError, () => set(state() + 1)),
    })),
  ),
  // Connect appError source to logger's clear method
  craftLogger(({ appError }) => ({
    methods: {
      logsClear: appError, // When appError emits, call logsClear
    },
  })),
);

const app = injectAppCraft();
app.setLog('User logged in');
app.logs().length; // 1

app.setAppError('Something went wrong');
// -> errorCount incremented
// -> logs cleared (logsClear called via appError)
app.logs().length; // 0
app.errorCount(); // 1
```

### Input/method binding with EXTERNALLY_PROVIDED

```ts
const { craftTheme } = craft(
  { name: 'theme', providedIn: 'root' },
  craftInputs({
    initialTheme: undefined as 'light' | 'dark' | undefined,
  }),
  craftState('theme', ({ initialTheme }) =>
    state(
      linkedSignal(() => initialTheme() ?? 'light'),
      ({ set }) => ({
        setTheme: (theme: 'light' | 'dark') => set(theme),
      }),
    ),
  ),
);

// Host store binds the input
const { injectAppCraft } = craft(
  { name: 'app', providedIn: 'root' },
  craftState('appTheme', () => state('dark' as 'light' | 'dark', () => ({}))),
  craftTheme(({ appTheme }) => ({
    inputs: {
      initialTheme: appTheme, // Bind input
    },
  })),
);

// Another host provides the input externally
const { craftOtherApp } = craft(
  { name: 'otherApp', providedIn: 'root' },
  // Input is not bound here, marked as EXTERNALLY_PROVIDED
  craftTheme(() => ({
    inputs: {
      initialTheme: 'EXTERNALLY_PROVIDED',
    },
  })),
);

// When composing otherApp, initialTheme must be provided
const { injectFinalCraft } = craft(
  { name: 'final', providedIn: 'root' },
  craftOtherApp(() => ({
    inputs: {
      initialTheme: signal('light'), // Must provide this
    },
  })),
);
```

### Query and mutation with automatic reactivity

```ts
const { injectTodosCraft } = craft(
  { name: 'todos', providedIn: 'root' },
  craftQuery('todoList', () =>
    query({
      params: () => ({}),
      loader: async () => {
        const response = await fetch('/api/todos');
        return response.json();
      },
    }),
  ),
  craftMutations(() => ({
    addTodo: mutation({
      method: (text: string) => ({ text }),
      loader: async ({ params }) => {
        const response = await fetch('/api/todos', {
          method: 'POST',
          body: JSON.stringify(params),
        });
        return response.json();
      },
      onSuccess: ({ helpers }) => {
        // Invalidate query on success
        helpers.invalidateQueries(['todoList']);
      },
    }),
  })),
);

const todos = injectTodosCraft();
todos.mutateAddTodo('Buy milk'); // Mutation
// -> todoList query auto-refreshes after mutation succeeds
```

### Query params for URL synchronization

```ts
const { injectSearchCraft, setSearchQueryParams } = craft(
  { name: 'search', providedIn: 'root' },
  craftQueryParam('search', () =>
    queryParam({
      state: {
        query: {
          fallbackValue: '',
          parse: (value) => value,
          serialize: (value) => value,
        },
        page: {
          fallbackValue: 1,
          parse: (value) => parseInt(value, 10),
          serialize: (value) => String(value),
        },
      },
    }),
  ),
  craftQuery('results', ({ searchQuery, searchPage }) =>
    query({
      params: linkedSignal(() => ({
        q: searchQuery(),
        page: searchPage(),
      })),
      loader: async ({ params }) => {
        const response = await fetch(
          `/api/search?q=${params.q}&page=${params.page}`,
        );
        return response.json();
      },
    }),
  ),
);

const search = injectSearchCraft();

// Change query params (syncs to URL)
setSearchQueryParams({ query: 'angular', page: 2 });
// -> URL updates to ?query=angular&page=2
// -> results query auto-refreshes with new params
```

### Async methods for side effects

```ts
const { injectNotificationsCraft } = craft(
  { name: 'notifications', providedIn: 'root' },
  craftState('messages', () =>
    state([] as string[], ({ state, set }) => ({
      addMessage: (msg: string) => set([...state(), msg]),
      clear: () => set([]),
    })),
  ),
  craftAsyncProcesses(() => ({
    showNotification: asyncProcess({
      method: (message: string, duration: number) => ({ message, duration }),
      loader: async ({ params, helpers }) => {
        helpers.methods.messagesAddMessage(params.message);
        await new Promise((resolve) => setTimeout(resolve, params.duration));
        // Auto-remove after duration
        const current = helpers.props.messages();
        helpers.methods.messagesClear();
        return 'done';
      },
    }),
  })),
);

const notifications = injectNotificationsCraft();
notifications.showNotificationExecute('Hello!', 3000);
// Message appears, then disappears after 3 seconds
```

### Contract enforcement for type safety

```ts
type CounterContract = {
  count: Signal<number>;
  increment: () => void;
  decrement: () => void;
};

// This store satisfies the contract
const { injectCounterCraft } = craft(
  {
    name: 'counter',
    providedIn: 'root',
    implements: contract<CounterContract>(),
  },
  craftState('count', () =>
    state(0, ({ state, set }) => ({
      increment: () => set(state() + 1),
      decrement: () => set(state() - 1),
    })),
  ),
);

// This would cause a type error (missing decrement)
const { injectBadCounterCraft } = craft(
  {
    name: 'badCounter',
    providedIn: 'root',
    implements: contract<CounterContract>(), // Error!
  },
  craftState('count', () =>
    state(0, ({ state, set }) => ({
      increment: () => set(state() + 1),
      // Missing decrement!
    })),
  ),
);
```

### Error detection for invalid composition

```ts
const { craftLogger } = craft(
  { name: 'logger', providedIn: 'root' },
  craftState('logs', () =>
    state([] as string[], ({ set }) => ({
      clear: () => set([]),
    })),
  ),
);

const { injectAppCraft } = craft(
  { name: 'app', providedIn: 'root' },
  craftLogger(() => ({
    methods: {
      logsClear: signal<void>(), // OK
      logsInvalidMethod: signal<void>(), // Erreur de type !
      // errorMethodMsg: "Error: You are trying to add methods that are not
      // defined in the connected store (logger): logsInvalidMethod"
    },
    inputs: {
      nonExistentInput: signal(5), // Erreur de type !
      // errorInputsMsg: "Error: You are trying to add inputs that are not
      // defined in the connected store (logger): nonExistentInput"
    },
  })),
);
```

### Complex multi-store composition

```ts
// Shared auth store
const { craftAuth } = craft(
  { name: 'auth', providedIn: 'root' },
  craftState('user', () =>
    state({ id: null, role: 'guest' }, ({ set }) => ({
      login: (user: { id: number; role: string }) => set(user),
      logout: () => set({ id: null, role: 'guest' }),
    })),
  ),
);

// Pagination feature
const { craftPagination } = craft(
  { name: 'pagination', providedIn: 'feature' },
  craftInputs({ pageSize: undefined as number | undefined }),
  craftState('page', ({ pageSize }) =>
    state({ current: 1, size: pageSize() ?? 10 }, ({ state, set }) => ({
      next: () => set({ ...state(), current: state().current + 1 }),
      prev: () => set({ ...state(), current: state().current - 1 }),
    })),
  ),
);

// Admin panel combines both
const { injectAdminPanelCraft } = craft(
  { name: 'adminPanel', providedIn: 'root' },
  craftAuth(), // Shared auth
  craftPagination(({ user }) => ({
    // Feature pagination with dynamic pageSize based on role
    inputs: {
      pageSize: linkedSignal(() => (user().role === 'admin' ? 100 : 20)),
    },
  })),
  craftQuery('adminData', ({ user, page }) =>
    query({
      params: linkedSignal(() => ({
        userId: user().id,
        page: page().current,
      })),
      loader: async ({ params }) => {
        // Fetch data...
      },
    }),
  ),
);

const admin = injectAdminPanelCraft();
admin.userLogin({ id: 1, role: 'admin' });
admin.page().size; // 100 (admin gets larger page size)
admin.pageNext();
// -> adminData query refreshes automatically
```

## See Also

- [craftState](./craft-state.md)
- [craftSources](./craft-sources.md)
- [craftInputs](./craft-inputs.md)
- [craftComputedStates](./craft-computed.md)
- [craftAsyncProcesses](./craft-async-processes.md)
- [craftQuery](./craft-query.md)
- [craftQueryParam](./craft-query-param.md)
- [craftQueryParams](./craft-query-params.md)
- [craftMutations](./craft-mutation.md)
- [craftSetAllQueriesParamsStandalone](./craft-set-all-queries-params-standalone.md)
- [craftInject](./craft-inject.md)

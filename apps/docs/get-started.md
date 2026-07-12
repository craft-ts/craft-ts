# Get Started

## Installation

### Using npm

```shell
npm i @craft-ng/core@latest @craft-ng/dev-tools@latest
```

:::warning
The current documentation is also experimental. It takes a lot of time to create it, and AI is not always helpful. I will improve it over time. And some examples are not always pertinent.
:::

## Quick Start

::: info
Optional: Check [Setup type-safe DI, routing and testing](./type-safe-di-routes/setup.md) for more details.
:::

### Creating a state

The `state` primitive creates a reactive Signal-based state. It's the simplest primitive to get started with reactive state management in Angular.

```typescript
import { Component } from '@angular/core';
import { state } from '@craft-ng/core';

@Component({
  selector: 'app-counter',
  template: `
    <div>
      <p>Count: {{ counter() }}</p>
    </div>
  `,
})
export class CounterComponent {
  counter = state(0);
}
```

:::info Other primitives
`state` is one of several primitives available in @craft-ng/core. You can also explore:

- `query` - For managing async data fetching
- `mutation` - For handling async operations with state
- `queryParam` - For syncing state with URL parameters
- `asyncProcess` - For managing async operations
  :::

### Adding methods and computed properties

You can add methods and computed properties to your state using a second insertion function:

```typescript
@Component({
  selector: 'app-counter',
  template: `
    <div>
      <p>Count: {{ counter() }}</p>
      <p>Is Even: {{ counter.isEven() }}</p>
      <p>Double: {{ counter.double() }}</p>
      <p>Is Positive: {{ counter.isPositive() }}</p>
      <button (click)="counter.increment()">Increment</button>
      <button (click)="counter.decrement()">Decrement</button>
    </div>
  `,
})
export class CounterComponent {
  counter = state(
    0,
    // insertPipe composes multiple insertions, so you can organize your logic as you want
    (context) =>
      insertPipe(
        context,
        ({ update, state }) => ({
          // methods
          increment: () => update((current) => current + 1),
          decrement: () => update((current) => current - 1),
          // computed properties
          isEven: computed(() => state() % 2 === 0),
          double: computed(() => state() * 2),
        }),
        ({ state }) => ({
          isPositive: computed(() => state() > 0),
        }),
      ),
  );
}
```

### Extract reusable logic with craftService

For logic that should live outside a single component, wrap your primitives in a named service with `craftService`:

```typescript
interface Todo {
  id: string;
  title: string;
  completed: boolean;
}

const { injectTodos } = craftService({ name: 'Todos', scope: 'global' }, () =>
  state([] as Todo[], ({ state, set }) => ({
    add: (title: string) => {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        return;
      }

      set([
        ...state(),
        {
          id: crypto.randomUUID(),
          title: trimmedTitle,
          completed: false,
        },
      ]);
    },
    toggle: (id: string) => {
      set(
        state().map((todo) =>
          todo.id === id ? { ...todo, completed: !todo.completed } : todo,
        ),
      );
    },
    remove: (id: string) => set(state().filter((todo) => todo.id !== id)),
    total: computed(() => state().length),
    remaining: computed(() => state().filter((todo) => !todo.completed).length),
  })),
);

@Component({
  selector: 'app-todos',
  standalone: true,
  template: `
    <div>
      <h2>Todos ({{ store.total() }})</h2>
      <input
        #input
        type="text"
        (keyup.enter)="todos.add(input.value); input.value = ''"
      />

      <ul>
        @for (todo of todos.items(); track todo.id) {
          <li>
            <input
              type="checkbox"
              [checked]="todo.completed"
              (change)="todos.toggle(todo.id)"
            />
            {{ todo.title }}
            <button (click)="todos.remove(todo.id)">Delete</button>
          </li>
        }
      </ul>

      <p>Remaining: {{ todos.remaining() }}</p>
    </div>
  `,
})
export class TodosComponent {
  readonly todos = injectTodos();
}
```

## Yield to inject dependencies

If your service depends on other services, use `yield` to inject them:

```typescript
const { UserApiToYield } = craftService(
  { name: 'UserApi', scope: 'function' },
  function* (userId: string) {
    return yield* CraftHttpClient.get(({ response }) => ({
      url: `users/${userId}`,
      success: response<User>(),
    }));
  },
);

class UsersComponent {
  public readonly userId = input.required<string>();
  protected readonly users = query({
    params: this.userId,
    loader: function* () {
      return yield* UserApiToYield(this.userId());
    },
  });
}
```

## Next Steps

- Explore the [Introduction](/introduction) to understand the core concepts
- Learn about [Primitives](/primitives/state) to build reactive state
- Discover [craftService](/store/craft-service) patterns to extract logic from components and services
- Use [toCraftService](/store/to-craft-service) to adapt existing Angular dependencies

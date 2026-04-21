# Get Started

## Installation

### Using npm

```shell
npm i @craft-ng/core@latest
```

:::warning
The current documentation is also experimental. It takes a lot of time to create it, and AI is not always helpful. I will improve it over time. And some examples are not always pertinent.
:::

## Quick Start

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
      <button (click)="counter.increment()">Increment</button>
      <button (click)="counter.decrement()">Decrement</button>
    </div>
  `,
})
export class CounterComponent {
  counter = state(
    0,
    // methods
    ({ update }) => ({
      increment: () => update((current) => current + 1),
      decrement: () => update((current) => current - 1),
    }),
    // computed properties
    ({ state }) => ({
      isEven: computed(() => state() % 2 === 0),
      double: computed(() => state() * 2),
    }),
  );
}
```

### Extract reusable logic with craftService

For logic that should live outside a single component, wrap your primitives in a named service with `craftService`:

```typescript
import { Component, computed } from '@angular/core';
import { craftService, state } from '@craft-ng/core';

interface Todo {
  id: string;
  title: string;
  completed: boolean;
}

const { injectTodos } = craftService({ name: 'Todos', scope: 'global' }, () => {
  const items = state([] as Todo[], ({ state, set }) => ({
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
  }));

  return {
    items,
    total: computed(() => items().length),
    remaining: computed(() => items().filter((todo) => !todo.completed).length),
    addTodo: items.add,
    toggleTodo: items.toggle,
    removeTodo: items.remove,
  };
});

@Component({
  selector: 'app-todos',
  standalone: true,
  template: `
    <div>
      <h2>Todos ({{ store.total() }})</h2>
      <input
        #input
        type="text"
        (keyup.enter)="store.addTodo(input.value); input.value = ''"
      />

      <ul>
        @for (todo of store.items(); track todo.id) {
          <li>
            <input
              type="checkbox"
              [checked]="todo.completed"
              (change)="store.toggleTodo(todo.id)"
            />
            {{ todo.title }}
            <button (click)="store.removeTodo(todo.id)">Delete</button>
          </li>
        }
      </ul>

      <p>Remaining: {{ store.remaining() }}</p>
    </div>
  `,
})
export class TodosComponent {
  readonly store = injectTodos();
}
```

## Next Steps

- Explore the [Introduction](/introduction) to understand the core concepts
- Learn about [Primitives](/primitives/state) to build reactive state
- Discover [craftService](/store/craft-service) patterns to extract logic from components and services
- Use [toCraftService](/store/to-craft-service) to adapt existing Angular dependencies

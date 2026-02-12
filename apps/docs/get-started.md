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

### Using craft store with craftState

For more complex state management, use `craft` to create a store with `craftState`:

```typescript
import { Component } from '@angular/core';
import { craft, craftState } from '@craft-ng/core';
import { state } from '@craft-ng/core';
import { computed } from '@angular/core';

interface Todo {
  id: string;
  title: string;
  completed: boolean;
}

// Create a craft store
const { injectTodosCraft } = craft(
  { name: 'todos', providedIn: 'root' },
  craftState('list', () =>
    state(
      [] as Todo[],
      // Methods
      ({ state, set }) => ({
        add: (title: string) => {
          const newTodo = {
            id: crypto.randomUUID(),
            title,
            completed: false,
          };
          set([...state(), newTodo]);
        },
        toggle: (id: string) => {
          set(
            state().map((todo) =>
              todo.id === id ? { ...todo, completed: !todo.completed } : todo,
            ),
          );
        },
        remove: (id: string) => {
          set(state().filter((todo) => todo.id !== id));
        },
      }),
      // Computed properties
      ({ state }) => ({
        completed: computed(() => state().filter((t) => t.completed)),
        remaining: computed(() => state().filter((t) => !t.completed)),
        count: computed(() => state().length),
      }),
    ),
  ),
);

@Component({
  selector: 'app-todos',
  standalone: true,
  template: `
    <div>
      <h2>Todos ({{ store.listCount() }})</h2>
      <input
        #input
        type="text"
        (keyup.enter)="addTodo(input.value); input.value = ''"
      />

      <ul>
        @for (todo of store.list(); track todo.id) {
          <li>
            <input
              type="checkbox"
              [checked]="todo.completed"
              (change)="store.listToggle(todo.id)"
            />
            {{ todo.title }}
            <button (click)="store.listRemove(todo.id)">Delete</button>
          </li>
        }
      </ul>

      <p>Remaining: {{ store.listRemaining().length }}</p>
      <p>Completed: {{ store.listCompleted().length }}</p>
    </div>
  `,
})
export class TodosComponent {
  store = injectTodosCraft();

  addTodo(title: string) {
    if (title.trim()) {
      this.store.listAdd(title);
    }
  }
}
```

## Next Steps

- Explore the [Introduction](/introduction) to understand the core concepts
- Learn about [Primitives](/primitives/state) to build reactive state
- Discover [Store](/store/craft) patterns to extract logic from components and manage complex state

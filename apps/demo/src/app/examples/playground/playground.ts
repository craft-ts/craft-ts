import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
    craftMethod,
    craftService,
    insertReactOnMutation,
    mutation,
    provideHostName,
    query,
    type ExtractDeps,
    type GetDeps,
    type GetPublicComponentProperties
} from '@craft-ng/core';

// -- Types --

type Todo = {
  id: number;
  title: string;
  completed: boolean;
};

// -- Fake data store --

let nextId = 4;
const TODOS: Todo[] = [
  { id: 1, title: 'Learn @craft-ng', completed: false },
  { id: 2, title: 'Build a playground', completed: true },
  { id: 3, title: 'Share on StackBlitz', completed: false },
];

function delay<T>(value: T, ms = 500): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

// -- ApiService: global craftService with CRUD endpoints --

const { ApiServiceToYield } = craftService(
  { name: 'ApiService', scope: 'global' },
  () => ({
    getTodos: () => delay([...TODOS]),
    getTodo: (id: number) => {
      const todo = TODOS.find((t) => t.id === id);
      if (!todo) throw new Error(`Todo ${id} not found`);
      return delay({ ...todo });
    },
    addTodo: (title: string) => {
      const todo: Todo = { id: nextId++, title, completed: false };
      TODOS.push(todo);
      return delay(todo);
    },
    toggleTodo: (id: number) => {
      const todo = TODOS.find((t) => t.id === id);
      if (!todo) throw new Error(`Todo ${id} not found`);
      todo.completed = !todo.completed;
      return delay({ ...todo });
    },
    deleteTodo: (id: number) => {
      const index = TODOS.findIndex((t) => t.id === id);
      if (index === -1) throw new Error(`Todo ${id} not found`);
      const removed = TODOS.splice(index, 1)[0];
      return delay(removed);
    },
  }),
);

// -- Playground service: composes query + mutation --

const { injectPlayground, PlaygroundToYield } = craftService(
  { name: 'Playground', scope: 'function' },
  () => {
    const addTodo = mutation({
      method: (title: string) => title,
      loader: function* ({ params: title }) {
        return yield* ApiServiceToYield.addTodo(title);
      },
    });

    const toggleTodo = mutation({
      method: (id: number) => id,
      loader: function* ({ params: id }) {
        return yield* ApiServiceToYield.toggleTodo(id);
      },
    });

    const deleteTodo = mutation({
      method: (id: number) => id,
      loader: function* ({ params: id }) {
        return yield* ApiServiceToYield.deleteTodo(id);
      },
    });

    const todos = query(
      {
        params: () => 'all' as const,
        loader: function* () {
          const getTodos = yield* ApiServiceToYield.getTodos();
          return getTodos();
        },
      },
      insertReactOnMutation(addTodo, {
        reload: { onMutationResolved: true },
      }),
      insertReactOnMutation(toggleTodo, {
        reload: { onMutationResolved: true },
      }),
      insertReactOnMutation(deleteTodo, {
        reload: { onMutationResolved: true },
      }),
    );

    return { todos, addTodo, toggleTodo, deleteTodo };
  },
);

// -- Component --

@Component({
  selector: 'app-playground',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="playground">
      <h2>Playground</h2>
      <p class="subtitle">Sandbox for testing @craft-ng — ready to share on StackBlitz</p>

      <div class="add-form">
        <input
          #input
          type="text"
          placeholder="New todo title..."
          (keydown.enter)="add(input)"
        />
        <button (click)="add(input)" [disabled]="pg.addTodo.isLoading()">
          {{ pg.addTodo.isLoading() ? 'Adding...' : 'Add' }}
        </button>
      </div>

      <div class="list">
        @if (pg.todos.isLoading()) {
          <p class="reloading">Refreshing...</p>
        }
        @switch (pg.todos.status()) {
          @case ('loading') {
            <p class="loading">Loading todos...</p>
          }
          @case ('error') {
            <p class="error">Failed to load todos.</p>
          }
          @default {
            @for (todo of pg.todos.safeValue(); track todo.id) {
              <div class="todo-item" [class.completed]="todo.completed">
                <button class="toggle" (click)="pg.toggleTodo.mutate(todo.id)">
                  {{ todo.completed ? '✅' : '⬜' }}
                </button>
                <span class="title">{{ todo.title }}</span>
                <button class="delete" (click)="pg.deleteTodo.mutate(todo.id)">🗑️</button>
              </div>
            } @empty {
              <p class="empty">No todos yet.</p>
            }
          }
        }
      </div>
    </div>
  `,
  styles: `
    .playground {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 32px;
      font-family: sans-serif;
    }
    .subtitle {
      color: #6b7280;
      margin: 0;
    }
    .add-form {
      display: flex;
      gap: 8px;
    }
    input {
      padding: 8px 12px;
      font-size: 1rem;
      border: 1px solid #ccc;
      border-radius: 6px;
      width: 260px;
    }
    button {
      padding: 8px 16px;
      font-size: 1rem;
      cursor: pointer;
      border: 1px solid #ccc;
      border-radius: 6px;
      background: #fff;
    }
    button:hover {
      background: #f0f0f0;
    }
    .list {
      width: 100%;
      max-width: 420px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .todo-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      background: #fff;
    }
    .todo-item.completed .title {
      text-decoration: line-through;
      color: #9ca3af;
    }
    .title {
      flex: 1;
    }
    .toggle,
    .delete {
      border: none;
      background: none;
      padding: 4px;
      font-size: 1.1rem;
    }
    .reloading {
      color: #f59e0b;
      font-size: 0.875rem;
      margin: 0;
    }
    .loading {
      color: #6b7280;
    }
    .error {
      color: #ef4444;
    }
    .empty {
      color: #9ca3af;
      font-style: italic;
    }
  `,
  providers: [provideHostName('PlaygroundComponent')]
})
export default class PlaygroundComponent {
  protected readonly pg = injectPlayground();

  add = craftMethod('add', function* (input: HTMLInputElement) {
    const title = input.value.trim();
    if (!title) return;
    const pg = yield* PlaygroundToYield();
    pg.addTodo.mutate(title);
    input.value = '';
    return {};
  });
}

export type GenDeps_PlaygroundComponent = GetDeps<{
      deps: {};
      propertiesDeps: {
        pg: {
            Playground: ExtractDeps<typeof injectPlayground>["Playground"];
          };
        add: ExtractDeps<PlaygroundComponent["add"]>;
      };
      provided: {
        HostName: ReturnType<typeof provideHostName>;
      };
      publicProperties: GetPublicComponentProperties<PlaygroundComponent>;
    }>;

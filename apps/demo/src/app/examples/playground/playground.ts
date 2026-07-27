import {
  button,
  craftComponent,
  div,
  each,
  h2,
  input,
  p,
  span,
} from '@craft-ng/component';
import {
  componentMonitoring,
  craftMethod,
  craftService,
  insertReactOnMutation,
  craftPipe,
  mutation,
  provideHostName,
  query,
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

const { ApiService } = craftService(
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

const { Playground } = craftService(
  { name: 'Playground', scope: 'function' },
  function* () {
    const { addTodo } = yield* mutation('addTodo', {
      method: (title: string) => title,
      loader: function* ({ params: title }) {
        return yield* ApiService.addTodo(title);
      },
    });

    const { toggleTodo } = yield* mutation('toggleTodo', {
      method: (id: number) => id,
      loader: function* ({ params: id }) {
        return yield* ApiService.toggleTodo(id);
      },
    });

    const { deleteTodo } = yield* mutation('deleteTodo', {
      method: (id: number) => id,
      loader: function* ({ params: id }) {
        return yield* ApiService.deleteTodo(id);
      },
    });

    const { todos } = yield* query(
      'todos',
      {
        params: () => 'all' as const,
        loader: function* () {
          const getTodos = yield* ApiService.getTodos();
          return getTodos();
        },
      },
      (context) =>
        craftPipe(
          context,
          insertReactOnMutation(addTodo, {
            reload: { onMutationResolved: true },
          }),
          insertReactOnMutation(toggleTodo, {
            reload: { onMutationResolved: true },
          }),
          insertReactOnMutation(deleteTodo, {
            reload: { onMutationResolved: true },
          }),
        ),
    );

    return { todos, addTodo, toggleTodo, deleteTodo };
  },
);

// -- Component --

const PlaygroundComponent = craftComponent(
  'PlaygroundComponent',
  {
    providers: [provideHostName('component:PlaygroundComponent')],
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
  },
  function* () {
    componentMonitoring();
    const pg = yield* Playground();
    const { add } = craftMethod('add', function* (input: HTMLInputElement) {
      const title = input.value.trim();
      if (!title) return;
      (yield* Playground()).addTodo.mutate(title);
      input.value = '';
      return {};
    });
    return { pg, add };
  },
  ({ pg, add }) => {
    let field: HTMLInputElement | undefined;
    return div({ class: 'playground' }, [
      h2('Playground'),
      p('Sandbox for testing @craft-ng — ready to share on StackBlitz'),
      div({ class: 'add-form' }, [
        input({
          type: 'text',
          placeholder: 'New todo title…',
          input: (event) => {
            field = event.target as HTMLInputElement;
          },
          keydown: (event) => {
            if (event.key === 'Enter' && field) void add(field);
          },
        }),
        button(
          {
            disabled: pg.addTodo.isLoading(),
            click: () => field && void add(field),
          },
          pg.addTodo.isLoading() ? 'Adding…' : 'Add',
        ),
      ]),
      div(
        { class: 'list' },
        each(
          () => pg.todos.safeValue() ?? [],
          { track: (todo) => todo.id, empty: () => p('No todos yet.') },
          (todo) =>
            div({ class: { 'todo-item': true, completed: todo.completed } }, [
              button(
                { click: () => pg.toggleTodo.mutate(todo.id) },
                todo.completed ? '✅' : '⬜',
              ),
              span({ class: 'title' }, todo.title),
              button({ click: () => pg.deleteTodo.mutate(todo.id) }, '🗑️'),
            ]),
        ),
      ),
    ]);
  },
);

export default PlaygroundComponent;

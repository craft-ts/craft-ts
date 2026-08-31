/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import {
  button,
  craftComponent,
  div,
  forNode,
  ifNode,
  input,
  p,
  span,
  heading,
} from '@craft-ts/component';
import {
  craftComputed,
  craftGen,
  craftMethod,
  craftService,
  craftSleep,
  insertReactOnMutation,
  insertQueryPipe,
  mutation,
  query,
  state,
  craftException,
} from '@craft-ts/core';

// -- Types --

type Todo = {
  id: number;
  title: string;
  completed: boolean;
};

const TODO_ICONS: Readonly<Record<string, string>> = {
  false: '⬜',
  true: '✅',
};

// -- Fake data store --

const TODOS: Todo[] = [
  { id: 1, title: 'Learn @craft-ts', completed: false },
  { id: 2, title: 'Build a playground', completed: true },
  { id: 3, title: 'Share on StackBlitz', completed: false },
];

// -- ApiService: global craftService with CRUD endpoints --

const { ApiService } = craftService(
  { name: 'ApiService', providedIn: 'global' },
  function* () {
    const nextId = yield* state('nextId', 4, ({ state, update }) => ({
      take: function* () {
            const _state = yield* state();
                const id = _state;
                yield* update((value) => value + 1);
                return id;
              },
    }));

    return {
      getTodos: craftGen(function* () {
        yield* craftSleep(500);
        return [...TODOS];
      }),
      getTodo: craftGen(function* (id: number) {
        const todo = TODOS.find((t) => t.id === id);
        if (!todo)
          return craftException(
            { _tag: 'UNEXPECTED_ERROR' },
            { error: new Error(`Todo ${id} not found`) },
          );
        yield* craftSleep(500);
        return { ...todo };
      }),
      addTodo: craftGen(function* (title: string) {
        const todo: Todo = {
          id: yield* nextId.take(),
          title,
          completed: false,
        };
        TODOS.push(todo);
        yield* craftSleep(500);
        return todo;
      }),
      toggleTodo: craftGen(function* (id: number) {
        const todo = TODOS.find((t) => t.id === id);
        if (!todo)
          return craftException(
            { _tag: 'UNEXPECTED_ERROR' },
            { error: new Error(`Todo ${id} not found`) },
          );
        todo.completed = !todo.completed;
        yield* craftSleep(500);
        return { ...todo };
      }),
      deleteTodo: craftGen(function* (id: number) {
        const index = TODOS.findIndex((t) => t.id === id);
        if (index === -1)
          return craftException(
            { _tag: 'UNEXPECTED_ERROR' },
            { error: new Error(`Todo ${id} not found`) },
          );
        const removed = TODOS.splice(index, 1)[0];
        yield* craftSleep(500);
        return removed;
      }),
    };
  },
);

// -- Playground service: composes query + mutation --

const { Playground } = craftService(
  { name: 'Playground', providedIn: 'function' },
  function* () {
    const api = yield* ApiService();
    const addTodo = yield* mutation('addTodo', {
      method: (title: string) => title,
      loader: function* ({ params: title }) {
        return yield* api.addTodo(title);
      },
    });

    const toggleTodo = yield* mutation('toggleTodo', {
      method: (id: number) => id,
      loader: function* ({ params: id }) {
        return yield* api.toggleTodo(id);
      },
    });

    const deleteTodo = yield* mutation('deleteTodo', {
      method: (id: number) => id,
      loader: function* ({ params: id }) {
        return yield* api.deleteTodo(id);
      },
    });

    const todos = yield* query(
      'todos',
      {
        params: () => 'all' as const,
        loader: function* () {
          return yield* api.getTodos();
        },
      },
      insertQueryPipe(
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
    
      button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid currentColor;outline-offset:2px}
    `,
  },
  function* () {
    const pg = yield* Playground();
    const titleInput = yield* state('titleInput', '', ({ set }) => ({
      setTitle: (value: string) => set(value),
      clearTitle: () => set(''),
    }));
    const add = craftMethod('add', function* () {
      const title = (yield* titleInput()).trim();
      if (!title) return;
      yield* pg.addTodo.mutate(title);
      yield* titleInput.clearTitle();
      return {};
    });
    const isAdding = craftComputed('isAdding', function* () {
        const _pgaddTodoisLoading = yield* pg.addTodo.isLoading(); return _pgaddTodoisLoading; },
    );
    const todos = craftComputed(
      'todos',
      function* () {
          const _pgtodosvalue = yield* pg.todos.value(); return _pgtodosvalue ?? []; },
    );
    return {
      pg,
      add,
      isAdding,
      todos,
      titleInput,
      setTitle: titleInput.setTitle,
    };
  },
  ({ pg, add, isAdding, todos, titleInput, setTitle }) => {
    return div({ class: 'playground' }, [
      heading('Playground'),
      p('Sandbox for testing @craft-ts — ready to share on StackBlitz'),
      div({ class: 'add-form' }, [
        input('title', {
          type: 'text',
          placeholder: 'New todo title…',
          value: titleInput,
          *input(event) {
            yield* setTitle(event.target.value);
          },
          *keydown(event) {
            if (event.key === 'Enter') yield* add();
          },
        }),
        button('add',
          { type: 'button',
            disabled: pg.addTodo.isLoading,
            click: add,
          },
          ifNode(
            isAdding,
            () => 'Adding…',
            () => 'Add',
          ),
        ),
      ]),
      div(
        { class: 'list' },
        forNode(
          todos,
          { track: (todo) => todo.id, empty: () => p('No todos yet.') },
          (todo) =>
            div({
              class: function* () {
                return {
                  'todo-item': true,
                  completed: (yield* todo()).completed,
                };
              },
            }, [
              button('toggle',
                { type: 'button',
                  *click() {
                    yield* pg.toggleTodo.mutate((yield* todo()).id);
                  },
                },
                function* () {
                  return TODO_ICONS[String((yield* todo()).completed)];
                },
              ),
              span({ class: 'title' }, function* () {
                return (yield* todo()).title;
              }),
              button('delete',
                { type: 'button',
                  'aria-label': function* () {
                    return `Delete ${(yield* todo()).title}`;
                  },
                  *click() {
                    yield* pg.deleteTodo.mutate((yield* todo()).id);
                  },
                },
                '🗑️',
              ),
            ]),
        ),
      ),
    ]);
  },
);

export default PlaygroundComponent;

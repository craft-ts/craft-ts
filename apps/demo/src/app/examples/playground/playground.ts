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
import { example } from '../shared/example.style';

// -- Types --

type Todo = {
  id: number;
  title: string;
  completed: boolean;
};

/** `data-exampleText` of a todo title: struck through once it is done. */
const TODO_STATE: Readonly<Record<string, 'done' | null>> = {
  false: null,
  true: 'done',
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
        params: () => 'all',
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
  {},
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
    return div({ class: example.centered }, [
      heading({ class: example.title }, 'Playground'),
      p({ class: example.text, 'data-exampleText': 'muted' }, 'Sandbox for testing @craft-ts — ready to share on StackBlitz'),
      div({ class: example.row }, [
        input('title', {
          class: example.input,
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
          { class: example.button, type: 'button',
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
        { class: example.list },
        forNode(
          todos,
          { track: (todo) => todo.id, empty: () => p('No todos yet.') },
          (todo) =>
            div({ class: example.item }, [
              button('toggle',
                { class: example.button, 'data-exampleButton': 'ghost', type: 'button',
                  *click() {
                    yield* pg.toggleTodo.mutate((yield* todo()).id);
                  },
                },
                function* () {
                  return TODO_ICONS[String((yield* todo()).completed)];
                },
              ),
              span({
                class: example.itemTitle,
                'data-exampleText': function* () {
                  return TODO_STATE[String((yield* todo()).completed)];
                },
              }, function* () {
                return (yield* todo()).title;
              }),
              button('delete',
                { class: example.button, 'data-exampleButton': 'ghost', type: 'button',
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

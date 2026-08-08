import styles from './full-demo.css' with { loader: 'text' };
import {
  button,
  craftComponent,
  div,
  each,
  h2,
  input,
  li,
  p,
  span,
  ul,
} from '@craft-ng/component';
import { mutation, query, state } from '@craft-ng/core';
import { StatusComponent } from '../../../ui/status.component';

type Todo = { readonly id: number; readonly title: string };

const FullDemo = craftComponent(
  'FullDemo',
  {
    stylesUrl: styles,
  },
  function* () {
    const nextId = yield* state('nextId', 3, ({ state, update }) => ({
      take: () => {
        const id = state();
        update((value) => value + 1);
        return id;
      },
    }));
    const records = yield* state(
      'records',
      [
        { id: 1, title: 'Learn Craft primitives' },
        { id: 2, title: 'Build functional components' },
      ] satisfies Todo[],
      ({ update }) => ({
        add: (todo: Todo) => update((current) => [...current, todo]),
        remove: (id: number) =>
          update((current) => current.filter((todo) => todo.id !== id)),
      }),
    );
    const refresh = yield* state('refresh', 0, ({ update }) => ({
      increment: () => update((value) => value + 1),
    }));
    const todos = yield* query('todos', {
      params: refresh,
      loader: async () => [...records()],
    });
    const addTodo = yield* mutation('addTodo', {
      method: (title: string) => title,
      loader: function* ({ params: title }) {
        const todo = { id: yield* nextId.take(), title };
        yield* records.add(todo);
        yield* refresh.increment();
        return todo;
      },
    });
    const removeTodo = yield* mutation('removeTodo', {
      method: (id: number) => id,
      loader: function* ({ params: id }) {
        yield* records.remove(id);
        yield* refresh.increment();
        return id;
      },
    });
    return { todos, addTodo, removeTodo };
  },
  ({ todos, addTodo, removeTodo }) => {
    let title = '';
    return div([
      h2([
        'Full primitives demo ',
        StatusComponent({ status: () => todos.status() }),
      ]),
      p('Query, mutations, optimistic interaction and functional rendering.'),
      div([
        input({
          placeholder: 'New todo',
          input: (event) => {
            title = (event.target as HTMLInputElement).value;
          },
        }),
        button(
          {
            disabled: addTodo.isLoading(),
            click: () => {
              if (title.trim()) addTodo.mutate(title.trim());
            },
          },
          'Add',
        ),
      ]),
      ul(
        each(
          todos.value,
          { track: (todo) => todo.id, empty: () => p('No todos.') },
          (todo) =>
            li([
              span(todo.title),
              button(
                {
                  disabled: removeTodo.isLoading(),
                  click: () => removeTodo.mutate(todo.id),
                },
                'Remove',
              ),
            ]),
        ),
      ),
    ]);
  },
);

export default FullDemo;

/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import styles from './full-demo.css' with { loader: 'text' };
import {
  button,
  craftComponent,
  div,
  forNode,
  input,
  li,
  p,
  span,
  ul,
  heading,
} from '@craft-ts/component';
import {
  mutation,
  query,
  state,
} from '@craft-ts/core';
import { StatusComponent } from '../../../ui/status.component';

type Todo = { readonly id: number; readonly title: string };

const FullDemo = craftComponent(
  'FullDemo',
  {
    stylesUrl: styles,
  },
  function* () {
    const nextId = yield* state('nextId', 3, ({ state, update }) => ({
      take: function* () {
            const _state = yield* state();
                const id = _state;
              yield* update((value) => value + 1);
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
    const todos = yield* query('todos', {
      method: (_: undefined) => undefined,
      loader: function* () {
          const _records = yield* records();
        return [..._records];
      },
    });
    yield* todos.call(undefined); // trigger first call
    const addTodo = yield* mutation('addTodo', {
      method: (title: string) => title,
      loader: function* ({ params: title }) {
        const todo = { id: yield* nextId.take(), title };
        yield* records.add(todo);
        yield* todos.call(undefined);
        return todo;
      },
    });
    const removeTodo = yield* mutation('removeTodo', {
      method: (id: number) => id,
      loader: function* ({ params: id }) {
        yield* records.remove(id);
        yield* todos.call(undefined);
        return id;
      },
    });
    const titleInput = yield* state('titleInput', '', ({ set }) => ({
      setTitle: (value: string) => set(value),
    }));
    return {
      todos,
      addTodo,
      removeTodo,
      titleInput,
      setTitle: titleInput.setTitle,
    };
  },
  ({ todos, addTodo, removeTodo, titleInput, setTitle }) => {
    return div([
      heading([
        'Full primitives demo ',
        StatusComponent({ status: todos.status }),
      ]),
      p('Query, mutations, optimistic interaction and functional rendering.'),
      div([
        input('TodoNameToAddInput', {
          type: 'text',
          placeholder: 'New todo',
          value: titleInput,
          *input(event: Event) {
            yield* setTitle((event.target as HTMLInputElement).value);
          },
        }),
        button(
          'AddTodoButton',
          { type: 'button',
            disabled: addTodo.isLoading,
            *click() {
              if ((yield* titleInput()).trim()) {
                yield* addTodo.mutate((yield* titleInput()).trim());
              }
            },
          },
          'Add',
        ),
      ]),
      ul(
        forNode(
          todos.value,
          { track: (todo) => todo.id, empty: () => p('No todos.') },
          (todo) =>
            li([
              span('TodoTitle', {}, function* () {
                return (yield* todo()).title;
              }),
              button(
                'RemoveTodoButton',
                { type: 'button',
                  disabled: removeTodo.isLoading,
                  *click() {
                    yield* removeTodo.mutate((yield* todo()).id);
                  },
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

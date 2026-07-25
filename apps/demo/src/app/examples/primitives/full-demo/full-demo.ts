import { signal } from '@angular/core';
import {
  button,
  component,
  div,
  each,
  h2,
  input,
  li,
  p,
  span,
  ul,
} from '@craft-ng/component';
import {
  componentMonitoring,
  mutation,
  provideHostName,
  query,
} from '@craft-ng/core';
import { StatusComponent } from '../../../ui/status.component';

type Todo = { readonly id: number; readonly title: string };
let nextId = 3;
let records: Todo[] = [
  { id: 1, title: 'Learn Craft primitives' },
  { id: 2, title: 'Build functional components' },
];

const FullDemo = component(
  {
    providers: [provideHostName('component:FullDemo')],
    styles:
      '.full-demo{display:grid;gap:1rem;max-width:640px}.full-demo li{display:flex;gap:.75rem;align-items:center}.full-demo li span{flex:1}',
  },
  function* () {
    componentMonitoring();
    const refresh = signal(0);
    const todos = yield* query({
      params: refresh,
      loader: async () => [...records],
    });
    const addTodo = yield* mutation({
      method: (title: string) => title,
      loader: async ({ params: title }) => {
        const todo = { id: nextId++, title };
        records = [...records, todo];
        refresh.update((value) => value + 1);
        return todo;
      },
    });
    const removeTodo = yield* mutation({
      method: (id: number) => id,
      loader: async ({ params: id }) => {
        records = records.filter((todo) => todo.id !== id);
        refresh.update((value) => value + 1);
        return id;
      },
    });
    return { todos, addTodo, removeTodo };
  },
  ({ todos, addTodo, removeTodo }) => {
    let title = '';
    return div({ class: 'full-demo' }, [
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
          () => todos.safeValue() ?? [],
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

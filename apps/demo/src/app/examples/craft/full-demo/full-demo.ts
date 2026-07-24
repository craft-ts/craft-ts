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
  craftService,
  craftUse,
  mutation,
  provideHostName,
  query,
  type GetDeps,
} from '@craft-ng/core';
import { StatusComponent } from '../../../ui/status.component';

type Todo = { readonly id: number; readonly title: string };
let nextId = 3;
let records: Todo[] = [
  { id: 1, title: 'Compose a craftService' },
  { id: 2, title: 'Expose query and mutations' },
];

const { injectTodoStore, provideTodoStore } = craftService(
  { name: 'TodoStore', scope: 'toProvide' },
  () => {
    const refresh = signal(0);
    const todos = craftUse(
      query({
        params: refresh,
        loader: async () => [...records],
      }),
    );
    const add = craftUse(
      mutation({
        method: (title: string) => title,
        loader: async ({ params: title }) => {
          const todo = { id: nextId++, title };
          records = [...records, todo];
          refresh.update((value) => value + 1);
          return todo;
        },
      }),
    );
    const remove = craftUse(
      mutation({
        method: (id: number) => id,
        loader: async ({ params: id }) => {
          records = records.filter((todo) => todo.id !== id);
          refresh.update((value) => value + 1);
          return id;
        },
      }),
    );
    return { todos, add, remove };
  },
);

const FullDemoCraft = component(
  {
    providers: [
      provideTodoStore(),
      provideHostName('component:FullDemoCraft'),
    ],
    styles:
      '.craft-full-demo{display:grid;gap:1rem;max-width:640px}.craft-full-demo li{display:flex;gap:.75rem}.craft-full-demo li span{flex:1}',
  },
  () => {
    componentMonitoring();
    return { store: injectTodoStore() };
  },
  ({ store }) => {
    let title = '';
    return div({ class: 'craft-full-demo' }, [
      h2([
        'Full craftService demo ',
        StatusComponent({ status: () => store.todos.status() }),
      ]),
      p('A toProvide service composed from a query and two mutations.'),
      div([
        input({
          placeholder: 'New todo',
          input: (event) => {
            title = (event.target as HTMLInputElement).value;
          },
        }),
        button(
          {
            disabled: store.add.isLoading(),
            click: () => {
              if (title.trim()) store.add.mutate(title.trim());
            },
          },
          'Add',
        ),
      ]),
      ul(
        each(
          () => store.todos.safeValue() ?? [],
          { track: (todo) => todo.id, empty: () => p('No todos.') },
          (todo) =>
            li([
              span(todo.title),
              button(
                { click: () => store.remove.mutate(todo.id) },
                'Remove',
              ),
            ]),
        ),
      ),
    ]);
  },
);

export default FullDemoCraft;
export type GenDeps_FullDemoCraft = GetDeps<{
  deps: Record<never, never>;
  propertiesDeps: Record<never, never>;
  provided: {
    TodoStore: ReturnType<typeof provideTodoStore>;
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: Record<never, never>;
}>;

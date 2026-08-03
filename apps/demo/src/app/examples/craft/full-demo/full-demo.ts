import { signal } from '@angular/core';
import {
  button,
  catchBlock,
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
import {
  componentMonitoring,
  craftException,
  craftService,
  mutation,
  provideHostName,
  query,
} from '@craft-ng/core';
import { StatusComponent } from '../../../ui/status.component';

type Todo = { readonly id: number; readonly title: string };
let nextId = 3;
let records: Todo[] = [
  { id: 1, title: 'Compose a craftService' },
  { id: 2, title: 'Expose query and mutations' },
];

const { provideTodoStore, TodoStore } = craftService(
  { name: 'TodoStore', scope: 'toProvide' },
  function* () {
    const refresh = signal(0);
    const { todos } = yield* query('todos', {
      params: refresh,
      loader: async () => {
        if (false) {
          // add an exception to the query signature, it will force this component or his host to handle this exception
          return craftException({ code: 'FAILED_TO_LOAD' });
        }
        return [...records];
      },
    });
    const { add } = yield* mutation('add', {
      method: (title: string) => title,
      loader: async ({ params: title }) => {
        const todo = { id: nextId++, title };
        records = [...records, todo];
        refresh.update((value) => value + 1);
        return todo;
      },
    });
    const { remove } = yield* mutation('remove', {
      method: (id: number) => id,
      loader: async ({ params: id }) => {
        records = records.filter((todo) => todo.id !== id);
        refresh.update((value) => value + 1);
        return id;
      },
    });
    return { todos, add, remove };
  },
);

const FullDemoCraft = craftComponent(
  'FullDemoCraft',
  {
    providers: [provideTodoStore(), provideHostName('component:FullDemoCraft')],
    styles:
      ':scope{display:grid;gap:1rem;max-width:640px}li{display:flex;gap:.75rem}li span{flex:1}',
  },
  function* () {
    componentMonitoring();
    return { store: yield* TodoStore() };
  },
  ({ store }) => {
    return div([
      h2([
        'Full craftService demo ',
        StatusComponent({ status: () => store.todos.status() }),
      ]),
      p('A toProvide service composed from a query and two mutations.'),
      ul(
        each(
          () => store.todos.safeValue() ?? [],
          { track: (todo) => todo.id, empty: () => p('No todos.') },
          (todo) => li([span(todo.title)]),
        ),
      ),
    ]);
  },
).pipe(
  catchBlock.exhaustive({
    FAILED_TO_LOAD: {
      render: () =>
        p('⚠️ FAILED_TO_LOAD (handled by catchBlock.exhaustive)'),
      showSource: true,
      position: 'after',
    },
  }),
);
export default FullDemoCraft;

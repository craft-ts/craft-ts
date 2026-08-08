import styles from './full-demo.css' with { loader: 'text' };
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
  craftException,
  craftGen,
  craftService,
  insertQueryPipe,
  insertReactOnMutation,
  mutation,
  query,
  state,
} from '@craft-ng/core';
import { StatusComponent } from '../../../ui/status.component';

export type Todo = { readonly id: number; readonly title: string };

export const { provideTodoStore, TodoStore } = craftService(
  { name: 'TodoStore', scope: 'toProvide' },
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
        { id: 1, title: 'Compose a craftService' },
        { id: 2, title: 'Expose query and mutations' },
      ] satisfies Todo[],
      ({ update }) => ({
        add: (todo: Todo) => update((current) => [...current, todo]),
        remove: (id: number) =>
          update((current) => current.filter((todo) => todo.id !== id)),
      }),
    );
    const add = yield* mutation('add', {
      method: (title: string) => title,
      loader: function* ({ params: title }) {
        const todo = { id: yield* nextId.take(), title };
        yield* records.add(todo);
        return todo;
      },
    });
    const remove = yield* mutation('remove', {
      method: (id: number) => id,
      loader: function* ({ params: id }) {
        yield* records.remove(id);
        return id;
      },
    });
    const todos = yield* query(
      'todos',
      {
        // The list is loaded once. Mutations update its value through the
        // insertions below, so input changes cannot restart this loader.
        params: () => true,
        loader: craftGen(function* () {
          // Keep the exceptional branch in the inferred query type for the demo.
          // eslint-disable-next-line no-constant-condition
          if (false) {
            // add an exception to the query signature, it will force this component or his host to handle this exception
            return craftException({ code: 'FAILED_TO_LOAD' });
          }
          return [...records()];
        }),
      },
      insertQueryPipe(
        insertReactOnMutation(add, {
          optimisticUpdate: ({ queryResource, mutationParams }) => {
            const current = queryResource.value() ?? [];
            const id =
              current.reduce((max, todo) => Math.max(max, todo.id), 0) + 1;
            return [...current, { id, title: mutationParams }];
          },
          reload: { onMutationException: true },
        }),
        insertReactOnMutation(remove, {
          optimisticUpdate: ({ queryResource, mutationParams }) =>
            (queryResource.value() ?? []).filter(
              (todo) => todo.id !== mutationParams,
            ),
          reload: { onMutationException: true },
        }),
      ),
    );
    return { todos, add, remove };
  },
);

const FullDemoCraft = craftComponent(
  'FullDemoCraft',
  {
    providers: [provideTodoStore()],
    stylesUrl: styles,
  },
  function* () {
    return { store: yield* TodoStore(), title: yield* state('title', '') };
  },
  ({ store, title }) => {
    return div([
      h2([
        'Full craftService demo ',
        StatusComponent({ status: () => store.todos.status() }),
      ]),
      p('A toProvide service composed from a query and two mutations.'),
      div([
        input('TodoNameToAddInput', {
          placeholder: 'New todo',
          value: title(),
          input: (event) => title.set((event.target as HTMLInputElement).value),
        }),
        button(
          'AddTodoButton',
          {
            disabled: store.add.isLoading(),
            click: () => {
              if (title().trim()) {
                store.add.mutate(title().trim());
              }
            },
          },
          'Add',
        ),
      ]),
      ul(
        each(
          () => store.todos.value(),
          { track: (todo) => todo.id, empty: () => p('No todos.') },
          (todo) =>
            li([
              span(todo.title),
              button(
                'RemoveTodoButton',
                {
                  disabled: store.remove.isLoading(),
                  click: () => store.remove.mutate(todo.id),
                },
                'Remove',
              ),
            ]),
        ),
      ),
    ]);
  },
).pipe(
  catchBlock.exhaustive({
    FAILED_TO_LOAD: {
      render: () => p('⚠️ FAILED_TO_LOAD (handled by catchBlock.exhaustive)'),
      showSource: true,
      position: 'after',
    },
  }),
);
export default FullDemoCraft;

/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import styles from './full-demo.css' with { loader: 'text' };
import {
  button,
  catchNode,
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
  craftException,
  craftGen,
  craftService,
  insertQueryPipe,
  insertReactOnMutation,
  mutation,
  query,
  state,
} from '@craft-ts/core';
import { eventValue } from '../../../event-value';
import { StatusComponent } from '../../../ui/status.component';

export type Todo = { readonly id: number; readonly title: string };

const INITIAL_TODOS = [
  { id: 1, title: 'Compose a craftService' },
  { id: 2, title: 'Expose query and mutations' },
] satisfies Todo[];

export const { provideTodoStore, TodoStore } = craftService(
  { name: 'TodoStore', providedIn: 'toProvide' },
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
      INITIAL_TODOS,
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
          // Keep the exceptional branch in the inferred query type for the
          // demo while keeping the successful source independent from the
          // mutable records state.
          // eslint-disable-next-line no-constant-condition
          if (false) {
            return craftException({ _tag: 'FAILED_TO_LOAD' });
          }
          // The query is intentionally a one-shot source. Mutations update
          // its cached value through insertReactOnMutation; reading the
          // mutable records state here would make every add/remove restart
          // this loader as a reactive dependency.
          return [...INITIAL_TODOS];
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
        }),
        insertReactOnMutation(remove, {
          optimisticUpdate: ({ queryResource, mutationParams }) =>
            (queryResource.value() ?? []).filter(
              (todo) => todo.id !== mutationParams,
            ),
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
    const store = yield* TodoStore();
    const titleInput = yield* state('titleInput', '', ({ set }) => ({
      setTitle: (value: string) => set(value),
    }));
    return { store, titleInput, setTitle: titleInput.setTitle };
  },
  ({ store, titleInput, setTitle }) => {
    return div([
      heading([
        'Full craftService demo ',
        StatusComponent({ status: store.todos.status }),
      ]),
      p('A toProvide service composed from a query and two mutations.'),
      div([
        input('TodoNameToAddInput', {
          placeholder: 'New todo',
          value: titleInput,
          *input(event: Event) {
            yield* setTitle(eventValue(event));
          },
        }),
        button(
          'AddTodoButton',
          { type: 'button',
            disabled: store.add.isLoading,
            *click() {
              yield* store.add.mutate(((yield* titleInput()) ?? '').trim());
            },
          },
          'Add',
        ),
      ]),
      ul(
        forNode(
          store.todos.value,
          { track: (todo) => todo.id, empty: () => p('No todos.') },
          (todo) =>
            li([
              span('TodoTitle', {}, function* () {
                return (yield* todo()).title;
              }),
              button(
                'RemoveTodoButton',
                { type: 'button',
                  disabled: store.remove.isLoading,
                  *click() {
                    yield* store.remove.mutate((yield* todo()).id);
                  },
                },
                'Remove',
              ),
            ]),
        ),
      ),
    ]);
  },
).pipe(
  catchNode.exhaustive({
    FAILED_TO_LOAD: {
      render: () => p('⚠️ FAILED_TO_LOAD (handled by catchNode.exhaustive)'),
      showSource: true,
      position: 'after',
    },
  }),
);
export default FullDemoCraft;

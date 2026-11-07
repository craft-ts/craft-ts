import {
  craftService,
  CraftHttpClient,
  craftUnique,
  cMinLength,
  cRequired,
  cValidate,
  insertForm,
  insertFormAttributes,
  insertFormSubmit,
  insertNoopTypingAnchor,
  insertQueryPipe,
  insertReloadOnFocus,
  insertReactOnQuery,
  insertReactOnMutation,
  insertSelectFormTree,
  insertStoragePersister,
  mutation,
  query,
  insertStatePipe,
  state,
  type ValidatedFormValue,
} from '@craft-ts/core';

export type Todo = {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
};

const noTodos: readonly Todo[] = [];

/**
 * Service draft translated from the supplied pseudocode.
 * Assumption: PUT /api/todos accepts and returns the complete todo list.
 */
export const { TodoService, provideTodoService } = craftService(
  { name: 'todoService', providedIn: 'toProvide' },
  function* () {
    const updateTodos = yield* mutation('updateTodos', {
      method: (todos: NonNullable<ValidatedFormValue<readonly Todo[]>>) =>
        todos,
      loader: function* ({ params: todos }) {
        return yield* CraftHttpClient.put(({ response }) => ({
          url: '/api/todos',
          payload: todos,
          success: response<readonly Todo[]>(),
        }));
      },
    });

    const todoServerState = yield* query(
      'todoServerState',
      {
        params: () => 'all',
        loader: function* () {
          return yield* CraftHttpClient.get(({ response }) => ({
            url: '/api/todos',
            success: response<readonly Todo[]>(),
          }));
        },
      },
      insertQueryPipe(
        insertStoragePersister(
          craftUnique({ storeName: 'todo-example', key: 'server-todos' }),
          { staleTime: 30_000, cacheTime: 5 * 60_000 },
        ),
        insertReactOnMutation(updateTodos, {
          optimisticUpdate: ({ mutationParams }) => [...mutationParams],
          reload: { onMutationException: true },
        }),
        insertReloadOnFocus,
      ),
    );

    yield* state(
      'clientTodoForms',
      noTodos,
      insertStatePipe(
        insertForm(
          insertFormAttributes(({ field }) => ({
            validators: [
              cValidate({
                name: 'todoListNotEmpty',
                validWhen: () => field.value().length > 0,
                exception: 'Add at least one todo.',
              }),
              cValidate({
                name: 'todoTitlesUnique',
                validWhen: () => {
                  const titles = field
                    .value()
                    .map((todo) => todo.title.trim().toLocaleLowerCase());
                  return new Set(titles).size === titles.length;
                },
                exception: 'Todo titles must be unique.',
              }),
            ],
          })),
          insertSelectFormTree(
            'todo',
            insertNoopTypingAnchor,
            insertSelectFormTree(
              'title',
              insertNoopTypingAnchor,
              insertFormAttributes(() => ({
                validators: [cRequired(), cMinLength({ minLength: 3 })],
              })),
            ),
          ),
          insertFormSubmit(updateTodos),
        ),
        insertReactOnQuery(todoServerState, {
          filter: ({ insertions }) => !insertions.form.dirty(),
          update: ({ queryValue, insertions }) =>
            insertions.form.reset(queryValue),
        }),
        insertStoragePersister(
          craftUnique({ storeName: 'todo-example', key: 'todo-form-draft' }),
        ),
      ),
    );
  },
);

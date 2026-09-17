/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import styles from './full-demo.css' with { loader: 'text' };
import {
  button,
  craftComponent,
  div,
  fieldErrorNode,
  forNode,
  form,
  input,
  li,
  p,
  span,
  ul,
  heading,
} from '@craft-ts/component';
import {
  craftService,
  cRequired,
  CraftFieldDirective,
  insertForm,
  insertFormAttributes,
  insertFormSubmit,
  mutation,
  query,
  state,
  type ValidatedFormValue,
} from '@craft-ts/core';
import { StatusComponent } from '../../../ui/status.component';

type Todo = { readonly id: number; readonly title: string };

const { FullDemoView, provideFullDemoView } = craftService(
  { name: 'fullDemoView', providedIn: 'toProvide' },
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
      method: (title: NonNullable<ValidatedFormValue<string>>) => title.trim(),
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
    const titleForm = yield* state(
      'titleForm',
      '',
      insertForm(
        insertFormAttributes(() => ({ validators: [cRequired()] })),
        insertFormSubmit(addTodo),
      ),
    );
    return {
      todos,
      addTodo,
      removeTodo,
      titleForm,
    };
  },
);

const FullDemo = craftComponent(
  'FullDemo',
  {
    providers: [provideFullDemoView()],
    stylesUrl: styles,
  },
  function* () {
    const { todos, addTodo, removeTodo, titleForm } = yield* FullDemoView();

    return div([
      heading([
        'Full primitives demo ',
        StatusComponent({ status: todos.status }),
      ]),
      p('Query, mutations, optimistic interaction and functional rendering.'),
      form(
        'AddTodoForm',
        {
          *submit(event) {
            event.preventDefault();
            yield* titleForm.form.submit();
          },
        },
        [
          input('TodoNameToAddInput', {
            type: 'text',
            placeholder: 'New todo',
          }).pipe(CraftFieldDirective(titleForm.form)),
          button(
            'AddTodoButton',
            { type: 'submit', disabled: addTodo.isLoading },
            'Add',
          ),
        ],
      ).pipe(
        fieldErrorNode.exhaustive({
          required: () => p('A todo title is required.'),
        }),
      ),
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
                {
                  type: 'button',
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

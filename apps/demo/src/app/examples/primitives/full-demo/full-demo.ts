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
import { example } from '../../shared/example.style';

type Todo = { readonly id: number; readonly title: string };

const FullDemo = craftComponent(
  'FullDemo',
  {},
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
  ({ todos, addTodo, removeTodo, titleForm }) => {
    return div({ class: example.page }, [
      heading({ class: example.title }, [
        'Full primitives demo ',
        StatusComponent({ status: todos.status }),
      ]),
      p(
        { class: example.text, 'data-exampleText': 'muted' },
        'Query, mutations, optimistic interaction and functional rendering.',
      ),
      form(
        'AddTodoForm',
        {
          class: example.row,
          *submit(event) {
            event.preventDefault();
            yield* titleForm.form.submit();
          },
        },
        [
          input('TodoNameToAddInput', {
            class: example.input,
            type: 'text',
            placeholder: 'New todo',
          }).pipe(CraftFieldDirective(titleForm.form)),
          button(
            'AddTodoButton',
            {
              class: example.button,
              'data-exampleButton': 'primary',
              type: 'submit',
              disabled: addTodo.isLoading,
            },
            'Add',
          ),
        ],
      ).pipe(
        fieldErrorNode.exhaustive({
          required: () =>
            p(
              { class: example.text, 'data-exampleText': 'error' },
              'A todo title is required.',
            ),
        }),
      ),
      ul(
        { class: example.list },
        forNode(
          todos.value,
          { track: (todo) => todo.id, empty: () => p('No todos.') },
          (todo) =>
            li({ class: example.item }, [
              span('TodoTitle', {}, function* () {
                return (yield* todo()).title;
              }),
              button(
                'RemoveTodoButton',
                {
                  class: example.button,
                  'data-exampleButton': 'danger',
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

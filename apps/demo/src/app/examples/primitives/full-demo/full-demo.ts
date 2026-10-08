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
  craftPrivate,
} from '@craft-ts/core';
import { StatusComponent } from '../../../ui/status.component';
import { example } from '../../shared/example.style';

type Todo = { readonly id: number; readonly title: string };

export const { FullDemoView, provideFullDemoView } = craftService(
  { name: 'fullDemoView', providedIn: 'toProvide' },
  function* () {
    const nextId = yield* craftPrivate(state('nextId', 3, ({ state, update }) => ({
      take: function* () {
        const _state = yield* state();
        const id = _state;
        yield* update((value) => value + 1);
        return id;
      },
    })));
    const records = yield* craftPrivate(state(
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
    ));
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
    yield* mutation('removeTodo', {
      method: (id: number) => id,
      loader: function* ({ params: id }) {
        yield* records.remove(id);
        yield* todos.call(undefined);
        return id;
      },
    });
    yield* state(
      'titleForm',
      '',
      insertForm(
        insertFormAttributes(() => ({ validators: [cRequired()] })),
        insertFormSubmit(addTodo),
      ),
    );
  },
);

const FullDemo = craftComponent(
  'FullDemo',
  {
    providers: [provideFullDemoView()],
  },
  () => div({ class: example.page }, [
        heading({ class: example.title }, [
          'Full primitives demo ',
          StatusComponent({ status: FullDemoView.todos.status }),
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
              yield* FullDemoView.titleForm.form.submit();
            },
          },
          [
            input('TodoNameToAddInput', {
              class: example.input,
              type: 'text',
              placeholder: 'New todo',
            }).pipe(CraftFieldDirective(FullDemoView.titleForm.form)),
            button(
              'AddTodoButton',
              {
                class: example.button,
                'data-exampleButton': 'primary',
                type: 'submit',
                disabled: FullDemoView.addTodo.isLoading,
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
            FullDemoView.todos.value,
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
                    disabled: FullDemoView.removeTodo.isLoading,
                    *click() {
                      yield* FullDemoView.removeTodo.mutate((yield* todo()).id);
                    },
                  },
                  'Remove',
                ),
              ]),
          ),
        ),
      ]),
);

export default FullDemo;

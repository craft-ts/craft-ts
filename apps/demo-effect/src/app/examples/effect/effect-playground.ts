import {
  button,
  craftComponent,
  div,
  forNode,
  heading,
  ifNode,
  input,
  p,
  span,
} from '@craft-ts/component';
import {
  craftService,
  craftPipe,
  craftMethod,
  insertReactOnMutation,
  state,
  craftExpose,
} from '@craft-ts/core';
import { mutationEffect, queryEffect } from '@craft-ts/effect';
import { Effect } from 'effect';
import {
  type TodoNotFound,
  TodoStore,
  type EffectTodo,
} from './effect-playground-domain';
import { example } from '../../effect-demo.style';

const TODO_ICONS: Readonly<Record<string, string>> = {
  false: '⬜',
  true: '✅',
};

/** `data-exampleTodo` for a todo: the `done` state, or no attribute. */
const TODO_STATE: Readonly<Record<string, 'done' | null>> = {
  false: null,
  true: 'done',
};

export const { EffectPlaygroundView, provideEffectPlaygroundView } = craftService(
  { name: 'effectPlaygroundView', providedIn: 'toProvide' },
  function* () {
    const addTodo = yield* mutationEffect<
      'addTodo',
      string,
      string,
      EffectTodo,
      never,
      TodoStore
    >('addTodo', {
      method: (title: string) => title.trim(),
      loader: ({ params }) =>
        Effect.gen(function* () {
          const { add } = yield* TodoStore;
          return yield* add(params);
        }),
    });
    const toggleTodoMutation = yield* mutationEffect<
      'toggleTodoMutation',
      number,
      number,
      EffectTodo,
      TodoNotFound,
      TodoStore
    >('toggleTodoMutation', {
      method: (id: number) => id,
      loader: ({ params }) =>
        Effect.gen(function* () {
          const { toggle } = yield* TodoStore;
          return yield* toggle(params);
        }),
    });
    const removeTodoMutation = yield* mutationEffect<
      'removeTodoMutation',
      number,
      number,
      EffectTodo,
      TodoNotFound,
      TodoStore
    >('removeTodoMutation', {
      method: (id: number) => id,
      loader: ({ params }) =>
        Effect.gen(function* () {
          const { remove } = yield* TodoStore;
          return yield* remove(params);
        }),
    });
    yield* queryEffect(
      'todosQuery',
      {
        params: () => 'all',
        loader: () =>
          Effect.gen(function* () {
            const { list } = yield* TodoStore;
            return yield* list;
          }),
      },
      (context) =>
        craftPipe(
          context,
          (nextContext) =>
            craftPipe(
              nextContext,
              insertReactOnMutation(addTodo, {
                reload: { onMutationResolved: true },
              }),
              insertReactOnMutation(toggleTodoMutation, {
                reload: { onMutationResolved: true },
              }),
            ),
          (nextContext) =>
            insertReactOnMutation(removeTodoMutation, {
              reload: { onMutationResolved: true },
            })(nextContext),
        ),
    );
    const titleInput = yield* state('titleInput', '', ({ set }) => ({
      setTitle: (value: string) => set(value),
      clearTitle: () => set(''),
    }));
    const add = yield* craftMethod('add', function* () {
      const title = (yield* titleInput()).trim();
      if (!title) return;
      yield* addTodo.mutate(title);
      yield* titleInput.clearTitle();
    });

    yield* craftExpose('setTitle', titleInput.setTitle);
  },
);

const EffectPlaygroundComponent = craftComponent(
  'EffectPlaygroundComponent',
  {
    providers: [provideEffectPlaygroundView()],
  },
  function* () {
    const {
      add,
      addTodo,
      removeTodoMutation,
      titleInput,
      toggleTodoMutation,
      todosQuery,
      setTitle,
    } = yield* EffectPlaygroundView();
    return div({ class: example.card, 'data-exampleTint': 'sky' }, [
      heading({ class: example.title }, 'Effect Playground'),
      p(
        { class: example.intro },
        'A small todo sandbox where the domain operations are Effects and Craft manages the query and mutation lifecycles.',
      ),
      div({ class: example.addForm }, [
        input('title', {
          class: example.input,
          type: 'text',
          placeholder: 'New todo title…',
          value: titleInput,
          *input(event) {
            yield* setTitle(event.target.value);
          },
          *keydown(event) {
            if (event.key === 'Enter') add();
          },
        }),
        button(
          'add',
          {
            class: example.button,
            type: 'button',
            disabled: addTodo.isLoading,
            click: add,
          },
          ifNode(
            addTodo.isLoading,
            () => 'Adding…',
            () => 'Add',
          ),
        ),
      ]),
      ifNode(
        todosQuery.isLoading,
        () => p({ class: example.status }, 'Loading todos…'),
        () =>
          p({ class: example.status }, 'The list is loaded by queryEffect.'),
      ),
      div(
        { class: example.list },
        forNode(
          todosQuery.value,
          { track: (todo) => todo.id, empty: () => p('No todos yet.') },
          (todo) =>
            div(
              {
                class: example.todo,
              },
              [
                button(
                  'toggle',
                  {
                    class: example.button,
                    'data-exampleButton': 'ghost',
                    type: 'button',
                    disabled: toggleTodoMutation.isLoading,
                    'aria-label': function* () {
                      return `Toggle ${(yield* todo()).title}`;
                    },
                    *click() {
                      yield* toggleTodoMutation.mutate((yield* todo()).id);
                    },
                  },
                  function* () {
                    return TODO_ICONS[String((yield* todo()).completed)];
                  },
                ),
                span(
                  {
                    class: example.todoTitle,
                    'data-exampleTodo': function* () {
                      return TODO_STATE[String((yield* todo()).completed)];
                    },
                  },
                  function* () {
                    return (yield* todo()).title;
                  },
                ),
                button(
                  'delete',
                  {
                    class: example.button,
                    'data-exampleButton': 'ghost',
                    type: 'button',
                    disabled: removeTodoMutation.isLoading,
                    'aria-label': function* () {
                      return `Delete ${(yield* todo()).title}`;
                    },
                    *click() {
                      yield* removeTodoMutation.mutate((yield* todo()).id);
                    },
                  },
                  '🗑️',
                ),
              ],
            ),
        ),
      ),
      p({ class: example.note }, [
        'The page combines ',
        span({ class: example.mono }, 'queryEffect'),
        ', ',
        span({ class: example.mono }, 'mutationEffect'),
        ', and a route-provided ',
        span({ class: example.mono }, 'TodoStore'),
        ' Layer. Craft invalidates the list after each successful Effect mutation.',
      ]),
    ]);
  },
);

export default EffectPlaygroundComponent;

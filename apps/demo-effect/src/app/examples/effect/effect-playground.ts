/* eslint-disable craft-ts/no-hardcoded-design-values -- Playground UI is intentionally self-contained. */
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
  craftPipe,
  craftMethod,
  insertReactOnMutation,
  state,
} from '@craft-ts/core';
import { mutationEffect, queryEffect } from '@craft-ts/effect';
import { Effect } from 'effect';
import {
  type TodoNotFound,
  TodoStore,
  type EffectTodo,
} from './effect-playground-domain';

const TODO_ICONS: Readonly<Record<string, string>> = {
  false: '⬜',
  true: '✅',
};

const EffectPlaygroundComponent = craftComponent(
  'EffectPlaygroundComponent',
  {
    styles: `
      :scope { display: block; max-width: 720px; margin: 2rem auto; padding: 1.5rem; border: 1px solid #bae6fd; border-radius: 12px; color: #0f172a; background: #f0f9ff; }
      :scope h1 { margin: 0 0 0.5rem; color: #0c4a6e; }
      .intro { margin: 0 0 1.25rem; color: #334155; line-height: 1.55; }
      .add-form { display: flex; gap: 0.5rem; margin-bottom: 1.25rem; }
      .add-form input { flex: 1; min-width: 0; padding: 0.55rem 0.7rem; border: 1px solid #7dd3fc; border-radius: 6px; background: #fff; }
      button { padding: 0.5rem 0.8rem; border: 1px solid #7dd3fc; border-radius: 6px; color: #0c4a6e; background: #fff; cursor: pointer; }
      button:hover { background: #e0f2fe; }
      button:disabled { cursor: wait; opacity: 0.6; }
      .list { display: flex; flex-direction: column; gap: 0.5rem; }
      .todo-item { display: flex; align-items: center; gap: 0.6rem; padding: 0.65rem 0.75rem; border: 1px solid #bae6fd; border-radius: 8px; background: #fff; }
      .todo-item.completed .title { color: #94a3b8; text-decoration: line-through; }
      .title { flex: 1; }
      .toggle, .delete { border: 0; background: transparent; padding: 0.2rem; font-size: 1.05rem; }
      .status { margin: 0 0 0.65rem; color: #64748b; font-size: 0.85rem; }
      .note { margin-top: 1.25rem; color: #475569; font-size: 0.85rem; line-height: 1.55; }
      .mono { padding: 0.05rem 0.3rem; border-radius: 3px; background: #e0f2fe; font-family: ui-monospace, monospace; font-size: 0.8rem; }
      button:focus-visible, input:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
    `,
  },
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
      'toggleTodo',
      number,
      number,
      EffectTodo,
      TodoNotFound,
      TodoStore
    >('toggleTodo', {
      method: (id: number) => id,
      loader: ({ params }) =>
        Effect.gen(function* () {
          const { toggle } = yield* TodoStore;
          return yield* toggle(params);
        }),
    });
    const removeTodoMutation = yield* mutationEffect<
      'removeTodo',
      number,
      number,
      EffectTodo,
      TodoNotFound,
      TodoStore
    >('removeTodo', {
      method: (id: number) => id,
      loader: ({ params }) =>
        Effect.gen(function* () {
          const { remove } = yield* TodoStore;
          return yield* remove(params);
        }),
    });
    const todosQuery = yield* queryEffect(
      'todos',
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
    const add = craftMethod('add', function* () {
      const title = (yield* titleInput()).trim();
      if (!title) return;
      yield* addTodo.mutate(title);
      yield* titleInput.clearTitle();
    });

    return {
      add,
      addTodo,
      removeTodoMutation,
      titleInput,
      toggleTodoMutation,
      todosQuery,
      setTitle: titleInput.setTitle,
    };
  },
  ({
    add,
    addTodo,
    removeTodoMutation,
    titleInput,
    toggleTodoMutation,
    todosQuery,
    setTitle,
  }) =>
    div([
      heading('Effect Playground'),
      p(
        { class: 'intro' },
        'A small todo sandbox where the domain operations are Effects and Craft manages the query and mutation lifecycles.',
      ),
      div({ class: 'add-form' }, [
        input('title', {
          type: 'text',
          placeholder: 'New todo title…',
          value: titleInput,
          *input(event) {
            yield* setTitle(event.target.value);
          },
          *keydown(event) {
            if (event.key === 'Enter') yield* add();
          },
        }),
        button(
          'add',
          {
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
        () => p({ class: 'status' }, 'Loading todos…'),
        () => p({ class: 'status' }, 'The list is loaded by queryEffect.'),
      ),
      div(
        { class: 'list' },
        forNode(
          todosQuery.value,
          { track: (todo) => todo.id, empty: () => p('No todos yet.') },
          (todo) =>
            div(
              {
                class: function* () {
                  return {
                    'todo-item': true,
                    completed: (yield* todo()).completed,
                  };
                },
              },
              [
                button(
                  'toggle',
                  {
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
                span({ class: 'title' }, function* () {
                  return (yield* todo()).title;
                }),
                button(
                  'delete',
                  {
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
      p({ class: 'note' }, [
        'The page combines ',
        span({ class: 'mono' }, 'queryEffect'),
        ', ',
        span({ class: 'mono' }, 'mutationEffect'),
        ', and a route-provided ',
        span({ class: 'mono' }, 'TodoStore'),
        ' Layer. Craft invalidates the list after each successful Effect mutation.',
      ]),
    ]),
);

export default EffectPlaygroundComponent;

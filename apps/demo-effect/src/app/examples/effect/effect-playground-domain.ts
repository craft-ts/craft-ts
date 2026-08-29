import { Context, Effect, Layer } from 'effect';
import { effectService } from '@craft-ts/effect';

export type EffectTodo = {
  readonly id: number;
  readonly title: string;
  readonly completed: boolean;
};

type TodoStoreShape = {
  readonly list: () => Effect.Effect<readonly EffectTodo[]>;
  readonly add: (title: string) => Effect.Effect<EffectTodo>;
  readonly toggle: (id: number) => Effect.Effect<EffectTodo>;
  readonly remove: (id: number) => Effect.Effect<EffectTodo>;
};

export class TodoStore extends Context.Service<TodoStore, TodoStoreShape>()(
  'demo-effect/TodoStore',
) {}

const INITIAL_TODOS: readonly EffectTodo[] = [
  { id: 1, title: 'Learn @craft-ts/effect', completed: false },
  { id: 2, title: 'Build an Effect playground', completed: true },
  { id: 3, title: 'Share it on StackBlitz', completed: false },
];

/** A local Effect service keeps the playground executable without a backend. */
export const TodoStoreLive = Layer.sync(TodoStore)(() => {
  const todos = INITIAL_TODOS.map((todo) => ({ ...todo }));
  let nextId = todos.length + 1;

  return {
    list: Effect.fnUntraced(function* () {
      yield* Effect.sleep('250 millis');
      return todos.map((todo) => ({ ...todo }));
    }),
    add: Effect.fnUntraced(function* (title: string) {
      yield* Effect.sleep('350 millis');
      const todo = {
        id: nextId++,
        title,
        completed: false,
      } satisfies EffectTodo;
      todos.push(todo);
      return { ...todo };
    }),
    toggle: Effect.fnUntraced(function* (id: number) {
      yield* Effect.sleep('250 millis');
      const todo = todos.find((candidate) => candidate.id === id);
      if (!todo) return yield* Effect.die(new Error(`Todo ${id} not found`));
      todo.completed = !todo.completed;
      return { ...todo };
    }),
    remove: Effect.fnUntraced(function* (id: number) {
      yield* Effect.sleep('250 millis');
      const index = todos.findIndex((candidate) => candidate.id === id);
      const [removed] = todos.splice(index, 1);
      if (!removed) return yield* Effect.die(new Error(`Todo ${id} not found`));
      return { ...removed };
    }),
  } satisfies TodoStoreShape;
});

export const listTodos = Effect.fnUntraced(function* () {
  const { list } = yield* effectService(TodoStore, ({ list }) => ({ list }));
  return yield* list();
});

export const createTodo = Effect.fnUntraced(function* (title: string) {
  const { add } = yield* effectService(TodoStore, ({ add }) => ({ add }));
  return yield* add(title);
});

export const toggleTodo = Effect.fnUntraced(function* (id: number) {
  const { toggle } = yield* effectService(TodoStore, ({ toggle }) => ({
    toggle,
  }));
  return yield* toggle(id);
});

export const removeTodo = Effect.fnUntraced(function* (id: number) {
  const { remove } = yield* effectService(TodoStore, ({ remove }) => ({
    remove,
  }));
  return yield* remove(id);
});

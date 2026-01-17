# craftState

Integrate state management into craft stores with automatic signal tracking.

## Import

```typescript
import { craft, craftState, state } from '@ngcraft/core';
```

## Basic Pattern

```typescript
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftState('counter', () => state(0)),
);

const store = injectCraft();

// Access state
console.log(store.counter()); // 0
```

## With Methods

```typescript
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftState('counter', () =>
    state(0, ({ set, update, state }) => ({
      increment: () => update((current) => current + 1),
      decrement: () => update((current) => current - 1),
      reset: () => set(0),
    })),
  ),
);

const store = injectCraft();

// Access state
console.log(store.counter()); // 0

// Use methods (suffixed with state name)
store.counterIncrement();
console.log(store.counter()); // 1

store.counterDecrement();
console.log(store.counter()); // 0

store.counterReset();
```

## With Computed Values

```typescript
import { computed } from '@angular/core';

const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftState('todos', () =>
    state([] as Todo[], ({ set, update, state }) => ({
      addTodo: (todo: Todo) => {
        update((todos) => [...todos, todo]);
      },
      removeTodo: (id: string) => {
        update((todos) => todos.filter((t) => t.id !== id));
      },
      // Computed values
      count: computed(() => state().length),
      completed: computed(() => state().filter((t) => t.completed).length),
    })),
  ),
);

const store = injectCraft();

// Access state and computed values
console.log(store.todos()); // []
console.log(store.todosCount()); // 0
console.log(store.todosCompleted()); // 0

// Use methods
store.todosAddTodo({ id: '1', title: 'Learn NgCraft', completed: false });
console.log(store.todosCount()); // 1
```

## Reacting to Sources

```typescript
import { source, afterRecomputation } from '@ngcraft/core';

const globalReset = source<{}>();

const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftSources({
    localReset: source<string>(),
  }),
  craftState('items', ({ localReset }) =>
    state([1, 2, 3], ({ set, state }) => ({
      addItem: (item: number) => {
        set([...state(), item]);
      },
      // React to local source (not exposed as method)
      localResetHandler: afterRecomputation(localReset, () => {
        set([]);
      }),
      // React to global source (not exposed as method)
      globalResetHandler: afterRecomputation(globalReset, () => {
        set([42]);
      }),
    })),
  ),
);

const store = injectCraft();

// Use methods
store.itemsAddItem(4);
console.log(store.items()); // [1, 2, 3, 4]

// Trigger local reset via source
store.setLocalReset('reset');
console.log(store.items()); // []

// Trigger global reset via source
globalReset.set({});
console.log(store.items()); // [42]
```

## Complex State

```typescript
interface UserState {
  profile: UserProfile | null;
  preferences: UserPreferences;
}

const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftState('user', () =>
    state<UserState>(
      {
        profile: null,
        preferences: { theme: 'light', language: 'en' },
      },
      ({ set, update, state }) => ({
        setProfile: (profile: UserProfile) => {
          update((current) => ({ ...current, profile }));
        },
        updatePreferences: (prefs: Partial<UserPreferences>) => {
          update((current) => ({
            ...current,
            preferences: { ...current.preferences, ...prefs },
          }));
        },
      }),
    ),
  ),
);

const store = injectCraft();

console.log(store.user().profile); // null
store.userSetProfile({ id: '1', name: 'John' });
store.userUpdatePreferences({ theme: 'dark' });
```

For detailed documentation, see [state primitive](/primitives/state).

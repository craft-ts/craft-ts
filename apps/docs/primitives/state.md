# state

The `state` primitive creates a Signal-based state with optional insertions for adding methods and computed properties.

## Import

```typescript
import { state } from '@craft-ng/core';
```

## Basic Examples

### Simple state with a primitive value

```typescript
const counter = state(0);
console.log(counter()); // 0
```

### State with a linkedSignal

```typescript
import { signal, linkedSignal } from '@angular/core';

const origin = signal(5);
const doubled = state(linkedSignal(() => origin() * 2));
console.log(doubled()); // 10
```

### State with insertions to add methods

```typescript
import { signal, linkedSignal, computed } from '@angular/core';

const origin = signal(5);
const counter = state(
  linkedSignal(() => origin() * 2),
  ({ update, set }) => ({
    increment: () => update((current) => current + 1),
    reset: () => set(0),
  }),
);

console.log(counter()); // 10
counter.increment();
console.log(counter()); // 11
counter.reset();
console.log(counter()); // 0
```

### State with multiple insertions (methods and computed properties)

```typescript
import { signal, linkedSignal, computed } from '@angular/core';

const origin = signal(5);
const counter = state(
  linkedSignal(() => origin() * 2),
  ({ update, set }) => ({
    increment: () => update((current) => current + 1),
    reset: () => set(0),
  }),
  ({ state }) => ({
    isOdd: computed(() => state() % 2 === 1),
  }),
);

console.log(counter()); // 10
console.log(counter.isOdd()); // false
counter.increment();
console.log(counter()); // 11
console.log(counter.isOdd()); // true
```

### State with source binding

Methods bound to sources using `on$` are not exposed on the state, they only work internally:

```typescript
const sourceSignal = source$<number>();
const myState = state(0, ({ set }) => ({
  setValue: on$(sourceSignal, (value) => set(value)),
  reset: () => set(0),
}));

console.log(myState()); // 0
// Note: setValue is not exposed on myState, only used internally
sourceSignal.emit(34);
console.log(myState()); // 34
myState.reset();
console.log(myState()); // 0
```

## Parallel States

You can generate multiple state instances in parallel with a single `state(...)` declaration.

### 1) Parallel state with `method` + `state`

```typescript
const todosById = state(
  {
    method: (id: number) => id,
    state: ({ params: id }) => ({ id, done: false }),
  },
  ({ stateById }) => ({
    toggle: (id: number) =>
      stateById.select(id)?.update((todo) => ({ ...todo, done: !todo.done })),
  }),
);

todosById.create(1);
console.log(todosById.select(1)); // { id: 1, done: false }
todosById.toggle(1);
console.log(todosById.select(1)); // { id: 1, done: true }
```

### 2) Parallel state from `params` signal

```typescript
const currentId = signal(0);
const itemById = state({
  params: currentId,
  identifier: (id) => id,
  state: ({ params: id }) => ({ id, selected: false }),
});

console.log(itemById(0)); // { id: 0, selected: false }
currentId.set(1);
console.log(itemById(1)); // { id: 1, selected: false }
```

### 3) Parallel state from `from` signal (array/object)

```typescript
const ids = signal([0, 1, 2]);
const rows = state({
  from: ids,
  identifier: ({ index }) => index,
  state: ({ params: { index } }) => ({ index, active: false }),
});

console.log(rows(0)); // { index: 0, active: false }
```

## Typing Note

For better TypeScript inference, pass Angular `Signal` values (`signal`, `linkedSignal`) rather than manually widening to `WritableSignal`.

This avoids overload inference limitations in complex generic calls.

## Best Practices

✅ **Use TypeScript inference** - Let TypeScript infer types when possible
✅ **Keep state granular** - Create focused state slices
✅ **Use computed for derived state** - Don't duplicate state
✅ **Use insertions** - Add custom methods and computed properties to extend functionality

## See Also

- [AsyncProcess](/primitives/async-process) - For async operations
- [Store](/store/craft) - For composing multiple states
- [Insertions](/insertions/insert-local-storage) - For enhancing state behavior

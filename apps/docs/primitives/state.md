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

### State with a computed

```typescript
import { signal, computed } from '@angular/core';

const origin = signal(5);
const doubled = state(computed(() => origin() * 2));
console.log(doubled()); // 10
```

### State with insertions to add methods (Method-based)

```typescript
import { signal, computed, computed } from '@angular/core';

const origin = signal(5);
const counter = state(
  computed(() => origin() * 2),
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
const origin = signal(5);
const counter = state(
  computed(() => origin() * 2),
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

### State with source binding (Event-based)

Methods bound to sources using `on$` are not exposed on the state, they only work internally:

```typescript
const increment = source$<void>();
const reset = source$<void>();
const myState = state(0, ({ update, set }) => ({
  setValue: on$(increment, () => update((v) => v + 1)),
  reset: () => on$(reset, () => set(0)),
}));

console.log(myState()); // 0
// Note: setValue is not exposed on myState, only used internally
increment.emit();
console.log(myState()); // 34
reset.emit();
console.log(myState()); // 0
```

## Best Practices

✅ **Use TypeScript inference** - Let TypeScript infer types when possible
✅ **Keep state granular** - Create focused state slices
✅ **Use computed for derived state** - Don't duplicate state
✅ **Use insertions** - Add custom methods and computed properties to extend functionality

## See Also

- [AsyncProcess](/primitives/async-process) - For async operations
- [Store](/store/craft) - For composing multiple states
- [Insertions](/insertions/insert-local-storage) - For enhancing state behavior

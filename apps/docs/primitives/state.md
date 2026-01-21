# state

The `state` primitive creates a Signal-based state with optional insertions for adding methods and computed properties.

## Import

```typescript
import { state } from '@ng-craft/core';
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

Methods bound to sources using `afterRecomputation` are not exposed on the state, they only work internally:

```typescript
import { source } from '@ng-craft/core';
import { afterRecomputation } from '@ng-craft/core';

const sourceSignal = source<number>();
const myState = state(0, ({ set }) => ({
  setValue: afterRecomputation(sourceSignal, (value) => set(value)),
  reset: () => set(0),
}));

console.log(myState()); // 0
// Note: setValue is not exposed on myState, only used internally
sourceSignal.set(34);
console.log(myState()); // 34
myState.reset();
console.log(myState()); // 0
```

## Best Practices

✅ **Use TypeScript inference** - Let TypeScript infer types when possible
✅ **Keep state granular** - Create focused state slices
✅ **Use computed for derived state** - Don't duplicate state
✅ **Use insertions** - Add custom methods and computed properties to extend functionality

## See Also

- [asyncMethod](/primitives/async-method) - For async operations
- [Store](/store/craft) - For composing multiple states
- [Insertions](/insertions/insert-local-storage) - For enhancing state behavior

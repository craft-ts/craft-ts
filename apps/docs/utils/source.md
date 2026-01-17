# Source

The `Source` concept represents an event stream or data source that can drive state changes.

## Import

```typescript
import { Source } from '@ngcraft/core';
```

## What is a Source?

A Source is a stream of updates that can be connected to state. It follows an event-driven architecture pattern where state reacts to events rather than being directly mutated.

## Basic Concept

```typescript
// Source emits updater functions
type Source<T> = Observable<(state: T) => T>;

// Example: A source that increments a counter
const incrementSource: Source<number> = interval(1000).pipe(
  map(() => (state: number) => state + 1),
);

// Connect source to state
const count = state(0, {
  sources: [incrementSource],
});
```

## Source-Based vs Method-Based

### Method-Based (Imperative)

```typescript
const count = state(0);

function increment() {
  count.update((c) => c + 1);
}

function decrement() {
  count.update((c) => c - 1);
}
```

### Source-Based (Declarative/Event-Driven)

```typescript
const increment$ = new Subject<void>();
const decrement$ = new Subject<void>();

const count = state(0, {
  sources: [
    increment$.pipe(map(() => (s: number) => s + 1)),
    decrement$.pipe(map(() => (s: number) => s - 1)),
  ],
});

// Trigger events
increment$.next();
decrement$.next();
```

## Benefits of Source-Based Approach

✅ **Declarative** - State changes are declared upfront
✅ **Testable** - Sources can be tested independently
✅ **Composable** - Sources can be combined and reused
✅ **Time-travel debugging** - All state changes go through sources
✅ **Event sourcing** - Natural fit for event-driven architecture

## Common Use Cases

### React to External Events

```typescript
import { fromEvent } from 'rxjs';

const clicks = fromEvent(button, 'click');
const clickCount = state(0, {
  sources: [clicks.pipe(map(() => (count: number) => count + 1))],
});
```

### React to Multiple Events

```typescript
const save$ = new Subject<Data>();
const reset$ = new Subject<void>();

const data = state<Data>(initialData, {
  sources: [
    save$.pipe(map((newData) => () => newData)),
    reset$.pipe(map(() => () => initialData)),
  ],
});
```

### Combine Sources

```typescript
const add$ = new Subject<number>();
const multiply$ = new Subject<number>();

const value = state(1, {
  sources: [
    add$.pipe(map((n) => (state: number) => state + n)),
    multiply$.pipe(map((n) => (state: number) => state * n)),
  ],
});
```

## See Also

- [toSource](/utils/to-source) - Convert observables to sources
- [stackedSource](/utils/stacked-source) - Stack multiple sources
- [sourceFromEvent](/utils/source-from-event) - Create sources from DOM events

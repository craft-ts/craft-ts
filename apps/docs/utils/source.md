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

## Limitations

Sources are signals and behave differently from observables. Understanding these key limitations is important:

### Multiple Sets in Same Cycle

When a source is set multiple times during the same cycle (between the first set and the Change Detection that executes all consumer callbacks), consumers will only react once during CD and will only see the last set value. Intermediate values are discarded.

```typescript
const mySource = source<number>();

effect(() => {
  console.log('Value:', mySource());
});

// Within the same cycle:
mySource.set(1); // This value is discarded
mySource.set(2); // This value is discarded
mySource.set(3); // Only this final value triggers the consumer

// Console output: "Value: 3"
// Values 1 and 2 are never seen by consumers
```

### Multiple Sources Order

Within the same cycle, if multiple sources are triggered, consumers cannot determine the order in which the sources were set. The original emission sequence is not preserved.

```typescript
const source1 = source<string>();
const source2 = source<string>();

effect(() => {
  const val1 = source1();
  const val2 = source2();
  console.log('Values:', val1, val2);
});

// Trigger both in specific order:
source1.set('first');
source2.set('second');

// Consumers cannot reliably determine that source1 was set before source2
// Both are processed together during Change Detection
```

### Consumer Execution Order

When multiple sources are triggered in the same cycle, consumer callbacks are invoked in the order they were declared, not in the order their source producers were triggered.

```typescript
const sourceA = source<string>();
const sourceB = source<string>();

// Consumer 1 (declared first)
effect(() => {
  console.log('Consumer 1:', sourceA(), sourceB());
});

// Consumer 2 (declared second)
effect(() => {
  console.log('Consumer 2:', sourceA(), sourceB());
});

// Trigger in specific order:
sourceB.set('B'); // Triggered first
sourceA.set('A'); // Triggered second

// Output follows declaration order, not trigger order:
// "Consumer 1: A B"
// "Consumer 2: A B"
```

## See Also

- [toSource](/utils/to-source) - Convert observables to sources
- [stackedSource](/utils/stacked-source) - Stack multiple sources
- [sourceFromEvent](/utils/source-from-event) - Create sources from DOM events

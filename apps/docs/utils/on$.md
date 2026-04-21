# on$

Subscribes to a source and executes a callback when it emits, with automatic cleanup.

## Overview

`on$` enables reactive side effects by:

- Listening to source emissions and executing callbacks
- Automatically unsubscribing when the injection context is destroyed
- Working with `source$`, `EventEmitter`, and any Observable
- Returning `SourceBranded` to prevent method exposure in state insertions
- Providing a clean way to coordinate state updates with source events

## Signature

```typescript
function on$<State, SourceType>(
  _source: {
    subscribe: EventEmitter<SourceType>['subscribe'];
  },
  callback: (source: SourceType) => State,
): SourceBranded;
```

### Parameters

- **`_source`** - A source, EventEmitter, or Observable to listen to
- **`callback`** - Function executed when the source emits. Receives the emitted value and can perform side effects

### Returns

`SourceBranded` - A branded symbol indicating the method is not exposed on the state/store

## Primary Use Case

Create internal reactive methods in state insertions that respond to sources without being exposed:

```typescript
const myState = state(0, ({ set }) => ({
  // Exposed method
  increment: () => set((v) => v + 1),
  // Internal reactive method (not exposed)
  reset: on$(resetSource$, () => set(0)),
}));

myState.increment(); // ✅ Available
myState.reset(); // ❌ Not available (TypeScript error)
```

## Automatic Cleanup

`on$` automatically unsubscribes from the source when the Angular injection context is destroyed, preventing memory leaks.

## Common Patterns

- **State reset**: `on$(resetSource, () => set(initialValue))` - reset state on source emission
- **State synchronization**: `on$(source, (value) => set(value))` - sync state with source
- **Multi-state coordination**: Multiple states can use `on$` with the same source
- **Conditional updates**: `on$(source, (value) => { if(condition) set(value) })` - conditional state changes

## Examples

### Basic state reset on source emission

```typescript
import { state, source$ } from '@craft-ng/core';
import { on$ } from '@craft-ng/core';

const resetSource = source$<void>();

const counter = state(0, ({ set, update }) => ({
  // Exposed methods
  increment: () => update((v) => v + 1),
  decrement: () => update((v) => v - 1),
  // Internal: resets when resetSource emits
  reset: on$(resetSource, () => set(0)),
}));

console.log(counter()); // 0
counter.increment();
console.log(counter()); // 1

resetSource.emit(); // Triggers reset
console.log(counter()); // 0

// counter.reset() ❌ TypeScript error - not exposed
```

### Syncing state with a source

```typescript
import { state, source$ } from '@craft-ng/core';
import { on$ } from '@craft-ng/core';

interface User {
  id: string;
  name: string;
}

const userUpdateSource = source$<User>();

const currentUser = state(null as User | null, ({ set }) => ({
  // Exposed method
  clear: () => set(null),
  // Internal: updates when source emits
  syncFromSource: on$(userUpdateSource, (user) => set(user)),
}));

console.log(currentUser()); // null

userUpdateSource.emit({ id: '1', name: 'Alice' });
console.log(currentUser()); // { id: '1', name: 'Alice' }

userUpdateSource.emit({ id: '2', name: 'Bob' });
console.log(currentUser()); // { id: '2', name: 'Bob' }
```

### Coordinating multiple states with a single source

```typescript
import { state, source$ } from '@craft-ng/core';
import { on$ } from '@craft-ng/core';

const resetAllSource = source$<void>();

const search = state('', ({ set, update }) => ({
  set,
  clear: () => set(''),
  // Reset when resetAllSource emits
  resetOnSignal: on$(resetAllSource, () => set('')),
}));

const page = state(1, ({ set, update }) => ({
  next: () => update((v) => v + 1),
  previous: () => update((v) => Math.max(1, v - 1)),
  // Reset when resetAllSource emits
  resetOnSignal: on$(resetAllSource, () => set(1)),
}));

const filters = state([] as string[], ({ set }) => ({
  add: (filter: string) => set((current) => [...current, filter]),
  // Reset when resetAllSource emits
  resetOnSignal: on$(resetAllSource, () => set([])),
}));

// Set some values
search.set('angular');
page.next();
page.next();
filters.add('tutorial');
filters.add('advanced');

console.log(search()); // 'angular'
console.log(page()); // 3
console.log(filters()); // ['tutorial', 'advanced']

// Reset all states at once
resetAllSource.emit();

console.log(search()); // ''
console.log(page()); // 1
console.log(filters()); // []
```

### Using on$ in a craft service

```typescript
import { craftService, state, source$ } from '@craft-ng/core';
import { on$ } from '@craft-ng/core';

const { injectFilters } = craftService(
  { name: 'Filters', scope: 'global' },
  () => {
    const reset = source$<void>();
    const search = state('', ({ set }) => ({
      set,
      // Internal: reset on source emission
      handleReset: on$(reset, () => set('')),
    }));
    const category = state('all', ({ set }) => ({
      set,
      // Internal: reset on source emission
      handleReset: on$(reset, () => set('all')),
    }));

    return {
      search,
      category,
      resetFilters: () => reset.emit(),
    };
  },
);

const filters = injectFilters();

filters.search.set('angular');
filters.category.set('frameworks');

console.log(filters.search()); // 'angular'
console.log(filters.category()); // 'frameworks'

// Reset all filters
filters.resetFilters();

console.log(filters.search()); // ''
console.log(filters.category()); // 'all'
```

### Conditional state updates

```typescript
import { state, source$ } from '@craft-ng/core';
import { on$ } from '@craft-ng/core';

interface DataUpdate {
  value: number;
  force?: boolean;
}

const dataSource = source$<DataUpdate>();

const data = state(0, ({ state, set }) => ({
  // Exposed methods
  setValue: (value: number) => set(value),
  // Internal: conditionally update based on source data
  handleUpdate: on$(dataSource, (update) => {
    // Only update if value is higher or force flag is set
    if (update.force || update.value > state()) {
      set(update.value);
    }
  }),
}));

console.log(data()); // 0

dataSource.emit({ value: 10 });
console.log(data()); // 10

dataSource.emit({ value: 5 });
console.log(data()); // 10 (not updated, 5 < 10)

dataSource.emit({ value: 3, force: true });
console.log(data()); // 3 (updated due to force flag)
```

### Working with complex transformations

```typescript
import { state, source$ } from '@craft-ng/core';
import { on$ } from '@craft-ng/core';

interface ApiResponse {
  data: {
    items: Array<{ id: string; value: number }>;
  };
  metadata: {
    total: number;
  };
}

const apiResponseSource = source$<ApiResponse>();

const items = state([] as Array<{ id: string; value: number }>, ({ set }) => ({
  add: (item: { id: string; value: number }) =>
    set((current) => [...current, item]),
  // Internal: extract and set items from API response
  handleApiResponse: on$(apiResponseSource, (response) => {
    set(response.data.items);
  }),
}));

const totalCount = state(0, ({ set }) => ({
  // Internal: extract and set total from API response
  handleApiResponse: on$(apiResponseSource, (response) => {
    set(response.metadata.total);
  }),
}));

apiResponseSource.emit({
  data: {
    items: [
      { id: '1', value: 100 },
      { id: '2', value: 200 },
    ],
  },
  metadata: {
    total: 2,
  },
});

console.log(items()); // [{ id: '1', value: 100 }, { id: '2', value: 200 }]
console.log(totalCount()); // 2
```

### Using with EventEmitter

```typescript
import { EventEmitter } from '@angular/core';
import { state } from '@craft-ng/core';
import { on$ } from '@craft-ng/core';

const clickEmitter = new EventEmitter<{ x: number; y: number }>();

const lastClick = state(null as { x: number; y: number } | null, ({ set }) => ({
  clear: () => set(null),
  // Internal: update on emitter events
  handleClick: on$(clickEmitter, (position) => set(position)),
}));

clickEmitter.emit({ x: 100, y: 200 });
console.log(lastClick()); // { x: 100, y: 200 }

clickEmitter.emit({ x: 150, y: 250 });
console.log(lastClick()); // { x: 150, y: 250 }
```

## Best Practices

✅ **Use for internal state coordination** - Perfect for state updates that shouldn't be exposed as methods
✅ **Coordinate multiple states** - Use the same source with multiple `on$` calls across different states
✅ **Keep callbacks simple** - Focus on state updates, avoid heavy computation
✅ **Leverage automatic cleanup** - No need to manually unsubscribe
✅ **Prefer for side effects** - Use `on$` for actions, `afterRecomputation` for transformations

❌ **Don't expose complex logic** - Keep the callback focused on state changes
❌ **Don't use for query/mutation params** - Use `afterRecomputation` instead
❌ **Don't chain multiple on$ calls** - Keep it simple and flat

## Related

- [`source$`](/utils/source$) - Create reactive sources
- [`afterRecomputation`](/utils/after-recomputation) - Transform sources for method parameters
- [`state`](/primitives/state) - Create reactive state with insertions
- [`craftService`](/store/craft-service) - Organize coordinated states inside reusable services

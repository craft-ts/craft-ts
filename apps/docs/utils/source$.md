# source$

Creates an event emitter with automatic cleanup and signal-based value tracking.

## Overview

`source$` provides a lightweight event streaming solution that combines:

- Event emission and subscription capabilities
- Automatic subscription cleanup via `DestroyRef`
- Signal-based value tracking for reactive access
- Optional last value preservation for late subscribers
- Read-only variants for encapsulation

## Import

```typescript
import { source$ } from '@craft-ng/core';
```

## Signature

```typescript
function source$<T>(): Source$<T>;
```

### Returns

`Source$<T>` - An object with the following methods and properties:

- **`emit(value: T)`** - Emits a value to all subscribers and updates the internal signal
- **`subscribe(callback: (value: T) => void)`** - Subscribes to emissions with a callback
- **`value: Signal<T | undefined>`** - A read-only signal containing the last emitted value (or `undefined` if no value has been emitted)
- **`asReadonly()`** - Returns a read-only version of the source (only `subscribe` and `value`)
- **`preserveLastValue()`** - Returns a source variant that immediately emits the last value to new subscribers

## Types

### Source$

```typescript
type Source$<T> = {
  emit: (value: T) => void;
  subscribe: (callback: (value: T) => void) => Subscription;
  value: Signal<T | undefined>;
  asReadonly: () => ReadonlySource$<T>;
  preserveLastValue: () => {
    emit: (value: T) => void;
    subscribe: (callback: (value: T) => void) => void;
    value: Signal<T | undefined>;
    asReadonly: () => {
      subscribe: (callback: (value: T) => void) => void;
      value: Signal<T | undefined>;
    };
  };
};
```

### ReadonlySource$

```typescript
type ReadonlySource$<T> = {
  subscribe: (callback: (value: T) => void) => Subscription;
  value: Signal<T | undefined>;
};
```

## Key Features

### Automatic Cleanup

Subscriptions are automatically cleaned up when the injection context is destroyed, preventing memory leaks:

```typescript
const userAction$ = source$<string>();

// Subscription is automatically unsubscribed on component destruction
userAction$.subscribe((action) => console.log(action));
```

### Signal Integration

The `value` property provides reactive access to the last emitted value:

```typescript
const message$ = source$<string>();

message$.emit('Hello');
console.log(message$.value()); // 'Hello'

// Use in templates or computed signals
const uppercased = computed(() => message$.value()?.toUpperCase());
```

### Last Value Preservation

Use `preserveLastValue()` to ensure late subscribers receive the most recent value:

```typescript
const counter$ = source$<number>();
counter$.emit(42);

// Standard source: late subscriber receives nothing
counter$.subscribe((v) => console.log('Standard:', v)); // Only future values

// With preserveLastValue: late subscriber gets the last value immediately
const preserved$ = counter$.preserveLastValue();
preserved$.subscribe((v) => console.log('Preserved:', v)); // Logs: Preserved: 42
```

## Common Patterns

### Event Broadcasting

```typescript
const buttonClick$ = source$<MouseEvent>();

// Multiple subscribers
buttonClick$.subscribe((event) => console.log('Logger:', event));
buttonClick$.subscribe((event) => trackEvent('button_click'));

// Emit events
button.addEventListener('click', (e) => buttonClick$.emit(e));
```

### Read-Only Access

```typescript
class DataService {
  private dataUpdated$ = source$<Data>();

  // Expose read-only version
  readonly dataUpdated = this.dataUpdated$.asReadonly();

  updateData(data: Data) {
    this.dataUpdated$.emit(data);
  }
}
```

### Coordination with State

```typescript
const resetTrigger$ = source$<void>();

const counter = state(0, ({ set, update }) => ({
  increment: () => update((v) => v + 1),
  decrement: () => update((v) => v - 1),
  // Reset when source emits
  reset: on$(resetTrigger$, () => set(0)),
}));
```

## Examples

### Basic Usage with on$

```typescript
import { source$, state, on$ } from '@craft-ng/core';
import { Component } from '@angular/core';

@Component({
  selector: 'app-counter',
  template: `
    <p>Count: {{ counter() }}</p>
    <button (click)="counter.increment()">+1</button>
    <button (click)="counter.decrement()">-1</button>
    <button (click)="reset$.emit()">Reset</button>
  `,
  standalone: true,
})
export class CounterComponent {
  // Create a source for reset events
  reset$ = source$<void>();

  // Create state with automatic reset on source emission
  counter = state(0, ({ set, update }) => ({
    increment: () => update((v) => v + 1),
    decrement: () => update((v) => v - 1),
    // Internal method: listens to reset$ and sets counter to 0
    // Not exposed on the state object (thanks to on$)
    reset: on$(this.reset$, () => set(0)),
  }));
}
```

### Multi-Source Coordination

```typescript
import { source$, state, on$ } from '@craft-ng/core';

// Multiple sources for different events
const userLogin$ = source$<User>();
const userLogout$ = source$<void>();

const authState = state<User | null>(null, ({ set }) => ({
  // Respond to multiple sources
  onLogin: on$(userLogin$, (user) => set(user)),
  onLogout: on$(userLogout$, () => set(null)),
}));

// Trigger events
userLogin$.emit({ id: 1, name: 'Alice' });
console.log(authState()); // { id: 1, name: 'Alice' }

userLogout$.emit();
console.log(authState()); // null
```

### Late Subscriber Pattern

```typescript
import { source$ } from '@craft-ng/core';

const notifications$ = source$<string>().preserveLastValue();

// Emit before any subscribers
notifications$.emit('Server started');
notifications$.emit('Database connected');

// Late subscriber receives the last value immediately
setTimeout(() => {
  notifications$.subscribe((msg) => {
    console.log('Late subscriber:', msg); // Logs: Late subscriber: Database connected
  });
}, 1000);
```

## Related

- [on$](on$.md) - Subscribe to sources with automatic cleanup in state insertions

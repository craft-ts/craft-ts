# source$

An event source: something you `emit()` to, that others react to — with
automatic cleanup and signal-based value tracking.

**Use it when** several independent pieces of state must react to one event: a
"reset everything" action, a refresh trigger, a cross-cutting notification.
**Not for** a direct call from A to B — that is just a method.

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
function source$<T>(name: string): Source$<T>;
```

### Parameters

- **`name: string`** - Name matching the variable/property this source is assigned to. Used for host tagging and dev-tools snapshot reporting, consistent with `craftComputed`/`craftEffect`. The [`craft-ng/craft-source-name-match`](/guide/routing/eslint-rules) ESLint rule enforces the match and offers a quick fix.

### Returns

`Source$<T>` is directly usable as a source and can also be consumed with
`yield*`:

```typescript
// Direct source API
const source = source$<void>('reset$');
source.emit();

// Yieldable primitive API
const reset$ = yield* source$<void>('reset$');
```

The yielded value is the source instance. Its source API is unchanged:

- **`emit(value: T)`** - Emits a value to all subscribers and updates the internal signal
- **`subscribe(callback: (value: T) => void)`** - Subscribes to emissions with a callback
- **`value: Signal<T | undefined>`** - A read-only signal containing the last emitted value (or `undefined` if no value has been emitted)
- **`asReadonly()`** - Returns a read-only version of the source (only `subscribe` and `value`)
- **`preserveLastValue()`** - Returns a source variant that immediately emits the last value to new subscribers

## Types

### Source$

```typescript
type Source$<T> = SourceInstance<T> &
  NamedCraftPrimitiveGen<string, SourceInstance<T>>;

type SourceInstance<T> = {
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

The generator side yields `{ [name]: SourceInstance<T> }`. The source side
keeps the existing `emit`, `subscribe`, `value`, `asReadonly` and
`preserveLastValue` API.

### ReadonlySource$

```typescript
type ReadonlySource$<T> = {
  subscribe: (callback: (value: T) => void) => Subscription;
  value: Signal<T | undefined>;
};
```

## Key Features

### Source services and dependency tracking

Use a `craftService` as the dependency handle when a source is shared by
multiple consumers:

```typescript
const { Reset } = craftService(
  { name: 'Reset', scope: 'global' },
  function* () {
    const reset$ = yield* source$<void>('reset$');
    return reset$;
  },
);

const { Counter } = craftService(
  { name: 'Counter', scope: 'global' },
  function* () {
    const counter = yield* state('counter', 0, ({ set }) => ({
      reset: on$(Reset, () => set(0)),
    }));

    const reset = yield* Reset();
    return { counter, reset };
  },
);
```

`on$(Reset, ...)` records `Reset` as a dependency of the primitive. Calling
`reset.emit()` only publishes an event; it does not create or modify the
dependency graph.

### Automatic Cleanup

Subscriptions are automatically cleaned up when the injection context is destroyed, preventing memory leaks:

```typescript
const userAction$ = source$<string>('userAction$');

// Subscription is automatically unsubscribed on component destruction
userAction$.subscribe((action) => console.log(action));
```

### Signal Integration

The `value` property provides reactive access to the last emitted value:

```typescript
const message$ = source$<string>('message$');

message$.emit('Hello');
console.log(message$.value()); // 'Hello'

// Use in templates or computed signals
const uppercased = computed(() => message$.value()?.toUpperCase());
```

### Last Value Preservation

Use `preserveLastValue()` to ensure late subscribers receive the most recent value:

```typescript
const counter$ = source$<number>('counter$');
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
const buttonClick$ = source$<MouseEvent>('buttonClick$');

// Multiple subscribers
buttonClick$.subscribe((event) => console.log('Logger:', event));
buttonClick$.subscribe((event) => trackEvent('button_click'));

// Emit events
button.addEventListener('click', (e) => buttonClick$.emit(e));
```

### Read-Only Access

```typescript
class DataService {
  private dataUpdated$ = source$<Data>('dataUpdated$');

  // Expose read-only version
  readonly dataUpdated = this.dataUpdated$.asReadonly();

  updateData(data: Data) {
    this.dataUpdated$.emit(data);
  }
}
```

### Coordination with State

```typescript
const resetTrigger$ = source$<void>('resetTrigger$');

const { counter } = state('counter', 0, ({ set, update }) => ({
  increment: () => update((v) => v + 1),
  decrement: () => update((v) => v - 1),
  // Reset when source emits
  reset: on$(resetTrigger$, () => set(0)),
}));
```

## Examples

### Basic Usage with on$

```typescript
import { button, craftComponent, p } from '@craft-ng/component';
import { on$, source$, state } from '@craft-ng/core';

export const Counter = craftComponent(
  'Counter',
  {},
  function* () {
    // a source for reset events
    const reset$ = source$<void>('reset$');

    const counter = yield* state('counter', 0, ({ set, update }) => ({
      increment: () => update((v) => v + 1),
      decrement: () => update((v) => v - 1),
      // internal: listens to reset$ and sets counter to 0.
      // NOT exposed on the ref, because it is bound with on$
      reset: on$(reset$, () => set(0)),
    }));

    return { counter, reset$ };
  },
  ({ counter, reset$ }) => [
    p(() => `Count: ${counter()}`),
    button({ click: counter.increment }, '+1'),
    button({ click: counter.decrement }, '-1'),
    button({ click: () => reset$.emit() }, 'Reset'),
  ],
);
```

### Multi-Source Coordination

```typescript
import { source$, state, on$ } from '@craft-ng/core';

// Multiple sources for different events
const userLogin$ = source$<User>('userLogin$');
const userLogout$ = source$<void>('userLogout$');

const { authState } = state<User | null>('authState', null, ({ set }) => ({
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

const notifications$ = source$<string>('notifications$').preserveLastValue();

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

- [on$](/guide/reactivity/on) - Subscribe to sources with automatic cleanup in state insertions

## See Also

- [on$](/guide/reactivity/on) — reacting to a source
- [fromEventToSource$](/guide/reactivity/from-event-to-source)
- [sourceFromEvent](/guide/reactivity/source-from-event)

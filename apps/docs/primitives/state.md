# state

The `state` primitive creates a Signal-based state with optional insertions for adding methods and computed properties.

## Import

```typescript
import { state, craftUse } from '@craft-ng/core';
```

## Consuming the primitive

Every craft primitive takes its **name** as first argument and resolves to a
single-key record, so you always consume it by destructuring:

- inside a generator host (a `craftService` factory, `craftGen`, …) with
  `const { counter } = yield* state('counter', 0)` — the dependencies fold into
  the enclosing service tree automatically;
- anywhere else (typically a component field) with
  `const { counter } = craftUse(state('counter', 0))`.

The name is more than a label: it tags the primitive's injector
(`state:counter`), so it identifies the primitive in snapshots, logs and
observability.

A factory arrow that returns the primitive directly now resolves to the
**record**, not the ref. Drive the primitive yourself when the service should
expose the ref:

```typescript
craftService({ name: 'MyService', scope: 'global' }, function* () {
  const { counter } = yield* state('counter', 0);
  return counter;
});
```

The generator is single-use: consume each invocation exactly once.

For brevity, the examples below focus on the configuration and omit the
`yield*` / `craftUse` wrapper.

## Basic Examples

### Simple state with a primitive value

```typescript
const { counter } = craftUse(state('counter', 0));
console.log(counter()); // 0
```

### State with a computed

```typescript
import { signal, computed } from '@angular/core';

const origin = signal(5);
const { doubled } = craftUse(
  state(
    'doubled',
    computed(() => origin() * 2),
  ),
);
console.log(doubled()); // 10
```

### State with insertions to add methods (Method-based)

```typescript
import { signal, computed } from '@angular/core';

const origin = signal(5);
const { counter } = craftUse(
  state(
    'counter',
    computed(() => origin() * 2),
    ({ update, set }) => ({
      increment: () => update((current) => current + 1),
      reset: () => set(0),
    }),
  ),
);

console.log(counter()); // 10
counter.increment();
console.log(counter()); // 11
counter.reset();
console.log(counter()); // 0
```

### State with multiple insertions (methods and computed properties)

Compose several insertions into one with [craftPipe](/insertions/craft-pipe):

```typescript
const origin = signal(5);
const { counter } = craftUse(
  state(
    'counter',
    computed(() => origin() * 2),
    (context) =>
      craftPipe(
        context,
        ({ update, set }) => ({
          increment: () => update((current) => current + 1),
          reset: () => set(0),
        }),
        ({ state }) => ({
          isOdd: computed(() => state() % 2 === 1),
        }),
      ),
  ),
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
const { myState } = craftUse(
  state('myState', 0, ({ update, set }) => ({
    setValue: on$(increment, () => update((v) => v + 1)),
    reset: () => on$(reset, () => set(0)),
  })),
);

console.log(myState()); // 0
// Note: setValue is not exposed on myState, only used internally
increment.emit();
console.log(myState()); // 34
reset.emit();
console.log(myState()); // 0
```

### State and dependency injection

```typescript
craftUse(
  state('counter', 0, (context) =>
    craftPipe(
      context,
      ({ update }, { logger = inject(Logger) }) => ({
        increment: () => {
          logger.log('Incrementing state');
          update((v) => v + 1);
        },
      }),
      // log each time the state value changes
      function* ({ state }) {
        const log = yield* Console.log;

        effect(() => {
          log(`State value changed: ${state()}`);
        });
        return {};
      },
    ),
  ),
);
```

Instead of using `inject`, craft-ng provides Services to yield. This allows you to track dependencies in primitives — consume the primitive with `yield*` inside a `craftService` factory so those dependencies fold into the service tree.

## Add providers to state

Use the object form with `$self` when you want to scope providers to a single state:

```typescript
const { counter } = craftUse(
  state(
    'counter',
    {
      $self: function* () {
        return yield* CounterPreferences.initialValue();
      },
      providers: [provideCounterPreferences(), provideCounterAnalytics()],
    },
    ({ update }) => ({
      increment: function* () {
        yield* CounterAnalytics.track('increment');
        update((value) => value + 1);
      },
    }),
  ),
);
```

## Best Practices

✅ **Use TypeScript inference** - Let TypeScript infer types when possible
✅ **Keep state granular** - Create focused state slices
✅ **Use computed for derived state** - Don't duplicate state
✅ **Use insertions** - Add custom methods and computed properties to extend functionality

## See Also

- [AsyncProcess](/primitives/async-process) - For async operations
- [craftService](/store/craft-service) - Package multiple states behind a reusable service boundary
- [Insertions](/insertions/insert-local-storage) - For enhancing state behavior

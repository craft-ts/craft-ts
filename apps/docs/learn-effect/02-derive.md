# 2. Derive UI state

**Goal:** calculate UI state from the source of truth, and understand the
`yield*` rule that Craft and Effect share.

Use `craftComputed` for synchronous derivations. Its factory is a generator when
it reads a Craft value:

```typescript
import { craftComputed, state } from '@craft-ts/core';

const tasks = yield* state('tasks', [] as Task[]);
const remaining = craftComputed('remaining', function* () {
  return (yield* tasks()).filter((task) => !task.done).length;
});
```

The template can bind `remaining` directly. Craft re-runs only the binding that
depends on it.

## The shared dependency vocabulary

Both runtimes use generators, but they solve different problems:

```typescript
const tasks = yield* TaskList();          // Craft service
const access = yield* AccessPolicyService; // Effect service inside an Effect
const value = yield* resource.value();    // Craft reader inside a derivation
```

The rule is the same: yield what the current function does not own. A Craft
factory yields Craft dependencies; an Effect program yields Effect dependencies.
The adapter connects the two at a deliberate boundary.

## Do not duplicate domain state in the component

The component should not subscribe to an Effect, convert an Effect to a signal
by hand, or start a fiber in a template callback. Those approaches hide loading,
cancellation and failure state from Craft. Instead:

1. Keep the domain operation as `Effect<A, E, R>`.
2. Expose it through a Craft Effect-aware primitive.
3. Derive the display state from the resulting Craft resource.

The next step defines the domain operation and the services it requires.

## What you gained

Derived state that stays reactive and a clear division: Craft derives the UI;
Effect composes the domain program.

<div style="display: flex; justify-content: space-between; margin-top: 2rem">

[← 1. Start with a Craft component](/learn-effect/01-first-component)

[3. Put the domain in Effect →](/learn-effect/03-effect-domain)

</div>

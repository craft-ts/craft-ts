# Local state

`state` holds a value you own, in memory, as a signal — with its methods and
derived values attached to it rather than scattered around it.

**Use it when** the value's home is your application: a form draft, a selection,
a toggle, a counter.
**Not when** the value lives on a server ([`query`](/guide/state/server-state)),
in the URL ([`queryParams`](/guide/state/url-state)), or is the result of an
async action ([`asyncProcess`](/guide/state/async-process)).

## The common case

```typescript
import { state } from '@craft-ng/core';
import { computed } from '@angular/core';

const { counter } = yield* state('counter', 0, ({ state, update, set }) => ({
  increment: () => update((value) => value + 1),
  decrement: () => update((value) => value - 1),
  reset: () => set(0),
  isEven: computed(() => state() % 2 === 0),
}));

counter(); // 0 — the ref is a signal
counter.increment();
counter.isEven(); // false
counter.reset();
```

The insertion context gives you `state` (the current value as a signal), `set`
and `update`. Everything you return is exposed on the ref.

::: tip New to the shape?
The name, the destructuring, the `yield*` driver and the single-use rule are
the same for all five primitives — see
[Anatomy of a primitive](/guide/concepts/primitive-anatomy).
:::

## Deriving from another signal

The initial value can be a signal or a `computed`, in which case the state
follows it:

```typescript
const origin = signal(5);

const { doubled } = yield* state(
  'doubled',
  computed(() => origin() * 2),
);

doubled(); // 10
```

## Composing several insertions

One insertion function gets crowded. Split it and compose with `craftPipe`:

```typescript
import { craftPipe } from '@craft-ng/core';

const { counter } = yield* state('counter', 0, (context) =>
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
);

counter.increment();
counter.isOdd(); // true
```

Each function receives the same context and contributes its own slice. See
[Insertions](/guide/concepts/insertions).

## Driving it from events

Bind a method to a [`source$`](/guide/reactivity/source) with
[`on$`](/guide/reactivity/on) when the trigger is an event rather than a call:

```typescript
const increment = source$<void>('increment');
const reset = source$<void>('reset');

const { myState } = yield* state('myState', 0, ({ update, set }) => ({
  onIncrement: on$(increment, () => update((v) => v + 1)),
  onReset: on$(reset, () => set(0)),
}));

increment.emit(); // myState() === 1
reset.emit(); // myState() === 0
```

Like every craft primitive, a source is **named**, and the name must match the
variable it is assigned to — the `craft-ng/craft-source-name-match` ESLint rule
enforces it and autofixes it.

Note that `onIncrement` and `onReset` are **not** exposed on `myState`. Methods
bound to a source work internally only.

## Yielding dependencies

An insertion can be a `function*`, so it can pull in services:

```typescript
yield* state('counter', 0, (context) =>
  craftPipe(context, function* ({ state }) {
    const log = yield* Console.log;
    effect(() => log(`State value changed: ${state()}`));
    return {};
  }),
);
```

Prefer yielding a craft service over calling Angular's `inject` — yielding is
what makes the dependency visible to the route DI check and to test registers.

## Pitfalls

**Don't duplicate derived state.** If a value is a function of another, it is a
`computed` inside an insertion, not a second `state` kept in sync by an effect.

**Keep slices granular.** One `state` per coherent concern. A single object
holding five unrelated things makes every consumer depend on all five.

::: details Advanced — scoping providers to one state
Use the object form with `$self` when a state needs its own provider scope:

```typescript
const { counter } = yield* state(
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
);
```

:::

## See Also

- [Anatomy of a primitive](/guide/concepts/primitive-anatomy)
- [Insertions](/guide/concepts/insertions)
- [craftService](/guide/app/craft-service) — packaging state behind a reusable boundary

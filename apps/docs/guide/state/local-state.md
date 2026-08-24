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
import { craftComputed, state } from '@craft-ts/core';

const counter = yield* state('counter', 0, ({ state, update, set }) => ({
  increment: () => update((value) => value + 1),
  decrement: () => update((value) => value - 1),
  reset: () => set(0),
  isEven: craftComputed(function* () {
    return (yield* state()) % 2 === 0;
  }),
}));

yield* counter(); // 0
yield* counter.increment();
yield* counter.isEven(); // false
yield* counter.reset();
```

The insertion context gives you `state` (the current value as a yieldable
reader), `set` and `update`. Non-generator methods may return `update(...)`
directly — the insertion wrapper consumes the write. `isEven` yields `state()`
because the computed does not own that reader. In a template, pass the reader
or the method: `p(counter)`, `button({ click: counter.increment }, '+')`. At a
synchronous boundary, `craftUse(counter.increment())`.

::: tip New to the shape?
The name, the destructuring, the `yield*` driver and the single-use rule are
the same for all five primitives — see
[Anatomy of a primitive](/guide/concepts/primitive-anatomy).
:::

## Deriving from another reader

The initial value can be a Craft reader, in which case the state follows it:

```typescript
const origin = yield* state('origin', 5);

const doubled = yield* state(
  'doubled',
  craftComputed('originDoubled', function* () {
    return (yield* origin()) * 2;
  }),
);

yield* doubled(); // 10
```

## Composing several insertions

One insertion function gets crowded. Split it and compose with `insertStatePipe`:

```typescript
import { craftComputed, insertStatePipe, state } from '@craft-ts/core';

const counter = yield* state(
  'counter',
  0,
  insertStatePipe(
    ({ update, set }) => ({
      increment: () => update((current) => current + 1),
      reset: () => set(0),
    }),
    ({ state }) => ({
      isOdd: craftComputed(function* () {
        return (yield* state()) % 2 === 1;
      }),
    }),
  ),
);

yield* counter.increment();
yield* counter.isOdd(); // true
```

Each function receives the same context and contributes its own slice. See
[Insertions](/guide/concepts/insertions).

## Driving it from events

Bind a method to a [`source$`](/guide/reactivity/source) with
[`on$`](/guide/reactivity/on) when the trigger is an event rather than a call:

```typescript
const increment = source$<void>('increment');
const reset = source$<void>('reset');

const myState = yield* state('myState', 0, ({ update, set }) => ({
  onIncrement: on$(increment, () => update((v) => v + 1)),
  onReset: on$(reset, () => set(0)),
}));

increment.emit(); // after yield* / craftUse, myState is 1
reset.emit(); // after yield* / craftUse, myState is 0
```

Like every craft primitive, a source is **named**, and the name must match the
variable it is assigned to — the `craft-ts/craft-source-name-match` ESLint rule
enforces it and autofixes it.

Note that `onIncrement` and `onReset` are **not** exposed on `myState`. Methods
bound to a source work internally only.

## Yielding dependencies

An insertion can be a `function*`, so it can pull in services:

```typescript
yield* state('counter', 0, function* ({ state }) {
    const log = yield* Console.log;
    return {
      logValue: function* () {
        yield* log(`State value: ${yield* state()}`);
      },
    };
  });
```

Prefer yielding a craft service over reaching into a runtime container — yielding is
what makes the dependency visible to the route DI check and to test registers.

## Pitfalls

**Don't duplicate derived state.** If a value is a function of another, it is a
`craftComputed` inside an insertion that `yield*`s its readers, or a `state`
whose second argument is that source — not a second `state` kept in sync by an
effect. [`assertCraftEffectNoImperativeSync`](/guide/testing/architecture#assertcrafteffectnoimperativesync)
fails the architecture suite when an effect writes another primitive.

**Keep slices granular.** One `state` per coherent concern. A single object
holding five unrelated things makes every consumer depend on all five.

::: details Advanced — scoping providers to one state
Use the object form with `$self` when a state needs its own provider scope:

```typescript
const counter = yield* state(
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
      return yield* update((value) => value + 1);
    },
  }),
);
```

:::

::: tip Advanced — injectable writes
Insertion methods also provide `injectStateMethodRuntimeContext()`, which
recovers `get`, `set`, `update`, and `patch` from DI. Use it from wrappers,
WebMCP tools, and other advanced patterns — everyday insertions already
receive those methods as arguments. See
[Anatomy of a primitive](/guide/concepts/primitive-anatomy#injectable-runtime-context).
:::

## See Also

- [Anatomy of a primitive](/guide/concepts/primitive-anatomy)
- [Insertions](/guide/concepts/insertions)
- [craftService](/guide/app/craft-service) — packaging state behind a reusable boundary

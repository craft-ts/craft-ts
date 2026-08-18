# craftRegisterFor

`craftRegisterFor` exposes, within a Craft injection scope, the services,
components and directives that are **currently alive** in it.

**Use it when** a parent must drive several children without each child having to
push a bespoke API upwards: counters, audio players, selected items, validation
across a form section.
**Not when** one known child is involved — pass it a service or an input
instead. A registry trades explicitness for reach.

## Declaring a registry

The registry is typed from the Craft targets it accepts:

```ts
import { craftComputed, craftRegisterFor } from '@craft-ts/core';

const { RegisterForCounter, provideRegisterForCounter } = craftRegisterFor(
  'Counter',
  [Counter, CounterChild],
);
```

The first argument is the registry's mandatory name. It generates the two public
helpers `RegisterForCounter` and `provideRegisterForCounter`, a convention that
lets several registries coexist in one scope without name collisions.

With a single target, the array can be omitted:

```ts
const { RegisterForCounter } = craftRegisterFor(
  'Counter',
  Counter,
  ({ Counter }) => ({
    total: craftComputed('total', function* () {
      return (yield* Counter())?.length ?? 0;
    }),
  }),
);

const counters = yield* RegisterForCounter();
const total = craftComputed('total', function* () {
  return (yield* counters())?.length ?? 0;
});
```

If a projection uses several groups, every target must be declared:

```ts
craftRegisterFor(
  'Counter',
  [Counter, CounterChild],
  ({ Counter, CounterChild }) => ({
    total: craftComputed('total', function* () {
      return (yield* Counter())?.length ?? 0;
    }),
    incrementAll: function* () {
      for (const { ref } of (yield* CounterChild()) ?? []) {
        yield* ref.increment();
      }
    },
  }),
);
```

Then add the providers returned by `provideRegisterForCounter()` to the scope
that should observe the instances:

```ts
export const RegisterForDemo = craftComponent({
  name: 'RegisterForDemo',
  providers: [provideRegisterForCounter()],
  // ...
});
```

By default the registry also includes `global` services resolved under that
scope. To restrict observation to services whose scope matches the parent:

```ts
craftRegisterFor('Counter', [Counter], { includeGlobal: false });
```

The first declared target is reachable through `RegisterForCounter()` directly;
additional targets get their own property, e.g.
`RegisterForCounter.CounterChild()`.

## The common case — driving child components

Each child creates a `toProvide` service, and the parent providing the registry
observes them:

```ts
const { Counter, provideCounter } = craftService(
  { name: 'Counter', providedIn: 'toProvide' },
  function* () {
    const counter = yield* state(
      'counter',
      0,
      ({ update }) => ({
        increment: () => update((value) => value + 1),
        decrement: () => update((value) => value - 1),
      }),
    );

    return counter;
  },
);

const CounterChild = craftComponent(
  'CounterChild',
  { providers: [provideCounter()] },
  function* () {
    return yield* Counter();
  },
  ({ counter }) => div(counter),
);

const { RegisterForCounter, provideRegisterForCounter } = craftRegisterFor(
  'Counter',
  [Counter, CounterChild],
);

const CounterBoard = craftComponent(
  'CounterBoard',
  { providers: [provideRegisterForCounter()] },
  function* () {
    const counters = yield* RegisterForCounter();
    const children = yield* RegisterForCounter.CounterChild();

    return {
      incrementAll: function* () {
        for (const { ref } of (yield* counters()) ?? []) {
          yield* ref.increment();
        }
      },
      childCount: craftComputed('childCount', function* () {
        return (yield* children())?.length ?? 0;
      }),
    };
  },
  ({ incrementAll, childCount }) =>
    section([
      button({ click: incrementAll }, 'Increment every child'),
      p(function* () {
        return `Active children: ${yield* childCount()}`;
      }),
      each([1, 2, 3], () => CounterChild({})),
    ]),
);
```

When a child is added, its `Counter` appears in the group. When it leaves the
DOM, the group updates on its own.

## Reading a group

Groups are yieldable from a Craft factory. Their signal is `undefined` while no
instance is registered, and returns to `undefined` when the last one is
destroyed:

```ts
const counters = yield* RegisterForCounter();

const incrementAll = function* () {
  for (const { ref } of (yield* counters()) ?? []) {
    yield* ref.increment();
  }
};
```

Each entry carries:

- `ref` — the value produced by the service, or the context returned by the
  component/directive factory;
- `hostName` — the name of the host scope that created the entry.

The signal is live: the parent never re-subscribes when a child appears or
disappears.

## Partial exposure

As with `craftService`, a group can expose only the façade the parent needs. The
first argument stays `undefined` to keep the yieldable-helper syntax, and
`$self` is the group's full signal:

```ts
const childComponents = yield* RegisterForCounter.CounterChild(
  undefined,
  ({ $self }) => ({
    total: craftComputed(function* () {
      return (yield* $self())?.length ?? 0;
    }),
    incrementAll: function* () {
      for (const { ref } of (yield* $self()) ?? []) {
        yield* ref.increment();
      }
    },
    decrementAll: function* () {
      for (const { ref } of (yield* $self()) ?? []) {
        yield* ref.decrement();
      }
    },
  }),
);
```

The parent then keeps only `total`, `incrementAll` and `decrementAll`. The
dependency stays precise — the computed values read the group's signal, and
instances are still added and removed automatically.

## Derived registry properties

To share common projections, the second parameter of `craftRegisterFor` receives
the groups' signals directly:

```ts
const { RegisterForCounter, provideRegisterForCounter } = craftRegisterFor(
  'Counter',
  [Counter, CounterChild],
  ({ Counter, CounterChild }) => ({
    totalCounter: craftComputed('totalCounter', function* () {
      return (yield* Counter())?.length ?? 0;
    }),
    incrementAllCounterChild: function* () {
      for (const { ref } of (yield* CounterChild()) ?? []) {
        yield* ref.increment();
      }
    },
    decrementAllCounterChild: function* () {
      for (const { ref } of (yield* CounterChild()) ?? []) {
        yield* ref.decrement();
      }
    },
  }),
);
```

Each derived property becomes a yieldable helper:

```ts
const totalCounter = yield* RegisterForCounter.totalCounter();
const incrementAll = yield* RegisterForCounter.incrementAllCounterChild();

console.log(yield* totalCounter());
yield* incrementAll();
```

For a single-target registry, the main call also returns the signal enriched
with those derived properties — so the value stays callable for the raw entries
while exposing `total` and the added methods:

```ts
const childComponents = yield* RegisterForCounterChild();

const entries = yield* childComponents();
const total = yield* childComponents.total();
yield* childComponents.incrementAllChildCounter();
yield* childComponents.decrementAllChildCounter();
```

In a Craft template, pass a method straight to an event and call signals inside
a reactive callback:

```ts
button({ click: childComponents.incrementAllChildCounter }, 'Increment all');
span(function* () {
  return `Children: ${yield* childComponents.total()}`;
});
```

The main group, the additional groups and the derived properties can all be used
together. Derived properties are computed once per registry injector and keep
the reactive signals the groups provide.

## Registering a directive

Craft directives can be targets too:

```ts
const { RegisterForCounter } = craftRegisterFor('Counter', [
  CounterChild,
  CounterDebugDirective,
]);

const debugEntries = yield* RegisterForCounter.CounterDebugDirective();
debugEntries()?.forEach(({ hostName, ref }) => {
  console.debug('directive active', hostName, ref);
});
```

A functional directive has no class instance, so `ref` is the factory context of
the decorated component. Its `hostName` remains specific to the directive and
its instance, which is what lets you tell several identical directives apart on
the same screen.

## Lifecycle and references

Services are registered when their yield resolves. The runtime attaches their
removal to the destruction of the injector that carries them.

Craft components and directives are functional factories with no class instance,
so `ref` is their factory context. For a directive used with `.pipe(...)`, the
final component's context is exposed, because that is the execution scope the
directive shares.

Every Craft component automatically gets a host tag of the form
`component:<ComponentName>#<id>`, so `provideHostName` is not needed in a
component's providers — it stays useful only to override that automatic name.
Directives applied to an element get their own `hostName`, generated from the
directive name and an instance id. These names distinguish two identical
instances and are usable for diagnostics and observability.

Entries are removed automatically in every case: destruction of the
component/directive, destruction of its DI scope, or replacement of a
composition.

## Pitfalls

::: warning An empty registry is not an error
Compilation checks that the target you pass to `craftRegisterFor` is a valid
Craft service, component or directive — but it cannot check that an instance
will ever be created. If no registered target exists in the executed code, there
is no compile error and no runtime error: the signal is simply `undefined`.
:::

::: warning Craft targets only
`craftRegisterFor` does not detect arbitrary Angular classes. It targets
`craftService`, `craftComponent` and `craftDirective`, whose scope and lifecycle
the runtime knows.
:::

**Declaring the same target twice** in the list is not supported — each target
appears once.

**Treating the group signal as always populated.** It is `undefined` before the
first instance and after the last one; the `?.` is not optional.

::: details Extending the mechanism — target and yield wrappers
The registry rests on two separate pieces:

1. a **yield wrapper** observes services as they are actually resolved;
2. the component/directive **runtime** reports their creation and ties cleanup
   to their lifecycle.

The first is `provideCraftTargetWrapper`, documented on
[Target wrapper](/guide/app/target-wrapper). The second is
`provideServiceYieldWrapper`, the low-level hook `craftRegisterFor` uses to wrap
every Craft service resolution in the scope where the yield runs — deliberately
close to `provideFnWrapper`, but limited to service yields:

```ts
import {
  provideServiceYieldWrapper,
  type ServiceYieldContext,
} from '@craft-ts/core';

function* reportServiceYield(
  context: ServiceYieldContext,
  next: () => Generator<unknown, unknown, unknown>,
) {
  const startedAt = performance.now();
  const value = yield* next();

  console.debug('service resolved', {
    name: context.name,
    hostScope: context.hostScope,
    duration: performance.now() - startedAt,
  });

  return value;
}

export const providers = [
  provideServiceYieldWrapper(
    'Warning: the wrapper runs in the current Craft injection context.',
    reportServiceYield,
  ),
];
```

`context.resolve()` resolves the real service; `next()` keeps the wrapper chain
intact. Wrappers compose in registration order — the first is the outermost. The
context provides `name`, `scope`, `hostScope`, `injector` and `resolve`. Like
`provideFnWrapper`, this hook suits cross-cutting concerns — registries,
metrics, traces, diagnostics — not business logic.

A new tool can reuse `provideServiceYieldWrapper` to observe services without
`craftRegisterFor` at all. For functional Craft targets the runtime also exposes
its internal registration primitives, so another specialised view can be built —
but `craftRegisterFor` stays the recommended application-level API.
:::

## See Also

- [Target wrapper](/guide/app/target-wrapper) — the extension point underneath
- [craftService](/guide/app/craft-service)
- [Customization](/guide/components/customization)

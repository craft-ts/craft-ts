# The mental model

Three words describe everything `@craft-ng` does: **declare, yield, derive.**

You declare state with a name. You pull dependencies in with `yield*` so the
compiler can see them. Everything else — validity, loading flags, form trees,
error unions — is derived rather than restated.

This page is the *why*. If you want the *how*, the [Learn
path](/learn/) walks the same ideas through a working app.

## Declare

State is declared where it is used, close to the component or service that owns
it, with a name that the tooling can see:

```typescript
const { counter } = state('counter', 0, ({ update }) => ({
  increment: () => update((value) => value + 1),
}));
```

The name isn't a label — it tags the injector (`state:counter`) and is how the
primitive shows up in logs, snapshots and observability. Five primitives cover
every home a value can have: memory, server (read and write), URL, and async
action. They share one shape, so learning one teaches the other four — see
[Anatomy of a primitive](/guide/concepts/primitive-anatomy).

## Yield

Classic injection hides the dependency graph. `inject(TaskApi)` is invisible from
the outside, so the compiler cannot tell you when a provider is missing, and a
test cannot tell you what to mock.

Yielding makes the same call visible **in the type**:

```typescript
const api = yield* TaskApi();
```

Everything downstream reads that type: the route DI check, the testing register,
the dependency snapshot. And because you can yield *part* of a service —
`yield* TaskApi.fetchAll()` — the graph records only what you actually used,
which is what keeps test setups small.

That is the whole trade: one keyword, in exchange for a dependency graph the
compiler can check. See [Generators and `yield*`](/guide/concepts/generators).

## Derive

The third principle is the one that removes the most code: **if a value is a
function of another value, don't store it — derive it.**

- Derived values are `computed`, inside an insertion.
- Loading and error state is derived by the async primitives, not tracked by
  hand.
- A form's field tree, validity and error types are derived from its state and
  its mutation ([Forms](/guide/forms/)).
- Route exceptions are derived into a union the compiler forces you to handle
  exhaustively ([Exceptions](/guide/concepts/exceptions)).

The payoff is that derived things cannot drift out of sync with their source.
The cost is that you have to resist keeping a second copy "just for the
template".

## What follows from this

### Composition instead of configuration

Behaviour is added by **insertions** — plain functions that receive a
primitive's internals and return what to expose. localStorage sync, optimistic
updates and forms are all the same shape as one you'd write yourself:

```typescript
const { myState } = state(
  'myState',
  0,
  insertLocalStoragePersister({ storeName: 'myStore', key: 'myState' }),
);

const { myQuery } = query(
  'myQuery',
  { params: () => 1, loader: /* … */ },
  insertLocalStoragePersister({ storeName: 'myStore', key: 'myUserQuery' }),
);
```

Compose several with the primitive-specific helpers in
[Typed insertion pipes](/guide/concepts/insertion-pipes). Keep
[`craftPipe`](/guide/concepts/insertions) for universal or nested compositions.

### Methods or events, your choice

A method can be called directly, or bound to a source and driven by an event.
Both coexist in the same declaration:

```typescript
const resetSource$ = source$<void>('resetSource$');

const { counter } = state('counter', 0, ({ set, update }) => ({
  increment: () => update((v) => v + 1), // called
  reset: on$(resetSource$, () => set(0)), // driven by an event, not exposed
}));
```

This is what makes one `resetSource$.emit()` reset several independent states at
once, without any of them knowing about the others:

```typescript
const { search } = state('search', '', ({ set }) => ({
  set,
  reset: on$(resetSource$, () => set('')),
}));

const { page } = state('page', 1, ({ set, update }) => ({
  increment: () => update((v) => v + 1),
  reset: on$(resetSource$, () => set(1)),
}));
```

See [`on$`](/guide/reactivity/on).

### Granular state, granular tests

Small, focused states isolate change. Combined with partial yields, a consumer
depends on exactly what it reads — and a test provides exactly that, no more.

### Services as functions

A service is a factory with a name and a scope, not a class:
[`craftService`](/guide/app/craft-service) for the ones you write,
[`toCraftService`](/guide/app/integrate-existing) for existing Angular
dependencies. Both participate in the same typed composition and the same
testing workflow.

```typescript
const { UserProfile } = craftService(
  { name: 'UserProfile', scope: 'global' },
  function* () {
    const api = yield* UserApi();
    const userId = yield* state('userId', '5', ({ set }) => ({ set }));

    const updateEmail = yield* mutation('updateEmail', {
      method: (payload: { id: string; email: string }) => payload,
      loader: function* ({ params }) {
        return yield* api.updateEmail(params);
      },
    });

    const user = yield* query(
      'user',
      {
        params: userId,
        loader: function* ({ params }) {
          return yield* api.getUser(params);
        },
      },
      insertReactOnMutation(updateEmail, {
        optimisticPatch: { email: ({ mutationParams }) => mutationParams.email },
        reload: { onMutationException: true },
      }),
    );

    return { userId, user, updateEmail };
  },
);
```

### Signals, not RxJS

100% signal-based. RxJS is optional and only appears where you ask for it.

### Declarative code is legible code

The three principles add up to something that is rarely stated outright: the app
becomes **declared data** rather than control flow to be reconstructed. Two
consequences follow, and both are worth more than they look.

**Observability stops being instrumentation.** Because every dependency
resolution and every crafted function passes through one system, that system is
where you wrap them — structured logs through a yieldable `Console`, correlation
ids across the graph, per-service timing, snapshots of the live dependency
tree — with no change to business code. Retrofitting the same thing onto
imperative code means touching every call site. See
[Observability](/guide/advanced/observability).

**And what a tool can read, a tool can help with.** The dependency graph, the
reachable exceptions and the route contract are all declared, so an agent — or a
future WebMCP-style integration — can reason about the app without inferring it
from execution. The same property that makes the compiler able to check your
providers makes the codebase tractable to something that isn't you.

### Exceptions are values, errors are surprises

A craft *exception* is a failure you declared and expect to handle; an *error*
is the unexpected kind. Keeping them apart is what allows the compiler to check
that you handled every declared case.

This is **error-as-value**: a declared failure is *returned*, not thrown, so it
propagates through types rather than escaping through the stack. A `try/catch`
tells you nothing about what it might catch; a returned `craftException` carries
its code and payload all the way to whoever handles it — and the compiler knows
if nobody does. See [Exceptions as values](/guide/concepts/exceptions).

## See Also

- [What craft adds to Angular](/guide/concepts/vs-angular) — the full inventory
- [Which primitive should I use?](/guide/concepts/choose-primitive)
- [Anatomy of a primitive](/guide/concepts/primitive-anatomy)
- [Learn: the guided path](/learn/)

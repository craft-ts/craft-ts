# Generators and `yield*`

`yield*` is the one mechanism the whole library rests on. This page explains what
it actually does, then covers `craftGen`, which lets you write a tracked
generator outside a service.

## Why a generator at all

Angular's `inject(TaskApi)` is invisible from the outside: nothing in the
consumer's type says the dependency exists. The compiler can't catch a missing
provider, and a test can't tell you what to mock.

A generator gives the runtime a channel. Each `yield*` reports "I need this",
the driver resolves it, and the dependency is recorded **in the type**:

```typescript
const { TaskList } = craftService(
  { name: 'TaskList', scope: 'function' },
  function* () {
    const api = yield* TaskApi(); // tracked
    const tasks = yield* state('tasks', []); // tracked
    return tasks;
  },
);
```

Everything downstream reads that type: the route DI check, the testing register,
the dependency snapshot.

## The rule

> Every named entity yields what it does not own. A factory, a `craftComputed`,
> a `craftMethod`, a generator insertion member — each one records **its**
> dependencies with `yield*`.

Owning means: the primitive internals handed to **this** insertion
(`state`, `set`, `update`, `patch`). Everything else — another primitive, a
service, a sibling method, an input, a nested resource reader — is yielded.

```typescript
const counter = yield* state('counter', 0, ({ state, update }) => ({
  increment: () => update((value) => value + 1),
  doubled: craftComputed(function* () {
    return (yield* state()) * 2;
  }),
}));

const stats = craftComputed('stats', function* () {
  return (yield* counter()) + (yield* counter.doubled());
});
```

`increment` may return `update(...)` directly: it is not a generator, and the
insertion wrapper consumes the write. `doubled` does not own `state()`, so it
yields it. `stats` does not own `counter`, so it yields both readers.

In a Craft template, pass the reader or the method instead of wrapping a
synchronous call:

```typescript
p(counter);
button({ click: counter.increment }, '+');
```

`craftUse(...)` is the Angular-interop path: in a `@Component` class there is no
generator to yield from, so a class field drives the primitive with it instead.
A class field is the end of the graph, which is why `craftUse` has nothing to
track. Use it in tests and other synchronous boundaries too:
`craftUse(counter.increment())`.

Yield only what you use: `yield* TaskApi.fetchAll()` records one property
instead of the whole service, which is what keeps test registers small. See
[Shaping the public API](/guide/app/expose-api).

The `craft-ts/require-yieldable-reactive-read`,
`craft-ts/require-yieldable-insertion-write` and
`craft-ts/require-yieldable-template-method` ESLint rules enforce this. See
[ESLint rules](/guide/routing/eslint-rules).

## `craftGen` — a tracked generator outside a service

Build reusable generator factories that can be composed with `yield*` and that
short-circuit through typed `craftException` values.

`craftGen(factory)` wraps a generator factory and returns an invoker you delegate
to with `yield*`. It keeps the inner generator model intact:

- dependency yields still flow to the outer driver;
- the success value is returned through `yield*`;
- `craftException(...)` results are converted into a `CraftGenShortCircuit`;
- the reachable exception codes remain visible at the type level.

That makes it the right tool for reusable route logic — role checks, feature
flags, onboarding gates.

### The common case

```typescript
import { craftException, craftGen } from '@craft-ts/core';

export const roleGuard = craftGen(function* (...roles: Role[]) {
  const { user } = yield* Auth(undefined, ({ user }) => ({ user }));
  const currentUser = yield* user();

  if (!currentUser) {
    return craftException({ _tag: 'NOT_AUTHENTICATED' });
  }

  return roles.includes(currentUser.role)
    ? true
    : craftException({ _tag: 'FORBIDDEN_ROLE' });
});

export const noPizzeriaGuard = craftGen(function* () {
  const { pizzeria } = yield* Auth(undefined, ({ pizzeria }) => ({ pizzeria }));

  return (yield* pizzeria())
    ? craftException({ _tag: 'HAS_PIZZERIA' })
    : true;
});
```

Used from a route:

```typescript
canActivate: function* () {
  yield* roleGuard(ROLES.PIZZERIA_ADMIN);
  yield* noPizzeriaGuard();
  return true;
},
```

### Why it matters

Without it, reusable guards turn into copy-pasted generator blocks with repeated
branching and ad hoc exception handling. `craftGen` lets you:

- parameterise one guard and reuse it across routes;
- keep the route logic readable by composing with `yield*`;
- preserve exhaustiveness, because every reachable exception code stays typed;
- keep route dependency tracking intact, because the yielded dependencies still
  surface to the surrounding route.

In practice this is the difference between "a guard that works" and "a guard you
can safely reuse and evolve".

### How it behaves

- A normal return value comes back from `yield*` unchanged.
- A returned `craftException` makes the wrapper throw `CraftGenShortCircuit`.
- Yielded dependencies are relayed unchanged to the caller.
- When you compose several guards, the first exception wins.

## Pitfalls

**A primitive invocation is single-use.** Each call produces one generator, to be
consumed exactly once — don't store one and `yield*` it twice.

**Mixing `inject` into a craft factory.** It works at runtime and is invisible to
every check that makes this library worth using. The
`craft-ts/no-angular-inject` ESLint rule exists for this.

## See Also

- [Route guards](/guide/routing/guards)
- [ESLint rules](/guide/routing/eslint-rules) — `require-yieldable-reactive-read` and siblings
- [Program operators](/guide/advanced/program-operators) — `catchTag` and `retry`
- [Exceptions as values](/guide/concepts/exceptions)

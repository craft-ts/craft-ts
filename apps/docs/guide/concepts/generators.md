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
    const { tasks } = yield* state('tasks', []); // tracked
    return tasks;
  },
);
```

Everything downstream reads that type: the route DI check, the testing register,
the dependency snapshot.

## The rule

> Inside a `function*` craft factory, drive **everything** with `yield*` —
> services and primitives alike.

`craftUse(...)` is the Angular-interop path: in a `@Component` class there is no
generator to yield from, so a class field drives the primitive with it instead.
A class field is the end of the graph, which is why `craftUse` has nothing to
track.

Yield only what you use: `yield* TaskApi.fetchAll()` records one property
instead of the whole service, which is what keeps test registers small. See
[Shaping the public API](/guide/app/expose-api).

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
import { craftException, craftGen } from '@craft-ng/core';

export const roleGuard = craftGen(function* (...roles: Role[]) {
  const { user } = yield* Auth(undefined, ({ user }) => ({ user }));

  if (!user()) {
    return craftException({ code: 'NOT_AUTHENTICATED' });
  }

  return roles.includes(user()!.role)
    ? true
    : craftException({ code: 'FORBIDDEN_ROLE' });
});

export const noPizzeriaGuard = craftGen(function* () {
  const { pizzeria } = yield* Auth(undefined, ({ pizzeria }) => ({ pizzeria }));

  return pizzeria() ? craftException({ code: 'HAS_PIZZERIA' }) : true;
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
`craft-ng/no-angular-inject` ESLint rule exists for this.

## See Also

- [Route guards](/guide/routing/guards)
- [Program operators](/guide/advanced/program-operators) — `catchTag` and `retry`
- [Exceptions as values](/guide/concepts/exceptions)

# craftComputed

A yieldable reactive value that can read Craft dependencies and other reactive
Craft values with `yield*`.

**Use it when** a derived value reads a Craft reader, a service, or another
computed — so those dependencies are recorded on the computed itself.
Use `craftComputed` in application code so every reactive dependency can be
traced consistently.

## Import

```typescript
import { craftComputed } from '@craft-ts/core';
```

## Overview

`craftComputed` exposes a yieldable
reader. Application code uses the generator form so every reactive dependency
is recorded on **that** computed:

```typescript
const counter = yield* state('counter', 1, ({ state }) => ({
  doubled: craftComputed(function* () {
    return (yield* state()) * 2;
  }),
}));

const doubled = yield* counter.doubled();
```

Two modes exist:

- generator factory: `craftComputed(name, function* () { ...; return value; })`
  — the default for Craft values. The generator is replayed on every
  recomputation.
- plain computation: `craftComputed(name, () => value)` — for a computation that
  only reads values already held by the surrounding scope.

Inside an insertion the name may be omitted: Craft uses the insertion key.

## Signatures

```typescript
function craftComputed<Name extends string, T>(
  name: Name,
  computation: () => T,
  options?: CreateComputedOptions<T>,
): YieldableReactiveValue<T, Name>;

function craftComputed<Name extends string, Yielded, T>(
  name: Name,
  factory: () => Generator<Yielded, T, unknown>,
  options?: CreateComputedOptions<T>,
): YieldableReactiveValue<T, Name>;
```

The first argument is the **name** outside an insertion and must match the
property (or variable) the computed is assigned to. Inside an insertion it may
be omitted: Craft uses the insertion key automatically. The name tags the
injector context, reactive graph and dev-tools snapshots. The
[`craft-ts/craft-computed-name-match`](/guide/routing/setup) ESLint rule
enforces the match and offers a quick fix.

## Generator Computation

Use this form whenever the computed reads a Craft reader, a service, or another
computed.

```typescript
const counter = yield* state('counter', 1, ({ state }) => ({
  doubled: craftComputed(function* () {
    return (yield* state()) * 2;
  }),
}));

const doubled = yield* counter.doubled();
```

`doubled` does not own `state()`, so it yields it. That is how the computed's
own dependency graph records the read.

```typescript
import { craftComputed, craftService } from '@craft-ts/core';

const { Multiplier } = craftService(
  { name: 'Multiplier', providedIn: 'function' },
  () => ({ factor: 3 }),
);

const tripled = craftComputed('tripled', function* () {
  const multiplier = yield* Multiplier();
  return (yield* counter()) * multiplier.factor;
});
```

## Caveats

- `craftComputed(...)` must be created inside an injection context.
- Unknown yielded values are rejected with a `craftComputed`-specific error.
- `onAppStart(...)` is not supported inside `craftComputed(...)`.

## Typing

Both forms return `YieldableReactiveValue<T>`. The underlying reactive value
stays internal to Craft.

When using a generator, yielded dependencies are tracked and can be extracted with `ExtractDeps<...>`.

## See Also

- [`craftMethod`](/guide/reactivity/craft-method)
- [`craftEffect`](/guide/reactivity/craft-effect)
- [`craftService`](/guide/app/craft-service)
- [`onAppStart`](/guide/app/app-start)
- [Architecture rules](/guide/testing/architecture) — `assertCraftComputedPure`
  forbids methods and `source$` writes inside a computed

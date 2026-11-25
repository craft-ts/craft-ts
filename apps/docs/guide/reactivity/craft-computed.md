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
  doubled: craftUse(craftComputed('doubled', function* () {
    return (yield* state()) * 2;
  })),
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
  doubled: craftUse(craftComputed('doubled', function* () {
    return (yield* state()) * 2;
  })),
}));

const doubled = yield* counter.doubled();
```

`doubled` does not own `state()`, so it yields it. That is how the computed's
own dependency graph records the read.

The same ownership rule applies to dependencies that are proven reads. If one
is used only by one computed, yield it in that computed's generator so its
dependency stays local. `craft-ts/prefer-computed-local-dependency` reports such
a dependency yielded outside and captured only by a computed. It does not
autofix because the callback may need to change into a generator.

```typescript
// Before: the outer function owns the router even though only the computed uses it.
const router = yield* CraftRouter();
const replayFrames = yield* craftComputed('replayFrames', () =>
  replayFramesOf(report(), router),
);

// After: the computed owns the router dependency.
const replayFrames = yield* craftComputed('replayFrames', function* () {
  const router = yield* CraftRouter();
  return replayFramesOf(report(), router);
});
```

Only `CraftRouter()` and `CraftGlobalError()`, the synchronous core
capabilities, are services a computed may resolve. Resolving any other service
can instantiate its implementation inside the computation — a `craftEffect` or a
write among its dependencies — and its type does not prove otherwise, so
`craft-ts/no-craft-computed-side-effects` rejects it. Resolve such a service in
the enclosing body and read it in the computed; the two rules agree on that
form (see [Only provable reads go inside a `craftComputed`](/guide/routing/eslint-rules#only-provable-reads-go-inside-a-craftcomputed)):

```typescript
import { craftComputed, craftService, craftExpose } from '@craft-ts/core';

const { Multiplier } = craftService(
  { name: 'Multiplier', providedIn: 'function' },
  function* () {
    yield* craftExpose('factor', 3);
  },
);

// Inside the service that owns `counter`:
const multiplier = yield* Multiplier();
const tripled = yield* craftComputed('tripled', function* () {
  return (yield* counter()) * multiplier.factor;
});
```

## Technical values: `craftLiteral`

A computed often maps state to a token that code reads back: a `data-state`
value a sheet axis matches, or a `matchNode.exhaustive` key. Such a token is a
technical value, not copy. Declare each value once with `craftLiteral(...)` and
return those values; TypeScript infers the union without an annotation.

```typescript
import { craftComputed, craftLiteral } from '@craft-ts/core';

const drawerOpen = craftLiteral('open');
const drawerClosed = craftLiteral('closed');

const drawerState = yield* craftComputed('drawerState', function* () {
  return (yield* open()) ? drawerOpen : drawerClosed;
}); // reads as 'open' | 'closed'
```

`craftLiteral<const T extends string>(value: T): T` returns `value` unchanged
and keeps its literal type. Declare one value per call rather than a list: the
returned value and its type stay obvious.

With the i18n preset, `craft-ts/require-i18n-text` reports a bare string
returned by a computed, because it cannot tell a token from copy:

```typescript
// Before: reported — is 'open' a token or a word shown to the user?
return (yield* open()) ? 'open' : 'closed';

// After: the marked values are technical and accepted.
return (yield* open()) ? drawerOpen : drawerClosed;
```

The rule still asks for `i18n.t(...)` when a marked value reaches visible text
(a text child, `placeholder`, `aria-label`, `title`, or a `label`-like
view-model field): text shown to a user always comes from the catalogue. No
autofix is offered, because only you know whether the string is copy or a
token.

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

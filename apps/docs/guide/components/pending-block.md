# settledValue & pendingBlock

Reading an async value in a template without ever handling `undefined` — and
being told at **compile time** when the loading state has nowhere to go.

**Use it when** a template renders data that comes from a `query`.
**Not when** you want to drive the loading state yourself: `query.value()`
(`T | undefined`) and `query.status()` stay exactly as they were.

## Import

```typescript
import { settled } from '@craft-ng/core';
import { pendingBlock } from '@craft-ng/component';
```

## Overview

A resource-like `query`, `mutation` or `asyncProcess` exposes a second read next
to `value`:

```typescript
users.value(); // User[] | undefined  — you handle the wait
users.settledValue(); // User[]        — the wait is handled for you
```

`settledValue` never returns `undefined` and never returns a value while the
source carries an exception. When there is nothing to show it **suspends**: it
throws a `CraftNotSettled` that the nearest `pendingBlock` turns into a
fallback. A business exception throws through the existing channel instead, and
lands in the nearest `catchBlock`.

Because the dependency is visible in the types, a template that renders a
suspending value with no `pendingBlock` around it does not compile.

## Reading a settled value in a computed

Inside a `craftComputed` generator, `yield* settled(ref)` hands back the
resource's settled read:

```typescript
const teams = craftComputed('teams', function* () {
  const list = yield* settled(users);
  // `list()` is `User[]` here — never undefined, never in exception
  return () => [...new Set(list().map((user) => user.team))].sort();
});
```

Nothing is awaited and nothing is yielded at runtime: the markers are type-only.
What they do is tag `teams` as *depending on the async source `users`*, which is
what the template checker reads.

## The boundary

The boundary is piped onto any node above the reads:

```typescript
div([span(teams), span(total)]).pipe(
  pendingBlock({ fallback: () => p('Chargement…') }),
);
```

One boundary covers every async source in its subtree — the same shape as
`Suspense`. When each zone deserves its own skeleton, name the sources instead;
the list is checked exhaustively, so a source with no fallback (and a fallback
for a source that never suspends here) is a compile error:

```typescript
div([...]).pipe(
  pendingBlock.exhaustive({
    users: () => SkeletonList(),
    orders: () => SkeletonRows(),
  }),
);
```

The handler keys are the **query names**, even when the template only ever sees
a computed derived from them.

## What the compiler enforces

```typescript
craftComponent(
  'teamList',
  {},
  function* () {
    const users = yield* query('users', { ... });
    const teams = craftComputed('teams', function* () {
      const list = yield* settled(users);
      return () => list().length;
    });
    return { teams };
  },
  // ERROR_async_source_rendered_outside_a_pendingBlock: "users"
  ({ teams }) => div([span(teams)]),
);
```

The sources bubble up through the node tree exactly like unhandled exception
codes do, and the check fires on the `craftComponent` template argument, naming
the sources that have nowhere to show their loading state. Several suspending
computeds in one template are all covered by the same rule: every one of them
needs a boundary above it.

The obligation travels through `each`, `ifBlock`, `defer`, projected content and
nested elements — anywhere a node can carry children.

## Stale-while-revalidate

A reload that keeps its previous value does **not** suspend: the stale value is
served while the new one is in flight, so a refetch never blanks a screen that
already has data. Only a source with nothing to show suspends. To make a reload
suspend again, clear the value with `preservePreviousValue: () => false`.

A refetch throws nothing, so the boundary cannot learn about it from the
suspension channel — it watches the source's own status instead. Give a handler
its `reloading` slot to report it, rendered **next to the still-visible
subtree**:

```typescript
pendingBlock.exhaustive({
  issue: {
    pending: () => p('Waiting for an invoice…'),
    reloading: () => p('Re-issuing…'),
  },
});

// or, for the catch-all form
pendingBlock({ fallback: () => Skeleton(), reloading: () => Spinner() });
```

## Runtime behaviour

While a source is pending, the boundary renders its fallback and detaches the
suspended subtree's DOM — **detaches, not destroys**. Keeping it alive is what
makes resumption work: the suspended bindings stay subscribed to their source's
status, so they re-run and release the boundary the moment the data arrives.

Two escapes are reported rather than silently swallowed:

- a settled read that suspends with no boundary above it throws
  `CraftUnhandledPendingError`;
- a settled read whose source carries an exception with no `catchBlock` above it
  throws `CraftUnhandledExceptionError`.

The first is the runtime backstop for what the types cannot see — typically a
settled read hidden inside a lambda (`() => users.settledValue().name`), where
the brand that carries the obligation is lost. Bind the value **by reference**
(`span(users.settledValue)`, `span(teams)`) to keep the compile-time guarantee.

## Two boundaries, two obligations

A settled read has two exits and each one has its own boundary:

| Exit | Thrown | Boundary | Checked at |
| ---- | ------ | -------- | ---------- |
| nothing to show yet | `CraftNotSettled` | `pendingBlock` | `craftComponent(...)` |
| the source carries an exception | `CraftGenShortCircuit` | `catchBlock` | `craftComponent(...)` |

Both bubble up the node tree until a boundary clears them, and both fail the
`craftComponent` template argument when uncovered. A `pendingBlock` is not an
exception boundary — settled exceptions pass straight through it, and vice
versa.

```typescript
div([span(summary)])
  .pipe(pendingBlock.exhaustive({ issue: () => Skeleton() }))
  .pipe(catchBlock.exhaustive({ INVOICE_REJECTED: () => Rejected() }));
```

A `catchBlock` handler receives the exception as `AnyCraftException`: its `code`
is known, its payload is not. Reach for `matchBlock` when the fallback needs the
payload itself.

## Current limits

- The by-id forms (`select(...)` / `selectOrCreate(...)`) have no settled read
  yet: a by-id ref holds one status per group member.
- A component cannot yet delegate its boundaries to its caller: both checks are
  enforced on each `craftComponent` template.
- A settled read hidden inside a lambda loses its brand, and with it both
  compile-time obligations — the runtime backstops still fire.

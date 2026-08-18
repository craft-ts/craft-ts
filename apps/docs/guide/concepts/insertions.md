# Insertions

An insertion is a function that receives a primitive's internals and returns
what to expose on it. It is how behaviour gets attached to state — and how it
gets reused.

**Use one** whenever a primitive needs methods, computed values, or a ready-made
behaviour like storage persistence.
Every primitive accepts one insertion directly. For several insertions, prefer
the typed helper for that primitive; see
[Typed insertion pipes](/guide/concepts/insertion-pipes). Use `craftPipe` when
you need a universal pipe or an explicit nested context.

## The common case

The library's insertions and the ones you write are the same shape, so they
compose in the same pipe:

```typescript
import {
  craftUnique,
  insertStoragePersister,
  insertPaginationPlaceholderData,
  insertReactOnMutation,
  insertQueryPipe,
  insertStatePipe,
  query,
} from '@craft-ts/core';

const users = yield* query(
  'users',
  {
    params: pagination,
    identifier: (params) => `${params.page}-${params.pageSize}`,
    loader: function* ({ params }) {
      return yield* ApiService.getDataList(params);
    },
  },
  insertQueryPipe(
    insertStoragePersister(craftUnique({
      storeName: 'app',
      key: 'users',
    })),
    insertPaginationPlaceholderData({ initialValue: [] as User[] }),
    insertReactOnMutation(deleteUser, {
      filter: ({ mutationIdentifier, queryResource }) =>
        !!queryResource.value()?.some((u) => u.id === mutationIdentifier),
      optimisticUpdate: ({ queryResource, mutationIdentifier }) =>
        removeOne({
          entities: queryResource.value(),
          id: mutationIdentifier,
        }),
    }),
  ),
);
```

The typed helper supplies the query context to each member and keeps the
primitive call free of context plumbing.

::: tip A single insertion needs no pipe
Pass it directly:

```typescript
const user = yield* query('user', config, insertStoragePersister({ … }));
```

:::

## Writing your own

There is nothing special about a library insertion. Yours is a function of the
same shape:

```typescript
const counter = yield* state(
  'counter',
  0,
  insertStatePipe(
    ({ update, set }) => ({
      increment: () => update((c) => c + 1),
      reset: () => set(0),
    }),
    ({ state }) => ({
      isOdd: craftComputed(function* () {
        return (yield* state()) % 2 === 1;
      }),
    }),
  ),
);
```

Extract it to a named function the moment two primitives want the same
behaviour — that is the whole extension mechanism.

A member can also be a `function*`, in which case it can `yield*` services and
those dependencies fold into the enclosing graph. A `craftComputed` or generator
method must yield every reader it does not own — including this primitive's
`state()` / `update()` / sibling methods on `insertions`.

## What piping guarantees

Piping is strictly equivalent to attaching members one by one:

- members run **left to right**;
- each member sees the previous members' outputs on `context.insertions`;
- the outputs are the **intersection** of all members' — on a key conflict, the
  rightmost wins at runtime;
- tracked dependencies are the **union** of all members', so `ExtractDeps` sees
  every one;
- each member is **wrapped individually**, so correlation-id tracking and app
  snapshots observe them separately.

## Nesting

Pipes nest freely, including inside `insertSelect` — each level re-passes its
own context:

```typescript
const board = yield* state(
  'board',
  { ui: { activeColor: 'black' }, grid: createInitialGrid() },
  insertStatePipe(
    insertStoragePersister(craftUnique({
      storeName: 'app',
      key: 'board',
    })),
    () => ({ resetAll$: source$<void>('resetAll$') }),
    insertSelect('grid', (gridContext) =>
      craftPipe(
        gridContext,
        ({ state, update }) => ({
          addRow: () => update((grid) => [...grid, createNextRow(grid)]),
          rowIndexes: craftComputed(function* () {
            return (yield* state()).map((_row, index) => index);
          }),
        }),
        insertSelect('row', ({ update }) => ({
          /* … */
        })),
      ),
    ),
  ),
);
```

## Pitfalls

**Choosing the wrong pipe.** Use the primitive-specific helper for a direct
composition. `craftPipe` still requires an explicit context and is the right
choice for universal or nested compositions.

**Two members exporting the same key.** The rightmost wins silently at runtime.
Name your outputs so they don't collide.

::: details Why the context is explicit
It is what makes one universal pipe possible for all five primitives. The outer
`(context) => …` lambda is contextually typed *by the primitive*, so TypeScript
knows the exact context shape before it resolves the `craftPipe` call. Inline
lambdas keep full contextual typing, higher-order factories like
`insertReactOnMutation(...)` match as before, and the primitive's `Exceptions`
inference is never degraded.
:::

## See Also

- [Anatomy of a primitive](/guide/concepts/primitive-anatomy)
- [Injectable runtime context](/guide/concepts/primitive-anatomy#injectable-runtime-context) —
  recovering `set` / `update` / `patch` from DI, including for WebMCP
- [Selecting](/guide/state/select) — `insertSelect` and nested insertions
- [Reacting to mutations](/guide/state/react-on-mutation)

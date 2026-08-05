# Insertions

An insertion is a function that receives a primitive's internals and returns
what to expose on it. It is how behaviour gets attached to state — and how it
gets reused.

**Use one** whenever a primitive needs methods, computed values, or a ready-made
behaviour like localStorage sync.
**Use `craftPipe`** when you need more than one, because every primitive accepts
exactly one insertion.

## The common case

The library's insertions and the ones you write are the same shape, so they
compose in the same pipe:

```typescript
import {
  craftPipe,
  insertLocalStoragePersister,
  insertPaginationPlaceholderData,
  insertReactOnMutation,
  query,
} from '@craft-ng/core';

const { users } = yield* query(
  'users',
  {
    params: pagination,
    identifier: (params) => `${params.page}-${params.pageSize}`,
    loader: function* ({ params }) {
      return yield* ApiService.getDataList(params);
    },
  },
  (context) =>
    craftPipe(
      context,
      insertLocalStoragePersister({ storeName: 'app', key: 'users' }),
      insertPaginationPlaceholderData({ initialValue: [] as User[] }),
      insertReactOnMutation(deleteUser, {
        filter: ({ mutationIdentifier, queryResource }) =>
          !!queryResource.safeValue()?.some((u) => u.id === mutationIdentifier),
        optimisticUpdate: ({ queryResource, mutationIdentifier }) =>
          removeOne({
            entities: queryResource.value(),
            id: mutationIdentifier,
          }),
      }),
    ),
);
```

Note the shape: the outer lambda receives `context` and hands it to
`craftPipe`, which re-dispatches it to each member.

::: tip A single insertion needs no pipe
Pass it directly:

```typescript
const { user } = yield* query('user', config, insertLocalStoragePersister({ … }));
```

:::

## Writing your own

There is nothing special about a library insertion. Yours is a function of the
same shape:

```typescript
const { counter } = yield* state('counter', 0, (context) =>
  craftPipe(
    context,
    ({ update, set }) => ({
      increment: () => update((c) => c + 1),
      reset: () => set(0),
    }),
    ({ state }) => ({
      isOdd: computed(() => state() % 2 === 1),
    }),
  ),
);
```

Extract it to a named function the moment two primitives want the same
behaviour — that is the whole extension mechanism.

A member can also be a `function*`, in which case it can `yield*` services and
those dependencies fold into the enclosing graph.

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
const { board } = yield* state(
  'board',
  { ui: { activeColor: 'black' }, grid: createInitialGrid() },
  (context) =>
    craftPipe(
      context,
      insertLocalStoragePersister({ storeName: 'app', key: 'board' }),
      () => ({ resetAll$: source$<void>('resetAll$') }),
      insertSelect('grid', (gridContext) =>
        craftPipe(
          gridContext,
          ({ state, update }) => ({
            addRow: () => update((grid) => [...grid, createNextRow(grid)]),
            rowIndexes: computed(() => state().map((_row, index) => index)),
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

**Forgetting the outer lambda.** `craftPipe` needs the primitive's context
passed explicitly — `(context) => craftPipe(context, …)`, not
`craftPipe(…)` on its own.

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
- [Selecting](/guide/state/select) — `insertSelect` and nested insertions
- [Reacting to mutations](/guide/state/react-on-mutation)

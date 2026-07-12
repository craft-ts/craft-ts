# craftPipe

Every primitive accepts **a single insertion**. To attach several insertions,
compose them with `craftPipe` — one universal utility for every primitive
(`query`, `mutation`, `asyncProcess`, `state`, `queryParam`) and for the
nested insertions of `insertSelect`.

The primitive's context is passed **explicitly**: the insertion is a lambda
receiving the context, and `craftPipe(context, ...members)` re-dispatches it
to each member.

## Usage

```typescript
import {
  insertLocalStoragePersister,
  insertPaginationPlaceholderData,
  craftPipe,
  insertReactOnMutation,
  query,
} from '@craft-ng/core';

const users = query(
  {
    params: pagination,
    identifier: (params) => `${params.page}-${params.pageSize}`,
    loader: function* ({ params }) {
      return yield* ApiServiceToYield.getDataList(params);
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
          removeOne({ entities: queryResource.value(), id: mutationIdentifier }),
      }),
    ),
);
```

The same `craftPipe` works with `state`, `mutation`, `asyncProcess` and
`queryParam`:

```typescript
const counter = state(
  0,
  (context) =>
    craftPipe(
      context,
      ({ update, set }) => ({
        increment: () => update((c) => c + 1),
        reset: () => set(0),
      }),
      ({ state, insertions }) => ({
        // `insertions` is typed with the previous members' outputs
        isOdd: computed(() => state() % 2 === 1),
      }),
    ),
);
```

## Semantics

Piping is strictly equivalent to attaching the members one by one:

- members run **left to right**;
- each member sees the previous members' outputs on `context.insertions`;
- the resulting outputs are the **intersection** of all members' outputs
  (on a key conflict, the rightmost member wins at runtime);
- tracked dependencies (`yield* track(...)`, craft-service yields) are the
  **union** of all members' — `ExtractDeps` sees them all;
- each member factory is **individually wrapped** by the fn-wrapper chain, so
  correlation-id tracking and app snapshots observe every member separately;
- generator members (`function*`) are driven by the craft generator runtime,
  like any generator insertion.

## Why the explicit context

Passing `context` explicitly is what makes a single universal pipe possible:
the outer `(context) => ...` lambda is contextually typed by the primitive,
so TypeScript knows the exact context shape before it resolves the
`craftPipe` call. Inline lambdas keep full contextual typing, higher-order
insertion factories (like `insertReactOnMutation(...)`) match as before, and
the primitive's `Exceptions` inference is never degraded.

## Nesting, including inside insertSelect

Pipes nest freely — each level re-passes its own context:

```typescript
const board = state(
  { ui: { activeColor: 'black' }, grid: createInitialGrid() },
  (context) =>
    craftPipe(
      context,
      insertLocalStoragePersister({ storeName: 'app', key: 'board' }),
      () => ({ resetAll$: source$<void>() }),
      insertSelect('grid', (gridContext) =>
        craftPipe(
          gridContext,
          ({ state, update }) => ({
            addRow: () => update((grid) => [...grid, createNextRow(grid)]),
            rowIndexes: computed(() => state().map((_row, index) => index)),
          }),
          insertSelect('row', ({ update }) => ({
            /* ... */
          })),
        ),
      ),
    ),
);
```

A **single** insertion never needs a pipe — pass it directly:

```typescript
// single insertion: no pipe
const user = query(config, insertLocalStoragePersister({ ... }));
const cells = state(initial, insertSelect('cell', ({ update }) => ({ ... })));
```

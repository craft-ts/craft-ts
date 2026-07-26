# insertSelect

`insertSelect` is the unified API to select a nested sub-state and add insertions to it, whether the parent is:

- an object
- an array

This makes it possible to write nested insertions with a single API, without switching helpers based on the state shape, and it helps drive complex object logic.

::: info
This insertion can only be used by `state` primitive.
:::

## Import

```typescript
import { insertSelect, state } from '@craft-ng/core';
```

## Basic Usage (object)

```typescript
const board = state(
  {
    cell: {
      color: 'white',
      paintCount: 0,
    },
  },
  insertSelect('cell', ({ update, state }) => ({
    paint: () =>
      update((cell) => ({
        ...cell,
        color: 'black',
        paintCount: cell.paintCount + 1,
      })),
    paintCountStr: () => `Painted ${state().paintCount} times`,
  })),
);

board.selectCell().paint();
console.log(board.selectCell().paintCountStr()); // "Painted 1 times"
```

## Basic Usage (array)

```typescript
const cells = state(
  [{ color: 'white', paintCount: 0 }],
  insertSelect('cell', ({ update }) => ({
    paint: () =>
      update((cell) => ({
        ...cell,
        color: 'black',
        paintCount: cell.paintCount + 1,
      })),
  })),
);

cells.selectCell(0)?.paint();
console.log(cells.selectCell(0)?.paintCount); // 1
```

## insertSelect with Dependency injection

```typescript
insertSelect('cell', function* ({ patch }) {
  const color = yield* ColorService();
  return {
    paint: () =>
      patch(() => ({
        color,
      })),
  };
});
```

The dependencies are tracked at the primitive level.

## Why use it

- A single API for selections on both object and array states
- Simplifies nested insertions (object -> array -> object, etc.)
- Helps drive complex object logic close to the relevant nested sub-state

## Current limitation

1. `insertSelect` (on object states) does not yet support targeting a property that is not an `object` (for example: `string`, `number`, `boolean`).

2. This currently breaks type inference. An improvement is planned.

::: tip Nested typing
With `craftPipe` the selected context is re-passed explicitly at every level,
so TypeScript keeps full contextual typing in nested `insertSelect` chains —
the historical `insertNoopTypingAnchor` workaround is no longer needed here
(it remains useful for the form-tree helpers).
:::

## insertSelect and craftPipe

Like the primitives, `insertSelect` accepts a **single** nested insertion. To
attach several, re-pass the selected context through
[craftPipe](/insertions/craft-pipe):

```ts
state(
  { grid: createInitialGrid() },
  insertSelect('grid', (gridContext) =>
    craftPipe(
      gridContext,
      ({ state, update }) => ({
        addRow: () => update((grid) => [...grid, createNextRow(grid)]),
      }),
      insertSelect('row', ({ update }) => ({
        // ...
      })),
    ),
  ),
);
```

`insertSelect` also composes as a **member** of a pipe:

```ts
state(
  initialCells,
  (context) =>
    craftPipe(
      context,
      insertLocalStoragePersister({ storeName: 'app', key: 'cells' }),
      insertSelect('cell', ({ update }) => ({
        paint: () => update((cell) => ({ ...cell, painted: true })),
      })),
    ),
);
```

## Pixel Art examples

- [Pixel Art (1D grid)](https://github.com/ng-angular-stack/ng-craft/blob/main/apps/demo/src/app/examples/primitives/pixel-art/pixel-art.ts)
- [Pixel Art Matrix (2D grid)](https://github.com/ng-angular-stack/ng-craft/blob/main/apps/demo/src/app/examples/primitives/pixel-art-matrix/pixel-art-matrix.ts)

## See also

- [craftPipe](/insertions/craft-pipe) - Compose several insertions on one primitive
- [state](/primitives/state)

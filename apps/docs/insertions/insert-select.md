# insertSelect

`insertSelect` is the unified API to select a nested sub-state and add insertions to it, whether the parent is:

- an object
- an array

This makes it possible to write nested insertions with a single API, without switching helpers based on the state shape, and it helps drive complex object logic.

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

## Why use it

- A single API for selections on both object and array states
- Simplifies nested insertions (object -> array -> object, etc.)
- Helps drive complex object logic close to the relevant nested sub-state

## Current limitation

`insertSelect` (on object states) does not yet support targeting a property that is not an `object` (for example: `string`, `number`, `boolean`).

This currently breaks type inference. An improvement is planned.

## Pixel Art examples

- [Pixel Art (1D grid)](https://github.com/ng-angular-stack/ng-craft/blob/main/apps/demo/src/app/examples/primitives/pixel-art/pixel-art.ts)
- [Pixel Art Matrix (2D grid)](https://github.com/ng-angular-stack/ng-craft/blob/main/apps/demo/src/app/examples/primitives/pixel-art-matrix/pixel-art-matrix.ts)

## See also

- [state](/primitives/state)

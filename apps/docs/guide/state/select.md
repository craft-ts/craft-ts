# Selecting a sub-state

`insertSelect` targets a nested part of a state and attaches insertions **to that
part**, so the logic lives next to the data it operates on rather than at the top
of a deeply nested object.

**Use it when** a state is a tree and a method only concerns one branch: a cell
in a grid, a row in a table, one section of a settings object.
**Not when** the whole state is the subject — a plain insertion is simpler.

One API covers both shapes: the parent can be an **object** or an **array**, and
you don't switch helpers based on which.

::: info `state` only
This insertion works with the `state` primitive.
:::

```typescript
import { insertSelect, state } from '@craft-ng/core';
```

## The common case — selecting an object property

```typescript
const { board } = state(
  'board',
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

## Selecting into an array

```typescript
const { cells } = state(
  'cells',
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

## Yielding dependencies

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

## Pitfalls

**Only object properties can be selected.** On an object state, targeting a
property that is not itself an object — a `string`, `number` or `boolean` — is
not supported yet, and currently breaks type inference rather than failing
cleanly. An improvement is planned.

**A select takes a single nested insertion**, like any primitive. Use
`craftPipe` for more than one (below).

::: tip Nested typing needs no anchor
With `craftPipe` the selected context is re-passed explicitly at every level, so
TypeScript keeps full contextual typing through nested `insertSelect` chains. The
historical `insertNoopTypingAnchor` workaround is not needed here — it remains
necessary for the [form-tree helpers](/guide/forms/nested).
:::

## Attaching several insertions

Like the primitives, `insertSelect` accepts a **single** nested insertion. To
attach several, re-pass the selected context through
[craftPipe](/guide/concepts/insertions):

```ts
state(
  'board',
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
state('cells', initialCells, (context) =>
  craftPipe(
    context,
    insertLocalStoragePersister({ storeName: 'app', key: 'cells' }),
    insertSelect('cell', ({ update }) => ({
      paint: () => update((cell) => ({ ...cell, painted: true })),
    })),
  ),
);
```

::: details Working examples — pixel art
Two demos built almost entirely on nested selects:

- [Pixel Art (1D grid)](https://github.com/ng-angular-stack/ng-craft/blob/main/apps/demo/src/app/examples/primitives/pixel-art/pixel-art.ts)
- [Pixel Art Matrix (2D grid)](https://github.com/ng-angular-stack/ng-craft/blob/main/apps/demo/src/app/examples/primitives/pixel-art-matrix/pixel-art-matrix.ts)

:::

## See Also

- [Insertions](/guide/concepts/insertions) — composing several on one primitive
- [Local state](/guide/state/local-state)
- [Collections](/guide/state/collections) — for entity lists specifically

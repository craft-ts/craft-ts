# insertSelectItem

`insertSelectItem` ajoute des helpers pour manipuler les items d'un state tableau/record:

- `select(id)` pour lire l'item brut
- `selectItem(id)` pour lire l'item avec les insertions
- `items()` pour récupérer tous les items enrichis

## Import

```typescript
import { insertSelectItem, state } from '@craft-ng/core';
```

## Basic Usage

```typescript
const cells = state(
  [{ color: 'white', paintCount: 0 }],
  insertSelectItem(({ update }) => ({
    paint: () =>
      update((cell) => ({
        ...cell,
        color: 'black',
        paintCount: cell.paintCount + 1,
      })),
  })),
);

cells.selectItem(0)?.paint();
console.log(cells.select(0)?.paintCount); // 1
```

## Why use it

- Ajoute une API claire pour cibler un item d'une collection
- Évite de dupliquer la logique de lecture/mise à jour indexée
- Se compose avec d'autres insertions, y compris `insertSelectProperty`

## Pixel Art examples

- [Pixel Art (1D grid)](https://github.com/ng-angular-stack/ng-craft/blob/main/apps/demo/src/app/examples/primitives/pixel-art/pixel-art.ts)
- [Pixel Art Matrix (2D grid)](https://github.com/ng-angular-stack/ng-craft/blob/main/apps/demo/src/app/examples/primitives/pixel-art-matrix/pixel-art-matrix.ts)

## See also

- [insertSelectProperty](/insertions/insert-select-property)
- [state](/primitives/state)

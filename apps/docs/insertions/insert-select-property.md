# insertSelectProperty

`insertSelectProperty` ajoute une méthode `select<Property>()` sur un state objet pour cibler une propriété imbriquée (ex: `selectCell()`), y ajouter des méthodes/computed, et conserver l'accès aux champs de la propriété.

## Import

```typescript
import { computed } from '@angular/core';
import { insertSelectProperty, state } from '@craft-ng/core';
```

## Basic Usage

```typescript
const board = state(
  {
    cell: {
      color: 'white',
      paintCount: 0,
    },
  },
  insertSelectProperty('cell', ({ update, state }) => ({
    paint: () =>
      update((cell) => ({
        ...cell,
        color: 'black',
        paintCount: cell.paintCount + 1,
      })),
    paintCountStr: computed(() => `Painted ${state().paintCount} times`),
  })),
);

board.selectCell().paint();
console.log(board.selectCell().paintCountStr()); // "Painted 1 times"
```

## Why use it

- Ajoute de la logique au niveau d'une propriété imbriquée sans extraire un nouveau state
- Conserve un typage strict des méthodes ajoutées
- Permet de composer des insertions imbriquées

## Pixel Art examples

- [Pixel Art (1D grid)](https://github.com/ng-angular-stack/ng-craft/blob/main/apps/demo/src/app/examples/primitives/pixel-art/pixel-art.ts)
- [Pixel Art Matrix (2D grid)](https://github.com/ng-angular-stack/ng-craft/blob/main/apps/demo/src/app/examples/primitives/pixel-art-matrix/pixel-art-matrix.ts)

## See also

- [insertSelectItem](/insertions/insert-select-item)
- [state](/primitives/state)

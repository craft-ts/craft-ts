```ts
import { computed } from '@angular/core';
import { insertSelect, state } from '@craft-ng/core';

const board = state(
  {
    ui: { activeColor: '#0f172a' },
    cellsData: [{ color: '#f8fafc', paintCount: 0 }],
  },
  insertSelect('ui', ({ update }) => ({
    setActiveColor: (color: string) =>
      update((current) => ({ ...current, activeColor: color })),
  })),
  ({ state }) => ({
    activeColor: computed(() => state().ui.activeColor),
  }),
  insertSelect(
    'cellsData',
    insertSelect('cell', ({ state, update, insertions: { activeColor } }) => ({
      // exposed actions for the cell level
      paint: () =>
        update((cell) => ({
          ...cell,
          color: cell.color === activeColor ? 'white' : activeColor,
          paintCount: cell.paintCount + 1,
        })),
      // exposed computed at cell level
      paintCountStr: computed(() => `Painted ${state().paintCount} times`),
    })),
  ),
);
board.selectUi().setActiveColor('red');
board.activeColor(); // "red"
board.selectCellsData().selectCell(0).paint();
board.selectCellsData().selectCell(0).paintCountStr(); // "Painted 1 times"
```

import { signal } from '@angular/core';
import {
  button,
  craftComponent,
  div,
  each,
  h1,
  header,
  p,
  section,
} from '@craft-ng/component';

type Cell = {
  readonly id: number;
  readonly color: string;
  readonly count: number;
};
const SIZE = 16;
const EMPTY = '#f8fafc';
const COLORS = ['#0f172a', '#ef4444', '#22c55e', '#3b82f6', '#eab308'];
let nextCellId = SIZE ** 2;

const makeGrid = (): Cell[][] =>
  Array.from({ length: SIZE }, (_, row) =>
    Array.from({ length: SIZE }, (_, column) => ({
      id: row * SIZE + column,
      color: EMPTY,
      count: 0,
    })),
  );

const PixelArtMatrix = craftComponent(
  'PixelArtMatrix',
  {
    styles: `
      .matrix-grid{display:grid;gap:1px}.matrix-row{display:flex;gap:1px}.matrix-cell{width:22px;height:22px;border:1px solid #e2e8f0;padding:0}.matrix-palette{display:flex;gap:8px;margin:1rem 0}.matrix-color{width:32px;height:32px}
    `,
  },
  () => {
    const activeColor = signal(COLORS[0]);
    const grid = signal(makeGrid());
    const paint = (rowIndex: number, columnIndex: number) =>
      grid.update((rows) =>
        rows.map((row, r) =>
          r === rowIndex
            ? row.map((cell, c) =>
                c === columnIndex
                  ? {
                      ...cell,
                      color:
                        cell.color === activeColor() ? EMPTY : activeColor(),
                      count: cell.count + 1,
                    }
                  : cell,
              )
            : row,
        ),
      );
    const paintRow = (rowIndex: number, color: string) =>
      grid.update((rows) =>
        rows.map((row, r) =>
          r === rowIndex
            ? row.map((cell) => ({
                ...cell,
                color,
                count: cell.count + 1,
              }))
            : row,
        ),
      );
    const addRow = () =>
      grid.update((rows) => [
        ...rows,
        Array.from({ length: rows[0]?.length ?? SIZE }, () => ({
          id: nextCellId++,
          color: EMPTY,
          count: 0,
        })),
      ]);
    const addCell = (rowIndex: number) =>
      grid.update((rows) =>
        rows.map((row, r) =>
          r === rowIndex
            ? [...row, { id: nextCellId++, color: EMPTY, count: 0 }]
            : row,
        ),
      );
    return { activeColor, grid, paint, paintRow, addRow, addCell };
  },
  ({ activeColor, grid, paint, paintRow, addRow, addCell }) =>
    section([
      header([
        h1('Pixel Art Workshop (Matrix)'),
        p('2D matrix: click paints, right-click paints a row.'),
      ]),
      div(
        { class: 'matrix-palette' },
        each(COLORS, { track: (color) => color }, (color) =>
          button({
            class: 'matrix-color',
            style: { backgroundColor: color },
            click: () => activeColor.set(color),
          }),
        ),
      ),
      button({ click: () => grid.set(makeGrid()) }, 'Reset'),
      div(
        { class: 'matrix-grid' },
        each(
          grid,
          { track: (row) => row[0]?.id ?? row.length },
          (row, rowIndex) =>
            div({ class: 'matrix-row' }, [
              each(row, { track: (cell) => cell.id }, (cell, columnIndex) =>
                button({
                  class: 'matrix-cell',
                  style: { backgroundColor: cell.color },
                  click: () => paint(rowIndex, columnIndex),
                  contextmenu: (event) => {
                    event.preventDefault();
                    paintRow(rowIndex, cell.color);
                  },
                }),
              ),
              button({ click: () => addCell(rowIndex) }, '+'),
            ]),
        ),
      ),
      button({ click: addRow }, 'Add row'),
    ]),
);

export default PixelArtMatrix;

import styles from './pixel-art-matrix.css' with { loader: 'text' };
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
import { state } from '@craft-ng/core';

type Cell = {
  readonly id: number;
  readonly color: string;
  readonly count: number;
};
const SIZE = 16;
const EMPTY = '#f8fafc';
const COLORS = ['#0f172a', '#ef4444', '#22c55e', '#3b82f6', '#eab308'];
let nextCellId = SIZE ** 2;

const trackGridRow = (row: Cell[]) => row[0]?.id ?? row.length;

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
    stylesUrl: styles,
  },
  function* () {
    const activeColor = yield* state('activeColor', COLORS[0], ({ set }) => ({
      setColor: (color: string) => set(color),
    }));
    const grid = yield* state('grid', makeGrid(), ({ set, update }) => ({
      paint: (rowIndex: number, columnIndex: number) =>
        update((rows) =>
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
        ),
      paintRow: (rowIndex: number, color: string) =>
        update((rows) =>
          rows.map((row, r) =>
            r === rowIndex
              ? row.map((cell) => ({
                  ...cell,
                  color,
                  count: cell.count + 1,
                }))
              : row,
          ),
        ),
      addRow: () =>
        update((rows) => [
          ...rows,
          Array.from({ length: rows[0]?.length ?? SIZE }, () => ({
            id: nextCellId++,
            color: EMPTY,
            count: 0,
          })),
        ]),
      addCell: (rowIndex: number) =>
        update((rows) =>
          rows.map((row, r) =>
            r === rowIndex
              ? [...row, { id: nextCellId++, color: EMPTY, count: 0 }]
              : row,
          ),
        ),
      reset: () => set(makeGrid()),
    }));
    return { activeColor, grid };
  },
  ({ activeColor, grid }) =>
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
            click: () => activeColor.setColor(color),
          }),
        ),
      ),
      button({ click: grid.reset }, 'Reset'),
      div(
        { class: 'matrix-grid' },
        each(grid, { track: trackGridRow }, (row, rowIndex) =>
          div({ class: 'matrix-row' }, [
            each(row, { track: (cell) => cell.id }, (cell, columnIndex) =>
              button({
                class: 'matrix-cell',
                style: { backgroundColor: cell.color },
                click: () => grid.paint(rowIndex, columnIndex),
                contextmenu: (event) => {
                  event.preventDefault();
                  grid.paintRow(rowIndex, cell.color);
                },
              }),
            ),
            button({ click: () => grid.addCell(rowIndex) }, '+'),
          ]),
        ),
      ),
      button({ click: grid.addRow }, 'Add row'),
    ]),
);

export default PixelArtMatrix;

/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import styles from './pixel-art-matrix.css' with { loader: 'text' };
import {
  button,
  craftComponent,
  div,
  each,
  header,
  p,
  section,
  heading,
} from '@craft-ts/component';
import { state } from '@craft-ts/core';
import {
  LONG_PRESS_DURATION_MS,
  longPress,
} from './long-press.directive';

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
      paint: function* (rowIndex: number, columnIndex: number) {
        const activeColorValue = yield* activeColor();
        return yield* update((rows) =>
          rows.map((row, r) =>
            r === rowIndex
              ? row.map((cell, c) =>
                  c === columnIndex
                    ? {
                        ...cell,
                        color:
                          cell.color === activeColorValue
                            ? EMPTY
                            : activeColorValue,
                        count: cell.count + 1,
                      }
                    : cell,
                )
              : row,
          ),
        );
      },
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
      paintColumn: (columnIndex: number, color: string) =>
        update((rows) =>
          rows.map((row) =>
            row.map((cell, c) =>
              c === columnIndex
                ? {
                    ...cell,
                    color,
                    count: cell.count + 1,
                  }
                : cell,
            ),
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
        heading('Pixel Art Workshop (Matrix)'),
        p(
          '2D matrix: click paints, right-click paints a row, long-press paints a column.',
        ),
      ]),
      div(
        { class: 'matrix-palette' },
        each(COLORS, { track: (color) => color }, (color) =>
          button('color', { type: 'button',
            class: 'matrix-color',
            style: function* () {
              return { backgroundColor: yield* color() };
            },
            'aria-label': function* () {
              return `Color ${yield* color()}`;
            },
            *click() {
              yield* activeColor.setColor(yield* color());
            },
          }),
        ),
      ),
      button('reset', { type: 'button', click: grid.reset }, 'Reset'),
      div(
        { class: 'matrix-grid' },
        each(grid, { track: trackGridRow }, (row, rowIndex) =>
          div({ class: 'matrix-row' }, [
            each(row, { track: (cell) => cell.id }, (cell, columnIndex) =>
              button('cell', { type: 'button',
                class: 'matrix-cell',
                style: function* () {
                  return { backgroundColor: (yield* cell()).color };
                },
                'aria-label': function* () {
                  return `Cell ${rowIndex + 1}, ${columnIndex + 1}`;
                },
                longPressDuration: LONG_PRESS_DURATION_MS,
                *onLongPress() {
                  yield* grid.paintColumn(columnIndex, (yield* cell()).color);
                },
                *click() {
                  yield* grid.paint(rowIndex, columnIndex);
                },
                *contextmenu(event: MouseEvent) {
                  event.preventDefault();
                  yield* grid.paintRow(rowIndex, (yield* cell()).color);
                },
              }).pipe(longPress),
            ),
            button('addCell',
              { type: 'button',
                *click() {
                  yield* grid.addCell(rowIndex);
                },
              },
              '+',
            ),
          ]),
        ),
      ),
      button('addRow', { type: 'button', click: grid.addRow }, 'Add row'),
    ]),
);

export default PixelArtMatrix;

import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import {
  addOne,
  insertLocalStoragePersister,
  insertSelect,
  on$,
  source$,
  state,
} from '@craft-ng/core';
import { LongPressDirective } from './long-press.directive';

type PixelCellState = {
  index: number;
  columnIndex: number;
  color: string;
  paintCount: number;
};
type PaintCellEvent = {
  color: string;
  cellIndex: number;
};

const GRID_SIZE = 16;
const EMPTY_COLOR = '#f8fafc';
const DEFAULT_ACTIVE_COLOR = '#0f172a';
const COLOR_PALETTE = ['#0f172a', '#ef4444', '#22c55e', '#3b82f6', '#eab308'];
const ROW_INDEXES = Array.from(
  { length: GRID_SIZE },
  (_unused, index) => index,
);
const CELL_INDEXES = Array.from(
  { length: GRID_SIZE },
  (_unused, cellIndex) => cellIndex,
);

const createInitialGrid = (): PixelCellState[][] =>
  ROW_INDEXES.map((rowIndex) =>
    CELL_INDEXES.map((cellIndex) => ({
      index: rowIndex * GRID_SIZE + cellIndex,
      columnIndex: cellIndex,
      color: EMPTY_COLOR,
      paintCount: 0,
    })),
  );

@Component({
  selector: 'app-pixel-art-matrix',
  imports: [LongPressDirective],
  template: `
    <section class="pixel-art">
      <header class="pixel-art__header">
        <h1>Pixel Art Workshop (Matrix)</h1>
        <p>16x16 grid modeled as a 2D array (rows -> cells).</p>
        <p>
          Note: this example is intentionally "fairly" complex to showcase
          multiple patterns together.
        </p>
        <p>Interactions:</p>
        <ul>
          <li>Left click paints a cell.</li>
          <li>Right click copies the target cell color to the full row.</li>
          <li>
            Long press/touch paints the full column with the target color.
          </li>
          <li>"+" adds a cell to a row.</li>
          <li>"Add row" appends a new row.</li>
          <li>
            "Reset" resets all colors, paint counts, and active color, rows, and
            columns.
          </li>
        </ul>
      </header>

      <div class="pixel-art__controls">
        <div class="pixel-art__palette">
          @for (color of colorPalette; track color) {
            <button
              type="button"
              class="pixel-art__color"
              [class.active]="matrix.selectUi().activeColor === color"
              [style.background-color]="color"
              (click)="matrix.selectUi().setActiveColor(color)"
              [attr.aria-label]="'Choose color ' + color"
            ></button>
          }
        </div>
        <button type="button" (click)="matrix.resetAll$()">Reset</button>
      </div>

      <div class="pixel-art__stats">
        <span
          >Painted cells: {{ matrix.selectGrid().paintedCount() }}/{{
            matrix.selectGrid().totalCells()
          }}</span
        >
      </div>

      <div
        class="pixel-art__grid"
        role="grid"
        aria-label="Pixel Art 16x16 matrix"
      >
        @for (rowIndex of matrix.selectGrid().rowIndexes(); track rowIndex) {
          @let row = matrix.selectGrid().selectRow(rowIndex);
          <div class="pixel-art__row">
            <div class="pixel-art__row-cells">
              @for (
                cellState of row;
                track cellState.index;
                let cellIndex = $index
              ) {
                @let cellItem = row?.selectCell(cellIndex);
                <button
                  type="button"
                  role="gridcell"
                  class="pixel-art__cell"
                  [style.background-color]="cellItem?.color ?? emptyColor"
                  (click)="cellItem?.paint()"
                  [appLongPress]="450"
                  (longPress)="
                    matrix.selectGrid().paintColumnWithTargetCellColor$({
                      color: cellItem?.color ?? emptyColor,
                      cellIndex: cellIndex,
                    })
                  "
                  (contextmenu)="
                    $event.preventDefault();
                    row?.paintRowWithTargetCellColor$({
                      color: cellItem?.color ?? emptyColor,
                      cellIndex: cellIndex,
                    })
                  "
                  [attr.aria-label]="
                    'Cell row ' + (rowIndex + 1) + ', column ' + (cellIndex + 1)
                  "
                  [attr.title]="
                    'Row ' +
                    (rowIndex + 1) +
                    ', column ' +
                    (cellIndex + 1) +
                    ' - ' +
                    (cellItem?.paintCountStr() ?? 'Painted 0 times')
                  "
                ></button>
              }
            </div>
            <button
              type="button"
              class="pixel-art__add-btn"
              (click)="row?.addCell()"
              [attr.aria-label]="'Add cell to row ' + (rowIndex + 1)"
              [attr.title]="'Add cell to row ' + (rowIndex + 1)"
            >
              +
            </button>
          </div>
        }
        <button
          type="button"
          class="pixel-art__add-btn pixel-art__add-btn--row"
          (click)="matrix.selectGrid().addRow()"
        >
          Add row
        </button>
      </div>
    </section>
  `,
  styleUrls: ['./pixel-art-matrix.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class PixelArtMatrix {
  protected readonly emptyColor = EMPTY_COLOR;
  protected readonly colorPalette = COLOR_PALETTE;

  protected readonly matrix = state(
    {
      ui: {
        activeColor: DEFAULT_ACTIVE_COLOR,
      },
      grid: createInitialGrid(),
    },
    insertLocalStoragePersister({
      key: 'pixel-art-matrix-state',
      storeName: 'pixel-art-matrix',
    }),
    () => ({
      resetAll$: source$<void>(),
    }),
    insertSelect('ui', ({ set, insertions: { resetAll$ } }) => ({
      resetColor$: on$(resetAll$, () =>
        set({ activeColor: DEFAULT_ACTIVE_COLOR }),
      ),
      setActiveColor: (color: string) => set({ activeColor: color }),
    })),
    insertSelect(
      'grid',
      ({ state, update, set, insertions: { resetAll$ } }) => ({
        paintColumnWithTargetCellColor$: source$<PaintCellEvent>(),
        addRow: () =>
          update((currentGrid) => {
            const columnCount = currentGrid[0]?.length ?? GRID_SIZE;
            const nextIndex = currentGrid
              .flat()
              .reduce((max, cell) => Math.max(max, cell.index), -1);
            const newRow = Array.from(
              { length: columnCount },
              (_unused, i) => ({
                index: nextIndex + i + 1,
                columnIndex: i,
                color: EMPTY_COLOR,
                paintCount: 0,
              }),
            );

            return [...currentGrid, newRow];
          }),
        resetGrid: on$(resetAll$, () => set(createInitialGrid())),
        rowIndexes: computed(() => state().map((_row, index) => index)),
        totalCells: computed(() =>
          state().reduce((count, row) => count + row.length, 0),
        ),
        paintedCount: computed(() =>
          state().reduce(
            (count, row) =>
              count + row.filter((cell) => cell.color !== EMPTY_COLOR).length,
            0,
          ),
        ),
      }),
      insertSelect(
        'row',
        ({ state, set }) => ({
          addCell: () => {
            const nextIndex = state().reduce(
              (max, cell) => Math.max(max, cell.index),
              -1,
            );
            return set(
              addOne({
                entities: state(),
                entity: {
                  index: nextIndex + 1,
                  columnIndex: state().length,
                  color: EMPTY_COLOR,
                  paintCount: 0,
                },
              }),
            );
          },
          paintRowWithTargetCellColor$: source$<PaintCellEvent>(),
        }),
        insertSelect(
          'cell',
          ({
            state,
            update,
            insertions: {
              paintRowWithTargetCellColor$,
              paintColumnWithTargetCellColor$,
            },
          }) => ({
            paint: () =>
              update((targetCell) => ({
                ...targetCell,
                color:
                  targetCell.color === this.matrix.selectUi().activeColor
                    ? EMPTY_COLOR
                    : this.matrix.selectUi().activeColor,
                paintCount: targetCell.paintCount + 1,
              })),
            paintCountStr: computed(
              () => `Painted ${state().paintCount} times`,
            ),
            paintCellOnSameRow: on$(paintRowWithTargetCellColor$, ({ color }) =>
              update((targetCell) => ({
                ...targetCell,
                color,
                paintCount: targetCell.paintCount + 1,
              })),
            ),
            paintCellOnSameColumn: on$(
              paintColumnWithTargetCellColor$,
              ({ color, cellIndex }) =>
                update((targetCell) =>
                  targetCell.columnIndex === cellIndex
                    ? {
                        ...targetCell,
                        color,
                        paintCount: targetCell.paintCount + 1,
                      }
                    : targetCell,
                ),
            ),
          }),
        ),
      ),
    ),
  );
}

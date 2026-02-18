import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { insertSelectItem, state } from '@craft-ng/core';

type PixelCellState = {
  index: number;
  color: string;
  paintCount: number;
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
      color: EMPTY_COLOR,
      paintCount: 0,
    })),
  );

@Component({
  selector: 'app-pixel-art-matrix',
  template: `
    <section class="pixel-art">
      <header class="pixel-art__header">
        <h1>Pixel Art Workshop (Matrix)</h1>
        <p>16x16 grid modeled as a 2D array (rows -> cells).</p>
        <p>
          Note: this example is intentionally "fairly" complex to showcase
          multiple patterns together.
        </p>
      </header>

      <div class="pixel-art__controls">
        <div class="pixel-art__palette">
          @for (color of colorPalette; track color) {
            <button
              type="button"
              class="pixel-art__color"
              [class.active]="ui().activeColor === color"
              [style.background-color]="color"
              (click)="ui.setActiveColor(color)"
              [attr.aria-label]="'Choose color ' + color"
            ></button>
          }
        </div>
        <button type="button" (click)="grid.clearAll()">Clear</button>
      </div>

      <div class="pixel-art__stats">
        <span
          >Painted cells: {{ grid.paintedCount() }}/{{
            grid.totalCells()
          }}</span
        >
        <span>Total clicks: {{ grid.totalPaintActions() }}</span>
      </div>

      <div
        class="pixel-art__grid"
        role="grid"
        aria-label="Pixel Art 16x16 matrix"
      >
        @for (rowData of grid(); track rowData; let rowIndex = $index) {
          @let row = grid.selectItem(rowIndex);
          <div class="pixel-art__row">
            <div class="pixel-art__row-cells">
              @for (
                cellState of row;
                track cellState.index;
                let cellIndex = $index
              ) {
                @let cellItem = row?.selectItem(cellIndex);
                <button
                  type="button"
                  role="gridcell"
                  class="pixel-art__cell"
                  [style.background-color]="cellItem?.color ?? emptyColor"
                  (click)="cellItem?.paint()"
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
          (click)="grid.addRow()"
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

  protected readonly ui = state(
    {
      activeColor: DEFAULT_ACTIVE_COLOR,
    },
    ({ update }) => ({
      setActiveColor: (color: string) =>
        update((current) => ({ ...current, activeColor: color })),
    }),
  );

  protected readonly grid = state(
    createInitialGrid(),
    insertSelectItem(
      ({ state, set }) => ({
        addCell: () => {
          const nextIndex = state().reduce(
            (max, cell) => Math.max(max, cell.index),
            -1,
          );
          return set([
            ...state(),
            {
              index: nextIndex + 1,
              color: EMPTY_COLOR,
              paintCount: 0,
            },
          ]);
        },
      }),
      insertSelectItem(({ state, update }) => ({
        paint: () =>
          update((targetCell) => ({
            ...targetCell,
            color:
              targetCell.color === this.ui().activeColor
                ? EMPTY_COLOR
                : this.ui().activeColor,
            paintCount: targetCell.paintCount + 1,
          })),
        paintCountStr: computed(() => `Painted ${state().paintCount} times`),
      })),
    ),
    ({ state, update }) => ({
      addRow: () =>
        update((currentGrid) => {
          const columnCount = currentGrid[0]?.length ?? GRID_SIZE;
          const nextIndex = currentGrid
            .flat()
            .reduce((max, cell) => Math.max(max, cell.index), -1);
          const newRow = Array.from({ length: columnCount }, (_unused, i) => ({
            index: nextIndex + i + 1,
            color: EMPTY_COLOR,
            paintCount: 0,
          }));

          return [...currentGrid, newRow];
        }),
      clearAll: () =>
        update((currentGrid) =>
          currentGrid.map((row) =>
            row.map((cell) => ({
              ...cell,
              color: EMPTY_COLOR,
            })),
          ),
        ),
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
      totalPaintActions: computed(() =>
        state().reduce(
          (count, row) =>
            count +
            row.reduce((rowCount, cell) => rowCount + cell.paintCount, 0),
          0,
        ),
      ),
    }),
  );
}

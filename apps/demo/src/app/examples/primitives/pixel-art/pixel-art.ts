import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import { insertSelectItem, state } from '@craft-ng/core';

type PixelCellState = {
  index: number;
  color: string;
  paintCount: number;
};

const GRID_SIZE = 16;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;
const EMPTY_COLOR = '#f8fafc';
const DEFAULT_ACTIVE_COLOR = '#0f172a';
const COLOR_PALETTE = ['#0f172a', '#ef4444', '#22c55e', '#3b82f6', '#eab308'];
const CELL_INDEXES = Array.from(
  { length: TOTAL_CELLS },
  (_unused, index) => index,
);

@Component({
  selector: 'app-pixel-art',
  template: `
    <section class="pixel-art">
      <header class="pixel-art__header">
        <h1>Atelier Pixel Art</h1>
        <p>Grille 16x16 avec state parallèle (un state par case).</p>
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
              [attr.aria-label]="'Choisir la couleur ' + color"
            ></button>
          }
        </div>
        <button type="button" (click)="cells.clearAll()">Effacer</button>
      </div>

      <div class="pixel-art__stats">
        <span>Cases peintes: {{ cells.paintedCount() }}/{{ totalCells }}</span>
        <span>Clics totaux: {{ cells.totalPaintActions() }}</span>
      </div>

      <div class="pixel-art__grid" role="grid" aria-label="Pixel Art 16x16">
        @for (index of cellIndexes; track index) {
          @let cell = cells.selectItem(index);
          <button
            type="button"
            role="gridcell"
            class="pixel-art__cell"
            [style.background-color]="cell?.color ?? emptyColor"
            (click)="cell?.paint()"
            [attr.aria-label]="'Case ' + (index + 1)"
            [attr.title]="
              'Case ' +
              (index + 1) +
              ' - ' +
              (cell?.paintCountStr() ?? 'Painted 0 times')
            "
          ></button>
        }
      </div>
    </section>
  `,
  styleUrls: ['./pixel-art.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class PixelArt {
  protected readonly totalCells = TOTAL_CELLS;
  protected readonly emptyColor = EMPTY_COLOR;
  protected readonly colorPalette = COLOR_PALETTE;
  protected readonly cellIndexes = CELL_INDEXES;

  protected readonly ui = state(
    {
      activeColor: DEFAULT_ACTIVE_COLOR,
    },
    ({ update }) => ({
      setActiveColor: (color: string) =>
        update((current) => ({ ...current, activeColor: color })),
    }),
  );

  protected readonly cells = state(
    {
      from: signal(CELL_INDEXES).asReadonly(),
      identifier: (index) => index,
      state: ({
        params: { index },
      }: {
        params: { item: number; index: number };
      }) =>
        ({
          index,
          color: EMPTY_COLOR,
          paintCount: 0,
        }) satisfies PixelCellState,
    },
    insertSelectItem(({ state, update }) => ({
      paint: () =>
        update((cell) => ({
          ...cell,
          color:
            cell.color === this.ui().activeColor
              ? EMPTY_COLOR
              : this.ui().activeColor,
          paintCount: cell.paintCount + 1,
        })),
      paintCountStr: computed(() => `Painted ${state().paintCount} times`),
    })),
    ({ stateById }) => ({
      clearAll: () => {
        const keys = Object.keys(stateById.state());
        for (const key of keys) {
          const id = Number(key);
          stateById.select(id)?.update((cell) => ({
            ...cell,
            color: EMPTY_COLOR,
          }));
        }
      },
      paintedCount: computed(() => {
        const cells = Object.values(stateById.state());
        return cells.filter((cell) => cell && cell.color !== EMPTY_COLOR)
          .length;
      }),
      totalPaintActions: computed(() => {
        const cells = Object.values(stateById.state());
        return cells.reduce(
          (count, cell) => count + (cell?.paintCount ?? 0),
          0,
        );
      }),
    }),
  );
}

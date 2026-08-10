import styles from './pixel-art.css' with { loader: 'text' };
import { computed } from '@angular/core';
import {
  button,
  craftComponent,
  div,
  each,
  h1,
  header,
  p,
  section,
  span,
} from '@craft-ng/component';
import {
  insertLocalStoragePersister,
  insertSelect,
  insertStatePipe,
  state,
} from '@craft-ng/core';

const GRID_SIZE = 16;
const EMPTY_COLOR = '#f8fafc';
const COLORS = ['#0f172a', '#ef4444', '#22c55e', '#3b82f6', '#eab308'];
const INDEXES = Array.from({ length: GRID_SIZE ** 2 }, (_, index) => index);

const cellColor = (cell: { color: string } | undefined) =>
  cell?.color ?? EMPTY_COLOR;

const PixelArt = craftComponent(
  'PixelArt',
  {
    stylesUrl: styles,
  },
  function* () {
    const ui = yield* state(
      'ui',
      { activeColor: COLORS[0] },
      insertStatePipe(
        ({ update }) => ({
          setActiveColor: (activeColor: string) =>
            update(() => ({ activeColor })),
        }),
        insertLocalStoragePersister({
          key: 'pixel-art-ui-state',
          storeName: 'pixel-art-ui',
        }),
      ),
    );
    const cells = yield* state(
      'cells',
      INDEXES.map((index) => ({
        index,
        color: EMPTY_COLOR,
        paintCount: 0,
      })),
      insertStatePipe(
        insertLocalStoragePersister({
          key: 'pixel-art-cells-state',
          storeName: 'pixel-art-cells',
        }),
        insertSelect('cell', ({ update }) => ({
          paint: () =>
            update((cell) => ({
              ...cell,
              color:
                cell.color === ui().activeColor
                  ? EMPTY_COLOR
                  : ui().activeColor,
              paintCount: cell.paintCount + 1,
            })),
        })),
        ({ state, update }) => ({
          clearAll: () =>
            update((current) =>
              current.map((cell) => ({ ...cell, color: EMPTY_COLOR })),
            ),
          paintedCount: computed(
            () => state().filter(({ color }) => color !== EMPTY_COLOR).length,
          ),
          totalPaintActions: computed(() =>
            state().reduce((total, { paintCount }) => total + paintCount, 0),
          ),
        }),
      ),
    );
    return { ui, cells };
  },
  ({ ui, cells }) =>
    section([
      header([
        h1('Atelier Pixel Art'),
        p('Grille 16×16 avec state simple et insertions par case.'),
      ]),
      div(
        { class: 'pixel-palette' },
        each(COLORS, { track: (color) => color }, (color) =>
          button({
            class: 'pixel-color',
            style: { backgroundColor: color },
            'aria-label': `Choisir ${color}`,
            *click() {
              yield* ui.setActiveColor(color);
            },
          }),
        ),
      ),
      button(
        {
          *click() {
            yield* cells.clearAll();
          },
        },
        'Effacer',
      ),
      p([
        span(() => `Cases peintes: ${cells.paintedCount()}/${INDEXES.length}`),
        span(() => ` · Clics: ${cells.totalPaintActions()}`),
      ]),
      div(
        { class: 'pixel-grid', role: 'grid' },
        each(INDEXES, { track: (index) => index }, (index) => {
          const cell = cells.selectCell(index);
          return button({
            class: 'pixel-cell',
            style: { backgroundColor: cellColor(cell) },
            title: `Case ${index + 1}`,
            click: () => cell?.paint(),
          });
        }),
      ),
    ]),
);

export default PixelArt;

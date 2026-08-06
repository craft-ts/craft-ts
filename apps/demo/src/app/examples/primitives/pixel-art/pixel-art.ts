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

const PixelArt = craftComponent(
  'PixelArt',
  {
    styles: `
      .pixel-grid{display:grid;grid-template-columns:repeat(16,22px);gap:1px}.pixel-cell{width:22px;height:22px;border:1px solid #e2e8f0;padding:0}.pixel-palette{display:flex;gap:8px;margin:1rem 0}.pixel-color{width:32px;height:32px;border:2px solid #fff;box-shadow:0 0 0 1px #94a3b8}
    `,
  },
  function* () {
    const { ui } = yield* state(
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
    const { cells } = yield* state(
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
            click: () => ui.setActiveColor(color),
          }),
        ),
      ),
      button({ click: cells.clearAll }, 'Effacer'),
      p([
        span(`Cases peintes: ${cells.paintedCount()}/${INDEXES.length}`),
        span(` · Clics: ${cells.totalPaintActions()}`),
      ]),
      div(
        { class: 'pixel-grid', role: 'grid' },
        each(INDEXES, { track: (index) => index }, (index) => {
          const cell = cells.selectCell(index);
          return button({
            class: 'pixel-cell',
            style: { backgroundColor: cell?.color ?? EMPTY_COLOR },
            title: `Case ${index + 1}`,
            click: () => cell?.paint(),
          });
        }),
      ),
    ]),
);

export default PixelArt;

/* eslint-disable craft-ng/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import styles from './pixel-art.css' with { loader: 'text' };
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
  insertStoragePersister,
  craftUnique,
  insertSelect,
  insertStatePipe,
  craftComputed,
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
        insertStoragePersister(craftUnique({
          key: 'pixel-art-ui-state',
          storeName: 'pixel-art-ui',
        })),
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
        insertStoragePersister(craftUnique({
          key: 'pixel-art-cells-state',
          storeName: 'pixel-art-cells',
        })),
        insertSelect('cell', function* ({ update }) {
          return {
            paint: function* () {
              const currentUi = yield* ui();
              return yield* update((cell) => ({
                ...cell,
                color:
                  cell.color === currentUi.activeColor
                    ? EMPTY_COLOR
                    : currentUi.activeColor,
                paintCount: cell.paintCount + 1,
              }));
            },
          };
        }),
        ({ state, update }) => ({
          clearAll: () =>
            update((current) =>
              current.map((cell) => ({ ...cell, color: EMPTY_COLOR })),
            ),
          paintedCount: craftComputed('paintedCount', function* () {
            return (yield* state()).filter(
              ({ color }) => color !== EMPTY_COLOR,
            ).length;
          }),
          totalPaintActions: craftComputed(
            'totalPaintActions',
            function* () {
              return (yield* state()).reduce(
                (total, { paintCount }) => total + paintCount,
                0,
              );
            },
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
            style: function* () {
              return { backgroundColor: yield* color() };
            },
            'aria-label': function* () {
              return `Choisir ${yield* color()}`;
            },
            *click() {
              yield* ui.setActiveColor(yield* color());
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
        span(
          function* () {
            return `Cases peintes: ${yield* cells.paintedCount()}/${INDEXES.length}`;
          },
        ),
        span(function* () {
          return ` · Clics: ${yield* cells.totalPaintActions()}`;
        }),
      ]),
      div(
        { class: 'pixel-grid', role: 'grid' },
        each(INDEXES, { track: (index) => index }, (_item, currentIndex) => {
          const cell = cells.selectCell(currentIndex);
          return button({
            class: 'pixel-cell',
            style: function* () {
              return { backgroundColor: cellColor(cell) };
            },
            title: `Case ${currentIndex + 1}`,
            *click() {
              if (cell) {
                yield* cell.paint();
              }
            },
          });
        }),
      ),
    ]),
);

export default PixelArt;

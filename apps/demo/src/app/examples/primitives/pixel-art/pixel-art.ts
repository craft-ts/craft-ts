/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import styles from './pixel-art.css' with { loader: 'text' };
import {
  button,
  craftComponent,
  div,
  forNode,
  scheduleFor,
  header,
  p,
  section,
  span,
  heading,
} from '@craft-ts/component';
import {
  insertStoragePersister,
  craftUnique,
  insertSelect,
  insertStatePipe,
  craftComputed,
  craftMethod,
  state,
} from '@craft-ts/core';

const DEFAULT_GRID_SIZE = 16;
const EMPTY_COLOR = '#f8fafc';
const COLORS = ['#0f172a', '#ef4444', '#22c55e', '#3b82f6', '#eab308'];
const benchmarkParams =
  typeof globalThis.location !== 'undefined'
    ? new URLSearchParams(globalThis.location.search)
    : undefined;
const CELL_COUNT = Math.max(
  1,
  Number(benchmarkParams?.get('cells')) || DEFAULT_GRID_SIZE ** 2,
);
const SCHEDULE_MODE =
  benchmarkParams?.get('schedule') === 'sync' ? 'sync' : 'frame';
const INDEXES = Array.from({ length: CELL_COUNT }, (_, index) => index);

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
        insertStoragePersister(
          craftUnique({
            key: 'pixel-art-ui-state',
            storeName: 'pixel-art-ui',
          }),
        ),
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
        insertStoragePersister(
          craftUnique({
            key: 'pixel-art-cells-state',
            storeName: 'pixel-art-cells',
          }),
        ),
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
            return (yield* state()).filter(({ color }) => color !== EMPTY_COLOR)
              .length;
          }),
          totalPaintActions: craftComputed('totalPaintActions', function* () {
            return (yield* state()).reduce(
              (total, { paintCount }) => total + paintCount,
              0,
            );
          }),
        }),
      ),
    );
    const paintCell = craftMethod('paintCell', function* (index: number) {
      const cell = cells.selectCell(index);
      if (!cell) return;
      yield* cell.paint();
    });
    const pixelGrid = forNode(
      INDEXES,
      { track: (index) => index },
      (_item, currentIndex) =>
        button('cell', {
          type: 'button',
          class: 'pixel-cell',
          style: function* () {
            return {
              backgroundColor: cellColor(cells.selectCell(currentIndex)),
            };
          },
          title: `Cell ${currentIndex + 1}`,
          *click() {
            paintCell(currentIndex);
          },
        }),
    );
    const renderedPixelGrid =
      SCHEDULE_MODE === 'frame'
        ? pixelGrid.pipe(
            scheduleFor({
              enabled: true,
              strategy: 'frame',
              frameBudgetMs: 4,
            }),
          )
        : pixelGrid;

    return { ui, cells, paintCell, renderedPixelGrid };
  },
  ({ ui, cells, renderedPixelGrid }) => {

    return section([
      header([
        heading('Pixel Art Workshop'),
        p(`${CELL_COUNT} cells with simple state and per-cell insertions.`),
      ]),
      div(
        { class: 'pixel-palette' },
        forNode(COLORS, { track: (color) => color }, (color) =>
          button('color', {
            type: 'button',
            class: 'pixel-color',
            style: function* () {
              return { backgroundColor: yield* color() };
            },
            'aria-label': function* () {
              return `Choose ${yield* color()}`;
            },
            *click() {
              yield* ui.setActiveColor(yield* color());
            },
          }),
        ),
      ),
      button(
        'clear',
        {
          type: 'button',
          *click() {
            yield* cells.clearAll();
          },
        },
        'Clear',
      ),
      p([
        span(function* () {
          return `Painted cells: ${yield* cells.paintedCount()}/${INDEXES.length}`;
        }),
        span(function* () {
          return ` · Clicks: ${yield* cells.totalPaintActions()}`;
        }),
      ]),
      div({ class: 'pixel-grid', role: 'grid' }, renderedPixelGrid),
    ]);
  },
);

export default PixelArt;

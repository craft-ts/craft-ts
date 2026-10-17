/**
 * The two pixel-art workshops: a palette of swatches and a grid of cells.
 *
 * A cell's colour is state, so it cannot be a class: it is the one value here
 * written at runtime, through the `pixel.fill` variable and `assign(...)`. The
 * domain keeps its colours as hex strings; `pixelColor(hex)` turns one of them
 * into the palette token the variable accepts. The colours of the workshop are
 * the drawing's own data and keep their palette; the frames and the controls
 * read the Herbier theme.
 */
import {
  aspectRatio,
  bg,
  blockSize,
  borderColor,
  borderStyle,
  borderWidth,
  color,
  craftStyles,
  cssVars,
  cursor,
  definePalette,
  display,
  flex,
  flexDirection,
  gap,
  gridTemplateColumns,
  inlineSize,
  kind,
  lineWidth,
  marginBlock,
  alignItems,
  num,
  p,
  provides,
  radii,
  radius,
  scrollPort,
  space,
  tracks,
  unit,
  type ColorValue,
} from '@craft-ts/style';
import { theme } from '@craft-ts/ui/style';

const pixels = definePalette('pixelArt', {
  surface: {
    empty: { light: '#f8fafc', dark: '#f8fafc' },
    ink: { light: '#0f172a', dark: '#0f172a' },
    red: { light: '#ef4444', dark: '#ef4444' },
    green: { light: '#22c55e', dark: '#22c55e' },
    blue: { light: '#3b82f6', dark: '#3b82f6' },
    yellow: { light: '#eab308', dark: '#eab308' },
  },
});

const BY_HEX: Readonly<Record<string, ColorValue>> = {
  '#f8fafc': pixels.surface.empty,
  '#0f172a': pixels.surface.ink,
  '#ef4444': pixels.surface.red,
  '#22c55e': pixels.surface.green,
  '#3b82f6': pixels.surface.blue,
  '#eab308': pixels.surface.yellow,
};

/** The palette token of one of the workshop's colours (empty for anything else). */
export const pixelColor = (hex: string): ColorValue =>
  BY_HEX[hex] ?? pixels.surface.empty;

/** The fill of one swatch or cell, written with `assign(pixelVars.fill, …)`. */
export const pixelVars = cssVars('pixel', {
  fill: kind.color(pixels.surface.empty, { inherits: false }),
});

const cellFrame = [
  p(space(0)),
  borderWidth(lineWidth.hairline),
  borderStyle.solid,
  borderColor(theme.lineStrong),
  radius(unit.px(3)),
  cursor.pointer,
  bg(pixelVars.fill),
];

export const pixel = craftStyles('pixelArt', {
  palette: [display.flex, alignItems.center, gap(space(2))],
  swatch: [
    inlineSize(unit.rem(1.5)),
    blockSize(unit.rem(1.5)),
    p(space(0)),
    borderWidth(lineWidth.thick),
    borderStyle.solid,
    borderColor(theme.lineStrong),
    radius(radii.full),
    cursor.pointer,
    bg(pixelVars.fill),
  ],
  grid: [display.grid, gridTemplateColumns(tracks.equal(16)), gap(unit.px(4))],
  cell: [...cellFrame, inlineSize(unit.pct(100)), aspectRatio(num(1))],
  matrix: [
    display.flex,
    flexDirection.column,
    gap(unit.px(4)),
    marginBlock(space(4)),
    provides(scrollPort.inline),
  ],
  row: [display.flex, alignItems.center, gap(unit.px(6))],
  matrixCell: [
    ...cellFrame,
    flex(num(0)),
    inlineSize(unit.px(24)),
    blockSize(unit.px(24)),
  ],
  addCell: [
    flex(num(0)),
    inlineSize(unit.px(24)),
    blockSize(unit.px(24)),
    p(space(0)),
    borderWidth(lineWidth.hairline),
    borderStyle.dashed,
    borderColor(theme.inkSubtle),
    radius(radii.md),
    cursor.pointer,
    color(theme.ink),
    bg(theme.raised),
  ],
});

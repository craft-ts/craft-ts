/**
 * The decor: the spruce forest, the contour lines and the botanical plate.
 *
 * Every drawing is a mask painted in a theme colour, so one drawing serves day
 * and night and the forest follows `data-mode` without a second file. They are
 * decoration only: the components that use them are `aria-hidden`, and nothing
 * a reader needs is ever drawn here.
 */
import {
  aspectRatio,
  bgImage,
  blockSize,
  gradient,
  insetBlockStart,
  insetInlineEnd,
  bg,
  borderColor,
  borderRadius,
  borderStyle,
  borderWidth,
  craftStyles,
  defineStateAxis,
  display,
  inlineSize,
  inset,
  lineWidth,
  maskImage,
  maskPosition,
  maskRepeat,
  maskSize,
  num,
  opacity,
  pointerEvents,
  position,
  radii,
  shadow,
  unit,
  url,
  when,
  padding,
  space,
} from '@craft-ts/style';
import { arrivingAfter, theme } from '../foundation/herbier.style.ts';
import { contourMask, FOREST_FRAME, PLATE_FRAME } from './art.style.ts';
/** Which plane of the forest a layer draws, far to near. */
export const layer = defineStateAxis('layer', [
  'back',
  'ridge',
  'middle',
  'near',
  'front',
] as const);

/** Which set of contour lines. */
export const contour = defineStateAxis('contour', ['strong', 'soft'] as const);

/** Which pass of the plate: line work, wash, fruit. */
export const pass = defineStateAxis('pass', [
  'ink',
  'sage',
  'accent',
  'card',
  'moss',
  'snow',
  'ochre',
] as const);

const painted = [
  position.absolute,
  display.block,
  maskRepeat.noRepeat,
  maskPosition.center,
  maskSize(unit.pct(100)),
] as const;

export const forestUi = craftStyles('docForest', {
  root: [
    display.block,
    position.relative,
    inlineSize(unit.pct(100)),
    aspectRatio(num(FOREST_FRAME.width / FOREST_FRAME.height)),
    pointerEvents.none,
  ],
  // The trees of a plane, in the colour of the plane. Which trees — spruce, round, in
  // bloom, under snow — is the season's: the mask is a variable the season writes.
  layer: [
    ...painted,
    inset(unit.px(0)),
    when(layer.back, [bg(theme.forestBack), maskImage(theme.treeBack)]),
    when(layer.ridge, [bg(theme.forestRidge), maskImage(theme.treeRidge)]),
    when(layer.middle, [bg(theme.forestMiddle), maskImage(theme.treeMiddle)]),
    when(layer.near, [bg(theme.forestNear), maskImage(theme.treeNear)]),
    when(layer.front, [bg(theme.forestFront), maskImage(theme.treeFront)]),
  ],
  // What sits on the trees of a plane — blossoms, snow — in the colour of the season's
  // trim. Empty in the seasons that have none.
  trim: [
    ...painted,
    inset(unit.px(0)),
    bg(theme.trim),
    when(layer.back, [maskImage(theme.trimBack)]),
    when(layer.ridge, [maskImage(theme.trimRidge)]),
    when(layer.middle, [maskImage(theme.trimMiddle)]),
    when(layer.near, [maskImage(theme.trimNear)]),
    when(layer.front, [maskImage(theme.trimFront)]),
  ],
});

export const contoursUi = craftStyles('docContours', {
  root: [
    ...painted,
    inset(unit.px(0)),
    bg(theme.contour),
    pointerEvents.none,
    when(contour.strong, [maskImage(url(contourMask('strong')))]),
    when(contour.soft, [maskImage(url(contourMask('soft'))), opacity(num(0.7))]),
  ],
  // The light of the season, from the top corner: a glow that fades into the page. It is
  // the page colour at its edge, so it needs no mask and no alpha.
  glow: [
    position.absolute,
    display.block,
    insetBlockStart(unit.px(0)),
    insetInlineEnd(unit.px(0)),
    inlineSize(unit.pct(70)),
    blockSize(unit.pct(80)),
    pointerEvents.none,
    bgImage(gradient.radial([theme.glow, [theme.surface, unit.pct(70)]])),
  ],
});

export const plateUi = craftStyles('docPlate', {
  root: [
    display.block,
    position.relative,
    inlineSize(unit.pct(100)),
    aspectRatio(num(PLATE_FRAME.width / PLATE_FRAME.height)),
    padding(space(2)),
    borderRadius(radii.md),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(theme.line),
    bg(theme.raised),
    shadow({ y: unit.px(14), blur: unit.px(30), color: theme.shadow }),
    ...arrivingAfter(unit.ms(100)),
  ],
  // One mask per colour of the plate. The drawing of a season uses some of them and leaves
  // the others empty.
  layer: [
    ...painted,
    inset(space(2)),
    when(pass.ink, [bg(theme.ink), maskImage(theme.plateInk)]),
    when(pass.sage, [bg(theme.selected), maskImage(theme.plateSage)]),
    when(pass.accent, [bg(theme.accent2), maskImage(theme.plateAccent)]),
    when(pass.card, [bg(theme.raised), maskImage(theme.plateCard)]),
    when(pass.moss, [bg(theme.decor), maskImage(theme.plateMoss)]),
    when(pass.snow, [bg(theme.snow), maskImage(theme.plateSnow)]),
    when(pass.ochre, [bg(theme.importantSurface), maskImage(theme.plateOchre)]),
  ],
});

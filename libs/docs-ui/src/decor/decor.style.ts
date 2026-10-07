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
import {
  contourMask,
  FOREST_FRAME,
  forestMask,
  PLATE_FRAME,
  plateMask,
} from './art.style.ts';

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
export const pass = defineStateAxis('pass', ['ink', 'sage', 'ochre'] as const);

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
  layer: [
    ...painted,
    inset(unit.px(0)),
    when(layer.back, [bg(theme.forestBack), maskImage(url(forestMask('back')))]),
    when(layer.ridge, [bg(theme.forestRidge), maskImage(url(forestMask('ridge')))]),
    when(layer.middle, [bg(theme.forestMiddle), maskImage(url(forestMask('middle')))]),
    when(layer.near, [bg(theme.forestNear), maskImage(url(forestMask('near')))]),
    when(layer.front, [bg(theme.forestFront), maskImage(url(forestMask('front')))]),
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
  layer: [
    ...painted,
    inset(space(2)),
    when(pass.ink, [bg(theme.ink), maskImage(url(plateMask('ink')))]),
    when(pass.sage, [bg(theme.selected), maskImage(url(plateMask('sage')))]),
    when(pass.ochre, [
      bg(theme.importantSurface),
      maskImage(url(plateMask('ochre'))),
    ]),
  ],
});

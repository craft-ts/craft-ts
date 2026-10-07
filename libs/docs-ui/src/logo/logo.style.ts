/**
 * The mark of craft-ts: the logo's three crossing bars, folds and shadows included, drawn
 * from its own pixels (`scripts/logo-masks.py`) and painted by theme variables.
 *
 * The logo is a continuous gradient, so it is not one flat shape per colour. It is a stack
 * of masks inside one silhouette: eight bands along the gradient, each in one of eight
 * colours that the season and the day or night choose, then the shade of the folds and the
 * pale edge. Painted one over the other, the bands give back the gradient; with other
 * colours they give another gradient, fold for fold.
 */
import {
  aspectRatio,
  bg,
  craftStyles,
  defineStateAxis,
  display,
  inset,
  inlineSize,
  maskImage,
  maskPosition,
  maskRepeat,
  maskSize,
  num,
  pointerEvents,
  position,
  unit,
  url,
  when,
} from '@craft-ts/style';
import { theme } from '../foundation/herbier.style.ts';
import { LOGO_MASKS } from './logo.art.style.ts';

/** Which layer of the mark: a band of the gradient, the shade, the light. */
export const part = defineStateAxis('part', [
  'r0',
  'r1',
  'r2',
  'r3',
  'r4',
  'r5',
  'r6',
  'r7',
  'shade',
  'light',
] as const);

const painted = [
  maskRepeat.noRepeat,
  maskPosition.center,
  maskSize(unit.pct(100)),
] as const;

export const logoUi = craftStyles('docLogo', {
  // The silhouette: everything inside is cut to it, so the layers need no edge of their own.
  root: [
    display.block,
    position.relative,
    inlineSize(unit.pct(100)),
    aspectRatio(num(1)),
    pointerEvents.none,
    ...painted,
    maskImage(url(LOGO_MASKS.sil)),
  ],
  layer: [
    position.absolute,
    display.block,
    inset(unit.px(0)),
    ...painted,
    when(part.r0, [bg(theme.logoR0), maskImage(url(LOGO_MASKS.r0))]),
    when(part.r1, [bg(theme.logoR1), maskImage(url(LOGO_MASKS.r1))]),
    when(part.r2, [bg(theme.logoR2), maskImage(url(LOGO_MASKS.r2))]),
    when(part.r3, [bg(theme.logoR3), maskImage(url(LOGO_MASKS.r3))]),
    when(part.r4, [bg(theme.logoR4), maskImage(url(LOGO_MASKS.r4))]),
    when(part.r5, [bg(theme.logoR5), maskImage(url(LOGO_MASKS.r5))]),
    when(part.r6, [bg(theme.logoR6), maskImage(url(LOGO_MASKS.r6))]),
    when(part.r7, [bg(theme.logoR7), maskImage(url(LOGO_MASKS.r7))]),
    when(part.shade, [bg(theme.logoShade), maskImage(url(LOGO_MASKS.shade))]),
    when(part.light, [bg(theme.logoLight), maskImage(url(LOGO_MASKS.light))]),
  ],
});

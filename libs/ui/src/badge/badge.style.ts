/**
 * The badge: a small label that names a status (`BETA`, `NEW`, `DEPRECATED`).
 *
 * It reads the same three tone variables as the callout. The word is always
 * written out — a badge is never only a colour.
 */
import {
  alignItems,
  bg,
  borderColor,
  borderStyle,
  borderWidth,
  color,
  craftStyles,
  display,
  font,
  fontFamily,
  fontWeight,
  gap,
  letterSpacing,
  lineWidth,
  radii,
  radius,
  set,
  space,
  text,
  textTransform,
  unit,
  px,
  py,
} from '@craft-ts/style';
import {
  sansFont,
  theme,
  toneRules,
  toneVars,
  weight,
} from '../foundation/herbier.style.ts';

export const badgeUi = craftStyles('docBadge', {
  root: [
    display.inlineFlex,
    alignItems.center,
    gap(space(2)),
    py(space(1)),
    px(unit.rem(0.625)),
    fontFamily(sansFont),
    ...font(text.xs),
    fontWeight(weight.semibold),
    letterSpacing(unit.em(0.14)),
    textTransform.uppercase,
    radius(radii.sm),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(toneVars.border),
    bg(toneVars.surface),
    color(toneVars.ink),
    ...toneRules,
    set(theme.glyph, toneVars.ink),
  ],
});

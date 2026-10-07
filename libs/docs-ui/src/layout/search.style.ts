/**
 * The results of a search: one row per page, its title, the heading the words
 * were found under, and a short line of context.
 */
import {
  bg,
  color,
  craftStyles,
  display,
  flexDirection,
  font,
  fontFamily,
  fontWeight,
  gap,
  interaction,
  letterSpacing,
  listStyleType,
  ident,
  marginBlockStart,
  p,
  px,
  py,
  radii,
  radius,
  space,
  text,
  textDecoration,
  when,
  unit,
} from '@craft-ts/style';
import {
  sansFont,
  theme,
  weight,
} from '../foundation/herbier.style.ts';

export const searchUi = craftStyles('docSearch', {
  results: [
    display.flex,
    flexDirection.column,
    gap(unit.px(2)),
    marginBlockStart(space(3)),
    listStyleType(ident('none')),
    p(space(0)),
  ],
  hit: [
    display.flex,
    flexDirection.column,
    gap(unit.px(2)),
    py(space(3)),
    px(space(3)),
    radius(radii.md),
    color(theme.ink),
    textDecoration.none,
    when(interaction.hover, [bg(theme.selected)]),
  ],
  title: [fontFamily(sansFont), ...font(text.sm), fontWeight(weight.semibold)],
  where: [
    ...font(text.xs),
    letterSpacing(unit.em(0.04)),
    color(theme.link),
  ],
  empty: [
    marginBlockStart(space(3)),
    ...font(text.sm),
    color(theme.inkMuted),
  ],
});

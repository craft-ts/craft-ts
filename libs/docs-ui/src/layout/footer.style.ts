/**
 * The foot of a page: a line of links and a note, standing in the forest.
 *
 * The forest is drawn behind the text and never carries it: the words sit on
 * the page colour above the trees, with room left under them for the drawing.
 */
import {
  alignItems,
  bg,
  borderBlockStartColor,
  borderBlockStartStyle,
  borderBlockStartWidth,
  color,
  craftStyles,
  display,
  flexWrap,
  font,
  fontFamily,
  gap,
  justifyContent,
  lineWidth,
  p,
  position,
  px,
  py,
  space,
  text,
  textDecoration,
  interaction,
  when,
  unit,
  marginBlockStart,
  inlineSize,
} from '@craft-ts/style';
import { bp, sansFont, theme } from '../foundation/herbier.style.ts';

export const footerUi = craftStyles('docFooter', {
  root: [
    display.block,
    position.relative,
    marginBlockStart(space(16)),
    bg(theme.surface),
    borderBlockStartWidth(lineWidth.hairline),
    borderBlockStartStyle.solid,
    borderBlockStartColor(theme.line),
  ],
  content: [
    display.flex,
    flexWrap.wrap,
    alignItems.center,
    justifyContent.spaceBetween,
    gap(space(4)),
    px(space(4)),
    py(space(6)),
    position.relative,
    fontFamily(sansFont),
    ...font(text.sm),
    color(theme.inkMuted),
    when(bp.medium, [px(space(8))]),
    when(bp.wide, [px(unit.rem(2.75))]),
  ],
  links: [display.flex, flexWrap.wrap, gap(space(5))],
  link: [
    color(theme.inkMuted),
    textDecoration.underline,
    when(interaction.hover, [color(theme.ink)]),
  ],
  note: [p(space(0))],
  // The trees stand along the very bottom, behind nothing that is read.
  forest: [
    display.block,
    position.relative,
    inlineSize(unit.pct(100)),
  ],
});


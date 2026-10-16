/**
 * The sidebar: the pages of one section, in numbered groups.
 *
 * A group is a small label with a roman numeral in Newsreader italic, then its
 * rows. A group marked `collapsed` is a native `<details>`: it opens and closes
 * from the keyboard with no script, and opens by itself when the page being
 * read is inside it.
 */
import {
  alignItems,
  bg,
  borderBlockEndColor,
  borderBlockEndStyle,
  borderBlockEndWidth,
  color,
  craftStyles,
  cursor,
  display,
  flexDirection,
  font,
  fontFamily,
  fontSize,
  fontStyle,
  fontWeight,
  gap,
  insetBlockEnd,
  insetBlockStart,
  insetInlineEnd,
  insetInlineStart,
  int,
  zIndex,
  letterSpacing,
  lineWidth,
  listStyleType,
  ident,
  marginBlockEnd,
  marginInlineEnd,
  maxBlockSize,
  p,
  paddingInlineStart,
  position,
  provides,
  py,
  scrollPort,
  space,
  text,
  unit,
  px,
  radii,
  radius,
  interaction,
  when,
  borderInlineEndColor,
  borderInlineEndStyle,
  borderInlineEndWidth,
  borderInlineStartColor,
  borderInlineStartStyle,
  borderInlineStartWidth,
  textTransform,
  defineStateAxis,
} from '@craft-ts/style';
import {
  bp,
  displayFont,
  sansFont,
  theme,
  weight,
} from '../foundation/herbier.style.ts';

/** The drawer is open. Below `md` the sidebar is a drawer; from `md` it is always there. */
export const drawer = defineStateAxis('open', ['true'] as const);

export const sidebarUi = craftStyles('docSidebar', {
  root: [
    display.none,
    px(space(4)),
    py(space(6)),
    bg(theme.surface),
    borderInlineEndWidth(lineWidth.hairline),
    borderInlineEndStyle.solid,
    borderInlineEndColor(theme.line),
    // Open, the drawer covers the page under the bar and scrolls by itself: it is not
    // a block above the text that the reader has to scroll through to reach it.
    when(drawer.true, [
      display.block,
      position.fixed,
      insetBlockStart(unit.rem(4.5)),
      insetBlockEnd(space(0)),
      insetInlineStart(space(0)),
      insetInlineEnd(space(0)),
      zIndex(int(20)),
      provides(scrollPort.block),
      // Left open and then widened past `md`, the drawer goes back to being the column:
      // the state attribute outweighs a bare media rule, so the undoing is said here.
      when(bp.medium, [
        position.sticky,
        insetBlockEnd.auto,
        insetInlineStart.auto,
        insetInlineEnd.auto,
      ]),
    ]),
    when(bp.medium, [
      display.block,
      position.sticky,
      insetBlockStart(unit.rem(4.5)),
      maxBlockSize(unit.vh(100)),
      paddingInlineStart(space(8)),
      provides(scrollPort.block),
    ]),
  ],
  groups: [display.flex, flexDirection.column, gap(space(6))],
  group: [display.block],
  heading: [
    display.flex,
    alignItems.baseline,
    gap(space(3)),
    marginBlockEnd(space(2)),
    fontFamily(sansFont),
    ...font(text.xs),
    fontWeight(weight.semibold),
    letterSpacing(unit.em(0.2)),
    textTransform.uppercase,
    color(theme.inkSubtle),
  ],
  numeral: [
    fontFamily(displayFont),
    fontStyle.italic,
    fontSize(unit.rem(0.875)),
    fontWeight(weight.regular),
    letterSpacing(unit.em(0)),
    textTransform.none,
    marginInlineEnd(space(2)),
    color(theme.link),
  ],
  // A group that can fold: its label is the summary of a `<details>`.
  disclosure: [
    marginBlockEnd(space(2)),
    py(space(1)),
    cursor.pointer,
    fontFamily(sansFont),
    ...font(text.xs),
    fontWeight(weight.semibold),
    letterSpacing(unit.em(0.2)),
    textTransform.uppercase,
    color(theme.inkSubtle),
    when(interaction.hover, [color(theme.ink)]),
  ],
  list: [
    display.flex,
    flexDirection.column,
    gap(unit.px(1)),
    listStyleType(ident('none')),
    p(space(0)),
  ],
  // A group inside a group: indented under a rule, not numbered.
  nested: [
    marginBlockEnd(space(1)),
    paddingInlineStart(space(3)),
    borderInlineStartWidth(lineWidth.hairline),
    borderInlineStartStyle.solid,
    borderInlineStartColor(theme.line),
  ],
  summary: [
    py(space(2)),
    px(space(3)),
    radius(radii.sm),
    cursor.pointer,
    fontFamily(sansFont),
    ...font(text.sm),
    fontWeight(weight.semibold),
    color(theme.ink),
    when(interaction.hover, [bg(theme.navHover)]),
  ],
  // The links a phone carries into the drawer; the bar has them from `md` up.
  mobile: [display.block, marginBlockEnd(space(6)), when(bp.medium, [display.none])],
  rule: [
    marginBlockEnd(space(6)),
    borderBlockEndWidth(lineWidth.hairline),
    borderBlockEndStyle.solid,
    borderBlockEndColor(theme.line),
  ],
});

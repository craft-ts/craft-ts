/**
 * The menu and the tooltip: two small floating surfaces.
 *
 * Both are placed with `position: absolute` inside a relatively positioned
 * wrapper, so they work in every browser: there is no anchor positioning to
 * wait for. Their visibility is state, not hover alone — a menu is opened by a
 * button and read from `aria-expanded`, a tooltip is shown by the wrapper's
 * hover or by focus inside it, passed to the bubble through one variable.
 */
import {
  alignItems,
  bg,
  blockSize,
  borderColor,
  borderRadius,
  borderStyle,
  borderWidth,
  color,
  craftStyles,
  cssVars,
  cursor,
  defineStateAxis,
  descendant,
  display,
  flexDirection,
  font,
  fontFamily,
  fontWeight,
  gap,
  insetBlockEnd,
  insetBlockStart,
  insetInlineStart,
  int,
  interaction,
  kind,
  lineWidth,
  marginBlockEnd,
  marginBlockStart,
  marginInlineStart,
  minInlineSize,
  num,
  opacity,
  p,
  pointerEvents,
  position,
  prop,
  px,
  py,
  radii,
  set,
  shadow,
  space,
  text,
  textDecoration,
  textAlign,
  transitions,
  translate,
  unit,
  when,
  whiteSpace,
  zIndex,
} from '@craft-ts/style';
import {
  duration,
  ease,
  monoFont,
  sansFont,
  theme,
  weight,
} from '../foundation/herbier.style.ts';

/** The menu is showing. Written beside `aria-expanded`. */
export const menuState = defineStateAxis('menu-state', ['open'] as const);

export const menuUi = craftStyles('docMenu', {
  root: [display.inlineBlock, position.relative],
  // The trigger: no box, the look of the links it sits among.
  trigger: [
    display.inlineFlex,
    alignItems.center,
    gap(space(1)),
    bg(theme.clear),
    p(space(0)),
    borderWidth(unit.px(0)),
    color(theme.inkMuted),
    fontFamily(sansFont),
    ...font(text.sm),
    fontWeight(weight.medium),
    cursor.pointer,
    set(theme.glyph, theme.inkMuted),
    ...transitions([prop.color], { duration: duration.fast, easing: ease }),
    when(interaction.hover, [color(theme.ink), set(theme.glyph, theme.ink)]),
  ],
  panel: [
    display.none,
    flexDirection.column,
    position.absolute,
    insetBlockStart(unit.pct(100)),
    insetInlineStart(space(0)),
    marginBlockStart(space(2)),
    minInlineSize(unit.rem(13.75)),
    p(space(1)),
    borderRadius(radii.md),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(theme.line),
    bg(theme.raised),
    shadow({ y: unit.px(12), blur: unit.px(26), color: theme.shadow }),
    zIndex(int(40)),
    when(menuState.open, [display.flex]),
  ],
  item: [
    display.flex,
    alignItems.center,
    gap(space(3)),
    blockSize(unit.rem(2.375)),
    px(space(3)),
    borderRadius(radii.sm),
    color(theme.ink),
    fontFamily(sansFont),
    ...font(text.sm),
    fontWeight(weight.medium),
    textDecoration.none,
    cursor.pointer,
    set(theme.glyph, theme.ink),
    when(interaction.hover, [bg(theme.selected)]),
    when(interaction.disabled, [opacity(num(0.45)), cursor.notAllowed]),
  ],
  // A hint pushed to the far end of the row: a shortcut, a destination.
  hint: [
    marginInlineStart(unit.px(0)),
    fontFamily(monoFont),
    ...font(text.xs),
    color(theme.inkMuted),
    textAlign.end,
    whiteSpace.nowrap,
  ],
});

const tipVars = cssVars('docTooltip', {
  // 0 or 1: the wrapper writes it on hover and focus, the bubble reads it.
  show: kind.number(num(0), { inherits: true }),
});

export const tooltipUi = craftStyles('docTooltip', {
  root: [
    display.inlineFlex,
    position.relative,
    set(tipVars.show, num(0)),
    when(interaction.hover, [set(tipVars.show, num(1))]),
    // Keyboard focus inside shows it too: the one door to `:has()`.
    when(descendant.focusVisible, [set(tipVars.show, num(1))]),
  ],
  bubble: [
    display.block,
    position.absolute,
    insetBlockEnd(unit.pct(100)),
    insetInlineStart(unit.pct(50)),
    translate(unit.pct(-50)),
    marginBlockEnd(space(2)),
    py(space(1)),
    px(space(3)),
    borderRadius(radii.sm),
    bg(theme.ink),
    color(theme.surface),
    fontFamily(sansFont),
    ...font(text.xs),
    fontWeight(weight.medium),
    whiteSpace.nowrap,
    pointerEvents.none,
    zIndex(int(40)),
    opacity(tipVars.show),
    ...transitions([prop.opacity], { duration: duration.fast, easing: ease }),
  ],
});

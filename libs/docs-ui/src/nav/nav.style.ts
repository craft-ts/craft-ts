/**
 * Navigation: a row of the sidebar, the trail above a page, the outline on its
 * right and the previous/next pair under it.
 *
 * The current item is not a class: it is `aria-current`, the attribute a screen
 * reader announces, read through the standard `ariaCurrent` axes. The highlight
 * and the announcement cannot drift apart because there is one source. The
 * current row carries two signals — a sage fill and a heavier weight — so it
 * never rests on colour alone.
 */
import {
  alignItems,
  ariaCurrent,
  bg,
  blockSize,
  color,
  craftStyles,
  cssVars,
  display,
  flexDirection,
  flexWrap,
  font,
  fontFamily,
  fontStyle,
  fontWeight,
  gap,
  insetInlineStart,
  interaction,
  kind,
  letterSpacing,
  lineHeight,
  listStyleType,
  ident,
  marginBlockEnd,
  num,
  p,
  paddingInlineStart,
  position,
  prop,
  px,
  py,
  radii,
  radius,
  set,
  space,
  text,
  textDecoration,
  textTransform,
  transitions,
  unit,
  when,
  borderInlineStartColor,
  borderInlineStartStyle,
  borderInlineStartWidth,
  lineWidth,
  flex,
  justifyContent,
  marginInlineStart,
  defineStateAxis,
  borderRadius,
  borderWidth,
  borderStyle,
  borderColor,
  shadow,
} from '@craft-ts/style';
import { variant } from '../button/button.style.ts';
import {
  displayFont,
  duration,
  ease,
  sansFont,
  theme,
  weight,
} from '../foundation/herbier.style.ts';

/** A small spaced label: the heading of a sidebar group, a table head. */
export const eyebrow = [
  fontFamily(sansFont),
  ...font(text.xs),
  fontWeight(weight.semibold),
  letterSpacing(unit.em(0.2)),
  textTransform.uppercase,
  color(theme.inkSubtle),
] as const;

export const navLinkUi = craftStyles('docNavLink', {
  root: [
    display.flex,
    alignItems.center,
    gap(space(3)),
    blockSize(unit.rem(2.375)),
    px(space(3)),
    radius(radii.sm),
    fontFamily(sansFont),
    ...font(text.sm),
    fontWeight(weight.medium),
    color(theme.inkMuted),
    textDecoration.none,
    set(theme.glyph, theme.inkMuted),
    ...transitions([prop.backgroundColor, prop.color], {
      duration: duration.fast,
      easing: ease,
    }),
    when(interaction.hover, [
      bg(theme.navHover),
      color(theme.ink),
      set(theme.glyph, theme.ink),
    ]),
    when(ariaCurrent.page, [
      bg(theme.selected),
      color(theme.link),
      fontWeight(weight.semibold),
      set(theme.glyph, theme.link),
      when(interaction.hover, [bg(theme.selected), color(theme.link)]),
    ]),
  ],
});

export const breadcrumbUi = craftStyles('docBreadcrumb', {
  root: [display.block, ...font(text.sm), color(theme.inkMuted)],
  list: [
    display.flex,
    flexWrap.wrap,
    alignItems.center,
    gap(space(1)),
    listStyleType(ident('none')),
    p(space(0)),
  ],
  item: [display.inlineFlex, alignItems.center, gap(space(1))],
  link: [
    color(theme.inkMuted),
    textDecoration.underline,
    when(interaction.hover, [color(theme.ink)]),
    when(ariaCurrent.page, [
      color(theme.ink),
      fontWeight(weight.semibold),
      textDecoration.none,
    ]),
  ],
});

export const outlineUi = craftStyles('docOutline', {
  root: [display.block, ...font(text.sm)],
  title: [...eyebrow, display.block, marginBlockEnd(space(2))],
  list: [
    display.flex,
    flexDirection.column,
    listStyleType(ident('none')),
    p(space(0)),
    borderInlineStartWidth(lineWidth.hairline),
    borderInlineStartStyle.solid,
    borderInlineStartColor(theme.line),
  ],
  link: [
    display.block,
    py(space(1)),
    paddingInlineStart(space(3)),
    color(theme.inkMuted),
    textDecoration.none,
    borderInlineStartWidth(lineWidth.thick),
    borderInlineStartStyle.solid,
    borderInlineStartColor(theme.clear),
    marginInlineStart(unit.px(-1)),
    ...transitions([prop.color, prop.borderColor], {
      duration: duration.fast,
      easing: ease,
    }),
    when(interaction.hover, [color(theme.ink)]),
    when(ariaCurrent.true, [
      color(theme.link),
      fontWeight(weight.semibold),
      borderInlineStartColor(theme.action),
    ]),
  ],
  // An h3 sits one step in.
  nested: [paddingInlineStart(space(6))],
});

const pagerVars = cssVars('docPager', {
  // How far the arrow has slid. Written on hover, read by the arrow: a parent's
  // state reaches a child through a variable, never through a descendant rule.
  shift: kind.length(unit.px(0), { inherits: true }),
});

/** Which way a pager link points: its arrow slides toward where it goes. */
export const direction = defineStateAxis('direction', [
  'previous',
  'next',
] as const);

export const pagerUi = craftStyles('docPager', {
  root: [display.flex, gap(space(3)), justifyContent.spaceBetween],
  link: [
    display.flex,
    flex(num(1)),
    alignItems.center,
    justifyContent.center,
    gap(space(3)),
    blockSize(unit.rem(2.75)),
    borderRadius(radii.md),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(theme.action),
    bg(theme.action),
    color(theme.onAction),
    fontFamily(sansFont),
    ...font(text.sm),
    fontWeight(weight.semibold),
    letterSpacing(unit.em(0.01)),
    textDecoration.none,
    set(theme.glyph, theme.onAction),
    set(pagerVars.shift, unit.px(0)),
    ...transitions([prop.backgroundColor, prop.borderColor, prop.boxShadow], {
      duration: duration.normal,
      easing: ease,
    }),
    when(variant.primary, [
      when(interaction.hover, [
        bg(theme.actionHover),
        borderColor(theme.actionHover),
        shadow({ y: unit.px(8), blur: unit.px(20), color: theme.shadow }),
      ]),
    ]),
    // The "previous" link is the quiet one: a card with an outline.
    when(variant.secondary, [
      bg(theme.raised),
      borderColor(theme.lineStrong),
      color(theme.ink),
      set(theme.glyph, theme.ink),
      when(interaction.hover, [bg(theme.selected), borderColor(theme.action)]),
    ]),
    when(direction.next, [
      when(interaction.hover, [set(pagerVars.shift, unit.px(3))]),
    ]),
    when(direction.previous, [
      when(interaction.hover, [set(pagerVars.shift, unit.px(-3))]),
    ]),
  ],
  arrow: [
    display.inlineBlock,
    position.relative,
    insetInlineStart(pagerVars.shift),
    ...transitions([prop.insetInlineStart], {
      duration: duration.normal,
      easing: ease,
    }),
  ],
  caption: [
    display.block,
    fontFamily(displayFont),
    fontStyle.italic,
    ...font(text.sm),
    lineHeight(num(1.4)),
    color(theme.inkSubtle),
  ],
});

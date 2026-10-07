/**
 * Tabs: a strip of buttons over one visible panel.
 *
 * The selected tab is `aria-selected`, and the sheet reads it through the
 * `selected` axis the component writes beside it (no standard axis reads
 * `aria-selected`). The strip lives on the page (`surface: page`) or on the
 * code surface (`surface: code`), which is dark in both themes and so reads its
 * colours straight from the palette, like the code block it belongs to.
 */
import {
  alignItems,
  bg,
  borderBlockEndColor,
  borderBlockEndStyle,
  borderBlockEndWidth,
  borderWidth,
  craftBase,
  radii,
  radius,
  set,
  shadow,
  color,
  craftStyles,
  cursor,
  defineStateAxis,
  display,
  flexShrink,
  font,
  fontFamily,
  fontWeight,
  gap,
  interaction,
  lineWidth,
  num,
  prop,
  provides,
  px,
  py,
  scrollPort,
  text,
  transitions,
  unit,
  when,
  whiteSpace,
} from '@craft-ts/style';
import {
  duration,
  ease,
  herbier,
  sansFont,
  theme,
  weight,
} from '../foundation/herbier.style.ts';

/** Which ground the strip sits on. */
export const surface = defineStateAxis('surface', ['page', 'code'] as const);

/** The tab that is showing. Written beside `aria-selected`. */
export const selected = defineStateAxis('selected', ['true'] as const);

export const tabsUi = craftStyles('docTabs', {
  root: [
    display.block,
    // On the code surface the strip and the block are one card.
    when(surface.code, [
      bg(herbier.surface.code),
      radius(radii.md),
      shadow({ y: unit.px(14), blur: unit.px(30), color: theme.shadow }),
      // The block inside is flat: the card around it carries the corner and the shadow.
      set(theme.codeCorner, unit.px(0)),
      set(theme.codeLift, theme.clear),
      set(craftBase.focusRing, herbier.text.codeKeyword),
    ]),
  ],
  list: [
    display.flex,
    alignItems.center,
    gap(unit.px(0)),
    borderBlockEndWidth(lineWidth.hairline),
    borderBlockEndStyle.solid,
    borderBlockEndColor(theme.line),
    provides(scrollPort.inline),
    when(surface.code, [borderBlockEndColor(herbier.border.codeLine)]),
  ],
  tab: [
    display.inlineFlex,
    alignItems.center,
    flexShrink(num(0)),
    py(unit.rem(0.625)),
    px(unit.rem(1)),
    bg(theme.clear),
    borderWidth(unit.px(0)),
    color(theme.inkMuted),
    fontFamily(sansFont),
    ...font(text.sm),
    fontWeight(weight.medium),
    whiteSpace.nowrap,
    cursor.pointer,
    borderBlockEndWidth(lineWidth.thick),
    borderBlockEndStyle.solid,
    borderBlockEndColor(theme.clear),
    ...transitions([prop.color, prop.borderColor], {
      duration: duration.fast,
      easing: ease,
    }),
    when(interaction.hover, [color(theme.ink), borderBlockEndColor(theme.line)]),
    when(selected.true, [
      color(theme.ink),
      fontWeight(weight.semibold),
      borderBlockEndColor(theme.action),
      when(interaction.hover, [borderBlockEndColor(theme.action)]),
    ]),
    when(surface.code, [
      color(herbier.text.codeComment),
      when(interaction.hover, [
        color(herbier.text.codePlain),
        borderBlockEndColor(herbier.border.codeLine),
      ]),
      when(selected.true, [
        color(herbier.text.codePlain),
        borderBlockEndColor(herbier.text.codeKeyword),
        when(interaction.hover, [
          borderBlockEndColor(herbier.text.codeKeyword),
        ]),
      ]),
    ]),
  ],
  panel: [display.block],
});

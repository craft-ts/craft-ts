/**
 * The bypasses view, styled by the design system it keeps honest.
 *
 * A view that lists every way around `@craft-ts/style` would read oddly if it
 * were itself written in legacy CSS: this sheet is the whole of its styling.
 * The colours are theme variables, so dark mode is one rule here and none in
 * the view.
 */
import {
  bg,
  borderColor,
  borderStyle,
  borderWidth,
  color,
  craftStyles,
  cssVars,
  darkOf,
  defineStateAxis,
  display,
  flexDirection,
  flexWrap,
  font,
  fontFamily,
  fontWeight,
  gap,
  kind,
  lineWidth,
  monospaceStack,
  listStyleType,
  num,
  overflowWrap,
  p,
  palette,
  px,
  py,
  radii,
  radius,
  scheme,
  set,
  space,
  text,
  when,
  whiteSpace,
} from '@craft-ts/style';

const themed = { inherits: true };

const tone = cssVars('reviewBypass', {
  muted: kind.color(palette.text.muted, themed),
  border: kind.color(palette.border.subtle, themed),
  sunken: kind.color(palette.surface.sunken, themed),
  warning: kind.color(palette.accent.warning, themed),
  active: kind.color(palette.accent.info, themed),
  onActive: kind.color(palette.text.inverted, themed),
});

/** Which rule filter is on. Drives `data-bypassFilter` on each filter button. */
export const bypassFilter = defineStateAxis('bypassFilter', ['active']);

/** Whether a bypass gave its reason. Drives `data-bypassReason`. */
export const bypassReason = defineStateAxis('bypassReason', ['missing']);

export const bypassesView = craftStyles(
  'reviewBypass',
  {
    root: [
      set(tone.muted, palette.text.muted),
      set(tone.border, palette.border.subtle),
      set(tone.sunken, palette.surface.sunken),
      set(tone.warning, palette.accent.warning),
      set(tone.active, palette.accent.info),
      set(tone.onActive, palette.text.inverted),
      when(scheme.dark, [
        set(tone.muted, darkOf(palette.text.muted)),
        set(tone.border, darkOf(palette.border.subtle)),
        set(tone.sunken, darkOf(palette.surface.sunken)),
        set(tone.warning, darkOf(palette.accent.warning)),
        set(tone.active, darkOf(palette.accent.info)),
        set(tone.onActive, darkOf(palette.text.inverted)),
      ]),
      display.flex,
      flexDirection.column,
      gap(space(4)),
    ],
    adoption: [
      display.flex,
      flexDirection.column,
      gap(space(2)),
      p(space(3)),
      borderWidth(lineWidth.hairline),
      borderStyle.solid,
      borderColor(tone.border),
      radius(radii.md),
    ],
    heading: [font(text.base), fontWeight(num(600))],
    meta: [font(text.sm), color(tone.muted)],
    filters: [display.flex, flexWrap.wrap, gap(space(2))],
    filter: [
      px(space(3)),
      py(space(1)),
      font(text.sm),
      borderWidth(lineWidth.hairline),
      borderStyle.solid,
      borderColor(tone.border),
      radius(radii.full),
      when(bypassFilter.active, [bg(tone.active), color(tone.onActive)]),
    ],
    list: [
      display.flex,
      flexDirection.column,
      gap(space(3)),
      listStyleType.none,
      p(space(0)),
    ],
    item: [
      display.flex,
      flexDirection.column,
      gap(space(2)),
      p(space(3)),
      borderWidth(lineWidth.hairline),
      borderStyle.solid,
      borderColor(tone.border),
      radius(radii.md),
    ],
    reason: [
      font(text.sm),
      when(bypassReason.missing, [color(tone.warning), fontWeight(num(600))]),
    ],
    excerpt: [
      p(space(2)),
      bg(tone.sunken),
      radius(radii.sm),
      font(text.xs),
      fontFamily(monospaceStack),
      whiteSpace.preWrap,
      overflowWrap.anywhere,
    ],
  },
  { axes: [bypassFilter, bypassReason, scheme] },
);

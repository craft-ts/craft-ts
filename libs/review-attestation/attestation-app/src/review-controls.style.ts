/**
 * The sidebar's controls: the filters, the preferences, and the small buttons
 * and key caps the whole app uses.
 */
import {
  alignItems,
  bg,
  borderBlockEndColor,
  borderBlockEndStyle,
  borderBlockEndWidth,
  borderColor,
  borderStyle,
  borderWidth,
  color,
  craftStyles,
  display,
  flex,
  fontSize,
  fontWeight,
  gap,
  gridTemplateColumns,
  inlineSize,
  interaction,
  justifyContent,
  justifyItems,
  lineHeight,
  lineWidth,
  marginBlockStart,
  marginInlineStart,
  maxInlineSize,
  minWidth,
  num,
  px,
  py,
  radius,
  shadow,
  tracks,
  unit,
  when,
  whiteSpace,
  alignSelf,
  pseudo,
} from '@craft-ts/style';
import { reviewUi, theme } from './review-app.style';

const hairline = (tint: Parameters<typeof borderColor>[0]) => [
  borderWidth(lineWidth.hairline),
  borderStyle.solid,
  borderColor(tint),
];

export const filters = craftStyles('reviewFilters', {
  panel: [
    display.grid,
    gridTemplateColumns(tracks.list(tracks.fr(1))),
    gap(unit.px(10)),
    px(unit.px(12)),
    py(unit.px(17)),
    borderBlockEndWidth(lineWidth.hairline),
    borderBlockEndStyle.solid,
    borderBlockEndColor(theme.line),
  ],
  heading: [
    display.flex,
    alignItems.start,
    justifyContent.spaceBetween,
    gap(unit.px(8)),
    px(unit.px(4)),
  ],
  title: [fontSize(unit.px(14))],
  hint: [
    display.block,
    maxInlineSize(unit.px(170)),
    marginBlockStart(unit.px(3)),
    fontSize(unit.px(11)),
    lineHeight(num(1.35)),
    color(theme.textDim),
  ],
  actions: [display.grid, justifyItems.end, gap(unit.px(5))],
  status: [fontSize(unit.px(10)), whiteSpace.nowrap, color(theme.textDim)],
  clear: [
    flex.none,
    py(unit.px(5)),
    px(unit.px(7)),
    ...hairline(theme.lineStrong),
    radius(unit.px(6)),
    fontSize(unit.px(11)),
    color(theme.textMuted),
    bg(reviewUi.surface.transparent),
    when(interaction.hover, [
      borderColor(theme.accentBorder),
      color(theme.accentText),
      bg(theme.accentBg),
    ]),
  ],
  field: [display.grid, gap(unit.px(5))],
  label: [
    marginInlineStart(unit.px(1)),
    fontSize(unit.px(11)),
    fontWeight(num(650)),
    color(theme.textMuted),
  ],
  /** A text input or a select in the filter bar. */
  control: [
    inlineSize(unit.pct(100)),
    minWidth(unit.px(0)),
    py(unit.px(8)),
    px(unit.px(10)),
    ...hairline(theme.lineStrong),
    radius(unit.px(7)),
    color(theme.text),
    bg(theme.surfaceSunken),
    pseudo.placeholder([color(theme.textDim)]),
    when(interaction.focus, [
      borderColor(theme.accent),
      shadow({
        y: unit.px(0),
        blur: unit.px(0),
        spread: unit.px(3),
        color: theme.accentBg,
      }),
    ]),
  ],
});

export const preferences = craftStyles('reviewPreferences', {
  root: [
    display.grid,
    gridTemplateColumns(tracks.list('auto', tracks.fr(1))),
    alignItems.center,
    gap(unit.px(8)),
    marginBlockStart(unit.px(14)),
  ],
  control: [inlineSize(unit.pct(100))],
});

/** The key cap next to a keyboard-driven action. */
export const keyCap = craftStyles('reviewKey', {
  root: [
    marginInlineStart(unit.px(4)),
    borderStyle.solid,
    borderColor(theme.lineStrong),
    borderWidth(lineWidth.hairline),
    radius(unit.px(4)),
    px(unit.px(5)),
    fontSize(unit.px(11)),
    alignSelf.center,
  ],
});

/** The plain button of the queue and the decision row. */
export const plainButton = craftStyles('reviewButton', {
  root: [
    py(unit.px(8)),
    px(unit.px(10)),
    ...hairline(theme.lineStrong),
    radius(unit.px(7)),
    color(theme.text),
    bg(theme.surfaceSunken),
  ],
});

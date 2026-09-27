/**
 * The application overview: every capture of the application side by side,
 * with the filters and the batch verdict above them.
 *
 * A capture's zoom is the same `data-zoom` attribute the review card reads.
 */
import {
  alignItems,
  bg,
  blockSize,
  borderColor,
  borderStyle,
  borderWidth,
  color,
  craftStyles,
  cursor,
  display,
  flex,
  flexBasis,
  flexDirection,
  flexWrap,
  fontWeight,
  gap,
  inlineSize,
  interaction,
  lineWidth,
  marginBlock,
  math,
  maxBlockSize,
  maxInlineSize,
  minBlockSize,
  minWidth,
  num,
  opacity,
  p,
  provides,
  px,
  py,
  radius,
  scrollPort,
  unit,
  when,
} from '@craft-ts/style';
import { theme } from './review-app.style';
import { zoomMode } from './review-card.style';

const row = [
  display.flex,
  flexWrap.wrap,
  alignItems.end,
  gap(unit.rem(1)),
  marginBlock(unit.rem(1)),
];

const field = [
  py(unit.px(9)),
  px(unit.px(12)),
  borderWidth(lineWidth.hairline),
  borderStyle.solid,
  borderColor(theme.lineStrong),
  radius(unit.px(8)),
  color(theme.text),
  bg(theme.surfaceRaised),
];

export const applicationOverview = craftStyles('applicationOverview', {
  progress: [fontWeight(num(600))],
  row,
  field: [display.flex, flexDirection.column, gap(unit.rem(0.35))],
  button: [
    ...field,
    cursor.pointer,
    when(interaction.disabled, [opacity(num(0.5)), cursor.default]),
  ],
  comment: [
    ...field,
    minWidth(math.min(unit.px(320), unit.vw(80))),
    minBlockSize(unit.px(70)),
  ],
  captures: [
    display.flex,
    alignItems.start,
    gap(unit.rem(1.25)),
    py(unit.rem(1)),
    provides(scrollPort.inline),
  ],
  capture: [
    display.flex,
    flexDirection.column,
    gap(unit.rem(0.75)),
    flex.none,
    flexBasis(math.min(unit.px(440), unit.vw(85))),
    p(unit.rem(1)),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(theme.lineStrong),
    radius(unit.rem(0.75)),
    bg(theme.surfaceRaised),
  ],
  select: [display.flex, alignItems.center, gap(unit.px(8))],
  imageScroll: [maxBlockSize(unit.vh(75)), provides(scrollPort.block)],
  image: [
    blockSize.auto,
    when(zoomMode.fit, [maxInlineSize(unit.pct(100))]),
    when(zoomMode.actual, [maxInlineSize.none, inlineSize.auto]),
  ],
});

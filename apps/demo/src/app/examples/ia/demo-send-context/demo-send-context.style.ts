/**
 * The send-context example: thirteen small counters on one page, so the context
 * the AI launcher sends has plenty to describe. A grid of cards that wraps by
 * itself, down to one column on a phone.
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
  flexWrap,
  fontWeight,
  gap,
  gridTemplateColumns,
  lineWidth,
  math,
  p,
  radii,
  radius,
  space,
  tracks,
  unit,
} from '@craft-ts/style';
import { theme, weight } from '@craft-ts/ui/style';

export const sendContext = craftStyles('sendContext', {
  page: [display.grid, gap(space(4))],
  grid: [
    display.grid,
    gridTemplateColumns(tracks.autoFit(math.min(unit.pct(100), unit.rem(11)))),
    gap(space(3)),
  ],
  card: [
    display.grid,
    gap(space(2)),
    p(space(3)),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(theme.line),
    radius(radii.md),
    bg(theme.raised),
  ],
  value: [fontWeight(weight.semibold), color(theme.inkMuted)],
  buttons: [display.flex, flexWrap.wrap, alignItems.center, gap(space(2))],
});

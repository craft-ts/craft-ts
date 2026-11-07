/**
 * The control room: bands of small instruments, each in its own frame.
 *
 * Two state axes, set as `data-*` attributes: `data-controlRoomLevel` on a
 * gauge (its reading against its maximum) and `data-controlRoomDensity` on a
 * band (the page's compact switch).
 */
import {
  alignItems,
  bg,
  borderColor,
  borderStyle,
  borderWidth,
  color,
  craftStyles,
  defineStateAxis,
  display,
  flexWrap,
  gap,
  gridTemplateColumns,
  lineWidth,
  p,
  radii,
  radius,
  space,
  tracks,
  when,
} from '@craft-ts/style';
import { theme } from '@craft-ts/ui/style';

export const gaugeLevel = defineStateAxis('controlRoomLevel', [
  'low',
  'ok',
  'high',
]);
export const roomDensity = defineStateAxis('controlRoomDensity', [
  'comfortable',
  'compact',
]);

export const controlRoom = craftStyles('controlRoom', {
  room: [display.grid, gap(space(6))],
  band: [
    display.grid,
    gridTemplateColumns(tracks.equal(3)),
    gap(space(3)),
    when(roomDensity.compact, [gap(space(1))]),
  ],
  widget: [
    display.grid,
    alignItems.start,
    gap(space(2)),
    p(space(3)),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(theme.line),
    radius(radii.md),
    bg(theme.raised),
    color(theme.ink),
    when(gaugeLevel.low, [borderColor(theme.inkSubtle)]),
    when(gaugeLevel.high, [
      borderWidth(lineWidth.thick),
      borderColor(theme.danger),
    ]),
  ],
  actions: [display.flex, flexWrap.wrap, alignItems.center, gap(space(2))],
});

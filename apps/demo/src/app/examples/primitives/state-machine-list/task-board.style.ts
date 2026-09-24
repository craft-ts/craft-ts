/**
 * The task board: one row per task, each with its own machine. The card, the
 * list, the badge, fields and buttons come from the shared example sheet.
 */
import {
  alignItems,
  bg,
  borderColor,
  borderStyle,
  borderWidth,
  craftStyles,
  definePalette,
  display,
  fontWeight,
  gap,
  lineWidth,
  num,
  px,
  py,
  radii,
  radius,
  space,
} from '@craft-ts/style';

const board = definePalette('taskBoard', {
  surface: { row: { light: '#ffffff', dark: '#ffffff' } },
  border: { row: { light: '#e2e8f0', dark: '#e2e8f0' } },
});

export const taskBoard = craftStyles('taskBoard', {
  row: [
    display.grid,
    gap(space(3)),
    py(space(4)),
    px(space(5)),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(board.border.row),
    radius(radii.xl),
    bg(board.surface.row),
  ],
  head: [display.flex, alignItems.baseline, gap(space(3))],
  title: [fontWeight(num(600))],
});

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
import { theme } from '@craft-ts/ui/style';

/** The Herbier theme, under the names this sheet uses. */
const board = {
  surface: { row: theme.raised },
  border: { row: theme.line },
};

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

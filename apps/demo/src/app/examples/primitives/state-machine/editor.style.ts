/**
 * The two state-machine editors (text, profile): a strip of steps with the
 * current one marked, and panels. The card, text, fields and buttons come from
 * the shared example sheet.
 */
import {
  alignItems,
  bg,
  borderColor,
  borderInlineStartColor,
  borderInlineStartStyle,
  borderInlineStartWidth,
  borderStyle,
  borderWidth,
  color,
  craftStyles,
  defineStateAxis,
  display,
  flex,
  fontWeight,
  gap,
  lineWidth,
  marginBlockStart,
  num,
  p,
  px,
  py,
  radii,
  radius,
  space,
  textAlign,
  unit,
  when,
} from '@craft-ts/style';
import { theme } from '@craft-ts/ui/style';

/** The Herbier theme, under the names this sheet uses. */
const editorUi = {
  surface: {
    step: theme.navHover,
    stepActive: theme.selected,
    panel: theme.raised,
    hint: theme.navHover,
  },
  text: {
    step: theme.inkMuted,
    stepActive: theme.link,
    label: theme.ink,
    hint: theme.inkMuted,
  },
  border: {
    step: theme.line,
    stepActive: theme.action,
    panel: theme.line,
    hint: theme.decor,
  },
};

/** The step the machine is in. Drives `data-editorStep` on each step. */
export const stepState = defineStateAxis('editorStep', ['active']);

export const editor = craftStyles('stateEditor', {
  steps: [display.flex, gap(space(2))],
  step: [
    flex(num(1)),
    py(space(2)),
    px(space(3)),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(editorUi.border.step),
    radius(radii.lg),
    textAlign.center,
    fontWeight(num(600)),
    color(editorUi.text.step),
    bg(editorUi.surface.step),
    when(stepState.active, [
      borderColor(editorUi.border.stepActive),
      color(editorUi.text.stepActive),
      bg(editorUi.surface.stepActive),
    ]),
  ],
  panel: [
    display.grid,
    gap(space(3)),
    p(space(5)),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(editorUi.border.panel),
    radius(radii.xl),
    bg(editorUi.surface.panel),
  ],
  loadingPanel: [
    display.flex,
    alignItems.center,
    gap(space(3)),
    p(space(5)),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(editorUi.border.panel),
    radius(radii.xl),
    color(editorUi.text.hint),
    bg(editorUi.surface.panel),
  ],
  field: [display.grid, gap(space(1))],
  label: [fontWeight(num(600)), color(editorUi.text.label)],
  hint: [
    py(space(3)),
    px(space(4)),
    borderInlineStartWidth(unit.px(3)),
    borderInlineStartStyle.solid,
    borderInlineStartColor(editorUi.border.hint),
    color(editorUi.text.hint),
    bg(editorUi.surface.hint),
  ],
  toolbar: [
    display.flex,
    alignItems.center,
    gap(space(2)),
    marginBlockStart(space(6)),
    color(editorUi.text.step),
  ],
});

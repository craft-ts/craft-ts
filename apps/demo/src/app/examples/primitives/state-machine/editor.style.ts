/**
 * The two state-machine editors (text, profile): a strip of steps with the
 * current one marked, and panels. The card, text, fields and buttons come from
 * the shared example sheet.
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
  shadow,
  space,
  textAlign,
  unit,
  when,
} from '@craft-ts/style';
import { theme } from '@craft-ts/ui/style';

/** The Herbier theme, under the names this sheet uses. */
const editorUi = {
  surface: {
    track: theme.navHover,
    step: theme.clear,
    stepActive: theme.raised,
    panel: theme.surface,
    hint: theme.navHover,
  },
  text: {
    step: theme.inkMuted,
    stepActive: theme.ink,
    label: theme.ink,
    hint: theme.inkMuted,
  },
  border: {
    panel: theme.line,
  },
};

/** The step the machine is in. Drives `data-editorStep` on each step. */
export const stepState = defineStateAxis('editorStep', ['active']);

export const editor = craftStyles('stateEditor', {
  /** The steps are a segmented control: a track, and the current step lifted out of it. */
  steps: [
    display.flex,
    gap(space(1)),
    p(space(1)),
    radius(radii.xl),
    bg(editorUi.surface.track),
  ],
  step: [
    flex(num(1)),
    py(space(2)),
    px(space(3)),
    radius(radii.lg),
    textAlign.center,
    fontWeight(num(600)),
    color(editorUi.text.step),
    bg(editorUi.surface.step),
    when(stepState.active, [
      color(editorUi.text.stepActive),
      bg(editorUi.surface.stepActive),
      shadow(
        { y: unit.px(1), blur: unit.px(3), color: theme.shadow },
        { y: unit.px(1), blur: unit.px(1), color: theme.shadow },
      ),
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
    radius(radii.xl),
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

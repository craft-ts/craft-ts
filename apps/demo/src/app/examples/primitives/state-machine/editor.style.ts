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
  definePalette,
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

const editorUi = definePalette('stateEditor', {
  surface: {
    step: { light: '#f8fafc', dark: '#f8fafc' },
    stepActive: { light: '#eff6ff', dark: '#eff6ff' },
    panel: { light: '#ffffff', dark: '#ffffff' },
    hint: { light: '#f1f5f9', dark: '#f1f5f9' },
  },
  text: {
    step: { light: '#64748b', dark: '#64748b' },
    stepActive: { light: '#1d4ed8', dark: '#1d4ed8' },
    label: { light: '#334155', dark: '#334155' },
    hint: { light: '#475569', dark: '#475569' },
  },
  border: {
    step: { light: '#cbd5e1', dark: '#cbd5e1' },
    stepActive: { light: '#1d4ed8', dark: '#1d4ed8' },
    panel: { light: '#e2e8f0', dark: '#e2e8f0' },
    hint: { light: '#94a3b8', dark: '#94a3b8' },
  },
});

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

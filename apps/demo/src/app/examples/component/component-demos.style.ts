/**
 * The component examples — functional components, composition, content
 * projection, pendingNode — share one page layout and one set of controls.
 * They used to split it between the app's global stylesheet and per-component
 * `styles` strings; it is written once here.
 */
import {
  alignItems,
  bg,
  borderColor,
  borderStyle,
  borderWidth,
  color,
  craftStyles,
  cursor,
  definePalette,
  defineStateAxis,
  display,
  flexWrap,
  font,
  fontWeight,
  gap,
  inlineSize,
  interaction,
  justifyContent,
  justifyItems,
  lineWidth,
  listStyleType,
  marginInline,
  maxInlineSize,
  num,
  opacity,
  p,
  paddingInlineStart,
  px,
  py,
  radii,
  radius,
  space,
  text,
  unit,
  when,
} from '@craft-ts/style';

const ui = definePalette('componentDemo', {
  surface: {
    raised: { light: '#ffffff', dark: '#ffffff' },
    sunken: { light: '#f8fafc', dark: '#f8fafc' },
    success: { light: '#dcfce7', dark: '#dcfce7' },
    danger: { light: '#ffe4e6', dark: '#ffe4e6' },
    info: { light: '#eff6ff', dark: '#eff6ff' },
    badge: { light: '#dbeafe', dark: '#dbeafe' },
    dialog: { light: '#faf5ff', dark: '#faf5ff' },
    pending: { light: '#eef2ff', dark: '#eef2ff' },
    error: { light: '#fef2f2', dark: '#fef2f2' },
    reloading: { light: '#fef9c3', dark: '#fef9c3' },
    primary: { light: '#2563eb', dark: '#2563eb' },
    primaryHover: { light: '#1d4ed8', dark: '#1d4ed8' },
    slate: { light: '#475569', dark: '#475569' },
  },
  text: {
    body: { light: '#1e293b', dark: '#1e293b' },
    muted: { light: '#475569', dark: '#475569' },
    success: { light: '#166534', dark: '#166534' },
    danger: { light: '#9f1239', dark: '#9f1239' },
    error: { light: '#b91c1c', dark: '#b91c1c' },
    info: { light: '#1e3a8a', dark: '#1e3a8a' },
    pending: { light: '#4338ca', dark: '#4338ca' },
    reloading: { light: '#854d0e', dark: '#854d0e' },
    onPrimary: { light: '#ffffff', dark: '#ffffff' },
  },
  border: {
    subtle: { light: '#e2e8f0', dark: '#e2e8f0' },
    card: { light: '#cbd5e1', dark: '#cbd5e1' },
    control: { light: '#94a3b8', dark: '#94a3b8' },
    info: { light: '#bfdbfe', dark: '#bfdbfe' },
    pending: { light: '#c7d2fe', dark: '#c7d2fe' },
    error: { light: '#fecaca', dark: '#fecaca' },
    dialog: { light: '#7c3aed', dark: '#7c3aed' },
    primary: { light: '#2563eb', dark: '#2563eb' },
    slate: { light: '#475569', dark: '#475569' },
  },
});

/** A page that needs more room than the others. Drives `data-componentPage`. */
export const pageWidth = defineStateAxis('componentPage', ['wide']);

/** The kind of a demo button. The default is a neutral outline. */
export const buttonTone = defineStateAxis('componentButton', [
  'primary',
  'slate',
]);

const hairline = (tint: typeof ui.border.card) => [
  borderWidth(lineWidth.hairline),
  borderStyle.solid,
  borderColor(tint),
];

const panel = (
  tint: typeof ui.border.card,
  surface: typeof ui.surface.raised,
) => [
  display.grid,
  gap(space(3)),
  p(space(5)),
  ...hairline(tint),
  radius(radii.xl),
  bg(surface),
];

const callout = (
  ink: typeof ui.text.body,
  surface: typeof ui.surface.raised,
) => [py(space(3)), px(space(4)), radius(radii.lg), color(ink), bg(surface)];

export const componentUi = craftStyles('componentDemo', {
  host: [display.block],
  page: [
    display.grid,
    gap(space(4)),
    maxInlineSize(unit.rem(44)),
    marginInline.auto,
    p(space(6)),
    when(pageWidth.wide, [maxInlineSize(unit.rem(52))]),
  ],
  button: [
    inlineSize.fitContent,
    py(space(2)),
    px(space(4)),
    ...hairline(ui.border.control),
    radius(radii.md),
    cursor.pointer,
    bg(ui.surface.raised),
    when(buttonTone.primary, [
      borderColor(ui.border.primary),
      color(ui.text.onPrimary),
      bg(ui.surface.primary),
      when(interaction.hover, [bg(ui.surface.primaryHover)]),
    ]),
    when(buttonTone.slate, [
      borderColor(ui.border.slate),
      color(ui.text.onPrimary),
      bg(ui.surface.slate),
    ]),
    when(interaction.disabled, [cursor.notAllowed, opacity(num(0.55))]),
  ],
  list: [display.grid, gap(space(2))],
  user: [
    display.flex,
    alignItems.center,
    justifyContent.spaceBetween,
    gap(space(4)),
    py(space(3)),
    px(space(4)),
    ...hairline(ui.border.subtle),
    radius(radii.lg),
    bg(ui.surface.raised),
  ],
  error: [color(ui.text.error)],
  lazyContent: callout(ui.text.success, ui.surface.success),
  restricted: callout(ui.text.success, ui.surface.success),
  denied: callout(ui.text.danger, ui.surface.danger),
});

export const projectionDemo = craftStyles('projectionDemo', {
  card: [...panel(ui.border.card, ui.surface.sunken), color(ui.text.body)],
  body: [
    display.grid,
    gap(space(3)),
    p(space(4)),
    radius(radii.lg),
    bg(ui.surface.raised),
  ],
  content: [color(ui.text.body)],
  fallback: [color(ui.text.muted)],
  list: [display.grid, gap(space(2)), p(space(0)), listStyleType.none],
  row: [
    display.flex,
    alignItems.center,
    justifyContent.spaceBetween,
    gap(space(4)),
    py(space(3)),
    px(space(3)),
    ...hairline(ui.border.subtle),
    radius(radii.md),
  ],
  badge: [
    py(space(1)),
    px(space(2)),
    radius(radii.full),
    font(text.sm),
    color(ui.text.info),
    bg(ui.surface.badge),
  ],
  case: panel(ui.border.info, ui.surface.info),
  status: [fontWeight(num(600)), color(ui.text.info)],
  toolbar: [display.flex, flexWrap.wrap, gap(space(2))],
  dialog: [
    display.grid,
    gap(space(3)),
    p(space(4)),
    borderWidth(lineWidth.thick),
    borderStyle.solid,
    borderColor(ui.border.dialog),
    radius(radii.xl),
    bg(ui.surface.dialog),
  ],
});

export const pendingDemo = craftStyles('pendingDemo', {
  page: [display.grid, gap(space(4)), p(space(4)), justifyItems.start],
  actions: [display.flex, flexWrap.wrap, gap(space(2))],
  actionButton: [
    inlineSize.fitContent,
    py(space(2)),
    px(space(4)),
    ...hairline(ui.border.pending),
    radius(radii.lg),
    fontWeight(num(650)),
    cursor.pointer,
    bg(ui.surface.raised),
  ],
  list: [display.grid, gap(space(1)), paddingInlineStart(space(5))],
  count: [font(text.sm), opacity(num(0.72))],
  skeleton: [
    ...callout(ui.text.pending, ui.surface.pending),
    fontWeight(num(650)),
  ],
  error: [
    ...callout(ui.text.error, ui.surface.error),
    ...hairline(ui.border.error),
    fontWeight(num(650)),
  ],
  reloading: [
    py(space(1)),
    px(space(3)),
    radius(radii.lg),
    font(text.sm),
    fontWeight(num(650)),
    color(ui.text.reloading),
    bg(ui.surface.reloading),
  ],
});

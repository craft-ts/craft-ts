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
  defineStateAxis,
  display,
  flexWrap,
  font,
  fontWeight,
  gap,
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
import { theme } from '@craft-ts/ui/style';

/**
 * The Herbier theme, under the names this sheet already used. Nothing here is a
 * colour: each entry is a `theme` variable, so the examples follow the page's
 * light or dark side and its season.
 */
const ui = {
  surface: {
    raised: theme.raised,
    sunken: theme.navHover,
    success: theme.tipSurface,
    danger: theme.dangerSurface,
    info: theme.infoSurface,
    badge: theme.selected,
    dialog: theme.importantSurface,
    pending: theme.infoSurface,
    error: theme.dangerSurface,
    reloading: theme.importantSurface,
  },
  text: {
    body: theme.ink,
    muted: theme.inkMuted,
    success: theme.tipInk,
    danger: theme.dangerInk,
    error: theme.dangerInk,
    info: theme.infoInk,
    pending: theme.infoInk,
    reloading: theme.importantInk,
  },
  border: {
    subtle: theme.line,
    card: theme.line,
    info: theme.infoBorder,
    pending: theme.infoBorder,
    error: theme.dangerBorder,
    dialog: theme.importantBorder,
  },
};

/** A page that needs more room than the others. Drives `data-componentPage`. */
export const pageWidth = defineStateAxis('componentPage', ['wide']);

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
  p(space(4)),
  ...hairline(tint),
  radius(radii.lg),
  bg(surface),
];

const callout = (
  ink: typeof ui.text.body,
  surface: typeof ui.surface.raised,
) => [py(space(3)), px(space(4)), radius(radii.lg), color(ink), bg(surface)];

export const componentUi = craftStyles('componentDemo', {
  page: [
    display.grid,
    gap(space(4)),
    maxInlineSize(unit.rem(44)),
    marginInline.auto,
    when(pageWidth.wide, [maxInlineSize(unit.rem(52))]),
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
    p(space(3)),
    radius(radii.md),
    bg(ui.surface.raised),
  ],
  content: [color(ui.text.body)],
  fallback: [color(ui.text.muted)],
  list: [display.grid, gap(space(2)), p(space(0)), listStyleType.none],
  row: [
    display.flex,
    flexWrap.wrap,
    alignItems.center,
    justifyContent.spaceBetween,
    gap(space(2)),
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

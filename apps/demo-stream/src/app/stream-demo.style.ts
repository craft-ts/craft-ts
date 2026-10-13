/**
 * The look of the streams demo: a page of cards, a row of controls and a
 * monospaced trace panel. The reset and good defaults (focus ring, reduced
 * motion, colour scheme) come from craft-ts itself — see `craftStyle()` in
 * `vite.config.ts`.
 */
import {
  alignItems,
  bg,
  borderColor,
  borderStyle,
  borderWidth,
  color,
  craftGlobalStyles,
  craftStyles,
  darkOf,
  definePalette,
  display,
  flexWrap,
  font,
  fontFamily,
  fontWeight,
  gap,
  inlineSize,
  lineHeight,
  lineWidth,
  marginBlockStart,
  marginInline,
  math,
  minBlockSize,
  monospaceStack,
  num,
  p,
  radius,
  scheme,
  space,
  systemFontStack,
  text,
  unit,
  when,
  whiteSpace,
} from '@craft-ts/style';

const ui = definePalette('streamDemo', {
  surface: {
    page: { light: '#f5f7fa', dark: '#0f172a' },
    card: { light: '#ffffff', dark: '#1e293b' },
    trace: { light: '#0f172a', dark: '#020617' },
  },
  text: {
    strong: { light: '#1a202c', dark: '#e2e8f0' },
    muted: { light: '#4a5568', dark: '#94a3b8' },
    trace: { light: '#dbeafe', dark: '#bfdbfe' },
  },
  border: {
    card: { light: '#dce4ef', dark: '#334155' },
  },
});

craftGlobalStyles('streamDemo', {
  elements: {
    html: [minBlockSize(unit.pct(100))],
    body: [
      minBlockSize(unit.pct(100)),
      fontFamily(systemFontStack(['ui-sans-serif', 'system-ui'], 'sans-serif')),
      bg(ui.surface.page),
      color(ui.text.strong),
      when(scheme.dark, [
        bg(darkOf(ui.surface.page)),
        color(darkOf(ui.text.strong)),
      ]),
    ],
  },
});

const hairline = (tint: Parameters<typeof borderColor>[0]) => [
  borderWidth(lineWidth.hairline),
  borderStyle.solid,
  borderColor(tint),
];

export const demo = craftStyles('streamDemoUi', {
  page: [
    display.grid,
    gap(space(5)),
    inlineSize(math.min(unit.pct(100), unit.rem(52))),
    marginInline.auto,
    marginBlockStart(space(6)),
    p(space(4)),
  ],
  card: [
    display.grid,
    gap(space(3)),
    p(space(5)),
    ...hairline(ui.border.card),
    radius(unit.rem(1)),
    bg(ui.surface.card),
    when(scheme.dark, [
      bg(darkOf(ui.surface.card)),
      borderColor(darkOf(ui.border.card)),
    ]),
  ],
  title: [font(text.lg), fontWeight(num(600)), lineHeight(num(1.25))],
  hint: [
    color(ui.text.muted),
    lineHeight(num(1.5)),
    when(scheme.dark, [color(darkOf(ui.text.muted))]),
  ],
  row: [display.flex, flexWrap.wrap, alignItems.center, gap(space(2))],
  trace: [
    p(space(4)),
    radius(unit.rem(0.75)),
    bg(ui.surface.trace),
    color(ui.text.trace),
    fontFamily(monospaceStack),
    font(text.sm),
    lineHeight(num(1.5)),
    whiteSpace.preWrap,
  ],
});

/**
 * The typed-CSS-variables pages, rewritten on `@craft-ts/style`.
 *
 * Each page shows one property of a variable declared with `cssVars`:
 *
 * - **Per instance** — every variable is registered with a typed initial
 *   value (`@property`), so none is "required": a variant sets the ones it
 *   changes with `set(...)`, and the others keep their initial value.
 * - **Inheritance** — `inherits: true`: a parent sets the value once, every
 *   descendant reads it.
 * - **Forwarding** — a parent exposes its own variable and forwards it to a
 *   child's with `set(child, parent)`; a caller overrides the parent's in
 *   its own sheet, and the child follows.
 * - **@property** — a registered percentage written at runtime with
 *   `assign(...)`, which the browser can interpolate because it is typed.
 */
import {
  bg,
  blockSize,
  borderColor,
  borderStyle,
  borderWidth,
  color,
  craftStyles,
  cssVars,
  definePalette,
  defineStateAxis,
  display,
  easing,
  font,
  fontWeight,
  gap,
  gridTemplateColumns,
  inlineSize,
  interaction,
  kind,
  lineWidth,
  marginInline,
  maxInlineSize,
  minBlockSize,
  num,
  opacity,
  p,
  prop,
  px,
  py,
  radii,
  radius,
  set,
  shadow,
  space,
  text,
  textDecorationLine,
  tracks,
  transitions,
  unit,
  when,
  clipOverflow,
} from '@craft-ts/style';

const ui = definePalette('cssVarsDemo', {
  surface: {
    page: { light: '#ffffff', dark: '#ffffff' },
    panel: { light: '#f8fafc', dark: '#f8fafc' },
    card: { light: '#ffffff', dark: '#ffffff' },
    blue: { light: '#eff6ff', dark: '#eff6ff' },
    pink: { light: '#fff1f2', dark: '#fff1f2' },
    cyan: { light: '#ecfeff', dark: '#ecfeff' },
    amber: { light: '#fefce8', dark: '#fefce8' },
    badge: { light: '#e0e7ff', dark: '#e0e7ff' },
    parent: { light: '#eef2ff', dark: '#eef2ff' },
    track: { light: '#e2e8f0', dark: '#e2e8f0' },
    fill: { light: '#7c3aed', dark: '#7c3aed' },
  },
  text: {
    strong: { light: '#172033', dark: '#172033' },
    muted: { light: '#64748b', dark: '#64748b' },
    nav: { light: '#475569', dark: '#475569' },
    blue: { light: '#1e3a8a', dark: '#1e3a8a' },
    pink: { light: '#9f1239', dark: '#9f1239' },
    green: { light: '#166534', dark: '#166534' },
    cyan: { light: '#155e75', dark: '#155e75' },
    amber: { light: '#854d0e', dark: '#854d0e' },
    badge: { light: '#3730a3', dark: '#3730a3' },
  },
  border: {
    subtle: { light: '#dbe3f0', dark: '#dbe3f0' },
    parent: { light: '#a5b4fc', dark: '#a5b4fc' },
  },
  effect: {
    shadow: { light: '#1720331a', dark: '#1720331a' },
  },
});

const themed = { inherits: true };

// ─── per instance ───────────────────────────────────────────────────────────

/** The card's public variables. Each one has a typed initial value. */
export const tokenCardVars = cssVars('tokenCard', {
  ink: kind.color(ui.text.strong, themed),
  bg: kind.color(ui.surface.card, themed),
  radius: kind.length(unit.px(16), themed),
});

/** Which look a card has. No tone: every variable keeps its initial value. */
export const cardTone = defineStateAxis('tokenCard', ['blue', 'pink', 'green']);

// ─── inheritance ────────────────────────────────────────────────────────────

/** The badge's ink: set by a parent, read by the badge, inherited in between. */
export const badgeVars = cssVars('inheritedBadge', {
  ink: kind.color(ui.text.muted, themed),
});

// ─── forwarding ─────────────────────────────────────────────────────────────

/** The parent's own API, forwarded to the card inside it. */
export const forwardingVars = cssVars('forwarding', {
  ink: kind.color(ui.text.cyan, themed),
  bg: kind.color(ui.surface.cyan, themed),
});

// ─── @property ──────────────────────────────────────────────────────────────

/** A registered percentage: typed, so `width` can be transitioned through it. */
export const meterVars = cssVars('registeredMeter', {
  value: kind.percentage(unit.pct(35)),
});

export const cssVarsDemo = craftStyles('cssVarsDemo', {
  page: [
    display.grid,
    gap(space(6)),
    maxInlineSize(unit.rem(72)),
    marginInline.auto,
    color(ui.text.strong),
  ],
  nav: [display.flex, gap(space(2))],
  navLink: [
    py(space(2)),
    px(space(3)),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(ui.border.subtle),
    radius(radii.full),
    font(text.xs),
    fontWeight(num(650)),
    textDecorationLine.none,
    color(ui.text.nav),
    bg(ui.surface.page),
    when(interaction.hover, [color(ui.text.strong), bg(ui.surface.panel)]),
  ],
  intro: [display.grid, gap(space(2))],
  muted: [color(ui.text.muted)],
  grid: [
    display.grid,
    gridTemplateColumns(tracks.autoFit(unit.rem(15))),
    gap(space(4)),
  ],
  caseCard: [
    display.grid,
    gap(space(3)),
    minBlockSize(unit.rem(8)),
    p(space(5)),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(ui.border.subtle),
    radius(radii.xl),
    textDecorationLine.none,
    color(ui.text.strong),
    bg(ui.surface.panel),
    when(interaction.hover, [
      shadow({ y: unit.rem(0.8), blur: unit.rem(2), color: ui.effect.shadow }),
    ]),
  ],
  code: [py(space(0)), px(space(1)), radius(radii.sm), bg(ui.surface.track)],
});

export const tokenCard = craftStyles('tokenCard', {
  root: [
    display.grid,
    gap(space(2)),
    minBlockSize(unit.rem(7.5)),
    p(space(4)),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(ui.border.subtle),
    radius(tokenCardVars.radius),
    color(tokenCardVars.ink),
    bg(tokenCardVars.bg),
    shadow({ y: unit.rem(0.8), blur: unit.rem(2), color: ui.effect.shadow }),
    when(cardTone.blue, [
      set(tokenCardVars.ink, ui.text.blue),
      set(tokenCardVars.bg, ui.surface.blue),
    ]),
    when(cardTone.pink, [
      set(tokenCardVars.ink, ui.text.pink),
      set(tokenCardVars.bg, ui.surface.pink),
      set(tokenCardVars.radius, unit.rem(2)),
    ]),
    // Only the ink: the background keeps its initial value.
    when(cardTone.green, [set(tokenCardVars.ink, ui.text.green)]),
  ],
  label: [fontWeight(num(750))],
  contract: [font(text.xs), opacity(num(0.72))],
});

export const inheritance = craftStyles('inheritance', {
  parent: [
    display.grid,
    gap(space(4)),
    p(space(5)),
    borderWidth(lineWidth.hairline),
    borderStyle.dashed,
    borderColor(ui.border.parent),
    radius(radii.xl),
    bg(ui.surface.parent),
    set(badgeVars.ink, ui.text.badge),
  ],
  badge: [
    display.inlineFlex,
    inlineSize.fitContent,
    py(space(1)),
    px(space(3)),
    radius(radii.full),
    font(text.xs),
    fontWeight(num(750)),
    color(badgeVars.ink),
    bg(ui.surface.badge),
  ],
});

export const forwarding = craftStyles('forwarding', {
  // The parent forwards its own API to the card's variables.
  root: [
    display.grid,
    gap(space(2)),
    set(tokenCardVars.ink, forwardingVars.ink),
    set(tokenCardVars.bg, forwardingVars.bg),
  ],
  note: [font(text.xs), color(ui.text.muted)],
  /** A caller that overrides the parent's API, in its own sheet. */
  caller: [
    display.grid,
    set(forwardingVars.ink, ui.text.amber),
    set(forwardingVars.bg, ui.surface.amber),
  ],
});

export const meter = craftStyles('registeredMeter', {
  root: [
    display.grid,
    gap(space(2)),
    p(space(4)),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(ui.border.subtle),
    radius(radii.xl),
  ],
  track: [
    blockSize(unit.rem(0.8)),
    clipOverflow.inline,
    radius(radii.full),
    bg(ui.surface.track),
  ],
  fill: [
    inlineSize(meterVars.value),
    blockSize(unit.pct(100)),
    bg(ui.surface.fill),
    transitions([prop.width], { duration: unit.ms(220), easing: easing.ease }),
  ],
});

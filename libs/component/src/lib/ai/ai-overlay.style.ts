/**
 * The AI overlay's design system: its palette, its theme, and the sheets of the
 * two small overlay components (context menu, launcher).
 *
 * The overlays are mounted in any application, so they never read the host
 * application's variables: the palette is their own, named `craftAi`, and the
 * theme variables keep the names the overlay always had (`--craft-ai-bg`,
 * `--craft-ai-launcher-right`…). An application that moved the launcher or
 * recoloured the overlay from its own CSS keeps working.
 *
 * Dark mode is one rule, on `aiTheme.root`, which every overlay root carries.
 */
import {
  alignItems,
  bg,
  borderColor,
  borderStyle,
  borderWidth,
  bottom,
  color,
  craftBase,
  craftStyles,
  cssVars,
  cursor,
  darkOf,
  definePalette,
  display,
  fontFamily,
  fontSize,
  fontWeight,
  gap,
  inlineSize,
  int,
  interaction,
  kind,
  left,
  lineHeight,
  minWidth,
  num,
  p,
  pointerEvents,
  position,
  prop,
  px,
  py,
  radii,
  radius,
  right,
  scheme,
  set,
  shadow,
  space,
  systemUiStack,
  textAlign,
  top,
  transitions,
  scale,
  unit,
  when,
  zIndex,
  justifyContent,
  margin,
  easing,
} from '@craft-ts/style';

export const craftAi = definePalette('craftAi', {
  surface: {
    page: { light: '#ffffff', dark: '#1f2937' },
    raised: { light: '#f9fafb', dark: '#111827' },
    muted: { light: '#f3f4f6', dark: '#374151' },
    accent: { light: '#eff6ff', dark: '#1e3a8a' },
    control: { light: '#ffffff', dark: '#111827' },
    success: { light: '#ecfdf5', dark: '#064e3b' },
    warning: { light: '#fffbeb', dark: '#78350f' },
    transparent: { light: 'transparent', dark: 'transparent' },
  },
  text: {
    strong: { light: '#111827', dark: '#f9fafb' },
    muted: { light: '#6b7280', dark: '#d1d5db' },
    accent: { light: '#1d4ed8', dark: '#bfdbfe' },
    onAccent: { light: '#ffffff', dark: '#ffffff' },
    danger: { light: '#b91c1c', dark: '#fca5a5' },
    success: { light: '#047857', dark: '#6ee7b7' },
    successStrong: { light: '#065f46', dark: '#a7f3d0' },
    warning: { light: '#b45309', dark: '#fbbf24' },
    emitted: { light: '#4338ca', dark: '#a5b4fc' },
  },
  border: {
    strong: { light: '#d1d5db', dark: '#6b7280' },
    subtle: { light: '#e5e7eb', dark: '#4b5563' },
    success: { light: '#a7f3d0', dark: '#047857' },
    warning: { light: '#fde68a', dark: '#b45309' },
  },
  accent: {
    primary: { light: '#2563eb', dark: '#2563eb' },
    primaryHover: { light: '#1d4ed8', dark: '#1d4ed8' },
    focus: { light: '#3b82f6', dark: '#93c5fd' },
    danger: { light: '#b91c1c', dark: '#fca5a5' },
    success: { light: '#047857', dark: '#6ee7b7' },
    soft: {
      light: 'rgba(29, 78, 216, 0.15)',
      dark: 'rgba(191, 219, 254, 0.2)',
    },
  },
  effect: {
    shadow: { light: 'rgba(15, 23, 42, 0.25)', dark: 'rgba(0, 0, 0, 0.45)' },
    backdrop: { light: 'rgba(15, 23, 42, 0.5)', dark: 'rgba(2, 6, 23, 0.7)' },
    launcherShadow: {
      light: 'rgba(37, 99, 235, 0.35)',
      dark: 'rgba(37, 99, 235, 0.35)',
    },
  },
});

const themed = { inherits: true } as const;

/**
 * The overlay is mounted into applications it does not know: its sheets are
 * emitted outside the cascade layers, so a host's `button { color: inherit }`
 * cannot repaint it. See `StyleSheetOptions.isolated`.
 */
export const ISOLATED = { isolated: true } as const;

/**
 * The overlay's theme variables. `craft-ai` + the old key keeps the old name:
 * `bg` is still `--craft-ai-bg`.
 */
export const ai = cssVars('craft-ai', {
  bg: kind.color(craftAi.surface.page, themed),
  surface: kind.color(craftAi.surface.raised, themed),
  'surface-muted': kind.color(craftAi.surface.muted, themed),
  'surface-accent': kind.color(craftAi.surface.accent, themed),
  'control-bg': kind.color(craftAi.surface.control, themed),
  'success-bg': kind.color(craftAi.surface.success, themed),
  'warning-bg': kind.color(craftAi.surface.warning, themed),
  text: kind.color(craftAi.text.strong, themed),
  'text-muted': kind.color(craftAi.text.muted, themed),
  'accent-text': kind.color(craftAi.text.accent, themed),
  'on-accent': kind.color(craftAi.text.onAccent, themed),
  'success-text': kind.color(craftAi.text.successStrong, themed),
  success: kind.color(craftAi.text.success, themed),
  warning: kind.color(craftAi.text.warning, themed),
  danger: kind.color(craftAi.text.danger, themed),
  'phase-emitted': kind.color(craftAi.text.emitted, themed),
  border: kind.color(craftAi.border.strong, themed),
  'border-subtle': kind.color(craftAi.border.subtle, themed),
  'success-border': kind.color(craftAi.border.success, themed),
  'warning-border': kind.color(craftAi.border.warning, themed),
  accent: kind.color(craftAi.accent.primary, themed),
  'accent-hover': kind.color(craftAi.accent.primaryHover, themed),
  focus: kind.color(craftAi.accent.focus, themed),
  'accent-soft': kind.color(craftAi.accent.soft, themed),
  'danger-fill': kind.color(craftAi.accent.danger, themed),
  'success-fill': kind.color(craftAi.accent.success, themed),
  shadow: kind.color(craftAi.effect.shadow, themed),
  'overlay-backdrop': kind.color(craftAi.effect.backdrop, themed),
  'launcher-shadow': kind.color(craftAi.effect.launcherShadow, themed),
  /** Moved by an application whose own floating controls sit in that corner. */
  'launcher-right': kind.length(unit.px(20), themed),
  'launcher-bottom': kind.length(unit.px(20), themed),
});

/** Which sets each theme variable, in light and in dark. */
const THEME = [
  [ai.bg, craftAi.surface.page],
  [ai.surface, craftAi.surface.raised],
  [ai['surface-muted'], craftAi.surface.muted],
  [ai['surface-accent'], craftAi.surface.accent],
  [ai['control-bg'], craftAi.surface.control],
  [ai['success-bg'], craftAi.surface.success],
  [ai['warning-bg'], craftAi.surface.warning],
  [ai.text, craftAi.text.strong],
  [ai['text-muted'], craftAi.text.muted],
  [ai['accent-text'], craftAi.text.accent],
  [ai['on-accent'], craftAi.text.onAccent],
  [ai['success-text'], craftAi.text.successStrong],
  [ai.success, craftAi.text.success],
  [ai.warning, craftAi.text.warning],
  [ai.danger, craftAi.text.danger],
  [ai['phase-emitted'], craftAi.text.emitted],
  [ai.border, craftAi.border.strong],
  [ai['border-subtle'], craftAi.border.subtle],
  [ai['success-border'], craftAi.border.success],
  [ai['warning-border'], craftAi.border.warning],
  [ai.accent, craftAi.accent.primary],
  [ai['accent-hover'], craftAi.accent.primaryHover],
  [ai.focus, craftAi.accent.focus],
  [ai['accent-soft'], craftAi.accent.soft],
  [ai['danger-fill'], craftAi.accent.danger],
  [ai['success-fill'], craftAi.accent.success],
  [ai.shadow, craftAi.effect.shadow],
  [ai['overlay-backdrop'], craftAi.effect.backdrop],
  [ai['launcher-shadow'], craftAi.effect.launcherShadow],
] as const;

export const aiTheme = craftStyles(
  'craftAiTheme',
  {
    root: [
      ...THEME.map(([token, value]) => set(token, value)),
      when(
        scheme.dark,
        THEME.map(([token, value]) => set(token, darkOf(value))),
      ),
      // The foundation draws the focus ring; inside the overlay it is the
      // overlay's colour.
      // Read from `--craft-ai-focus`, which the theme already flips in dark.
      set(craftBase.focusRing, ai.focus),
    ],
  },
  ISOLATED,
);

/**
 * The overlay's text defaults, spread into each overlay root's own class.
 *
 * Not on `aiTheme.root`, which carries variables only: two classes on one
 * element writing the same property are resolved by atomic class name, not by
 * intent, so the launcher's white text would lose to the theme's ink.
 */
export const overlayText = [
  fontFamily(systemUiStack),
  fontSize(unit.px(13)),
  color(ai.text),
] as const;

// ─── context menu ───────────────────────────────────────────────────────────

/** Where the pointer was, written with `assign(...)` by the menu. */
export const menuPosition = cssVars('craftAiMenu', {
  x: kind.length(unit.px(0)),
  y: kind.length(unit.px(0)),
});

export const aiMenu = craftStyles(
  'craftAiMenu',
  {
    root: [
      ...overlayText,
      position.fixed,
      left(menuPosition.x),
      top(menuPosition.y),
      minWidth(unit.px(180)),
      bg(ai.bg),
      borderWidth(unit.px(1)),
      borderStyle.solid,
      borderColor(ai.border),
      radius(radii.md),
      shadow({ y: unit.px(8), blur: unit.px(24), color: ai.shadow }),
      p(space(1)),
      pointerEvents.auto,
    ],
    item: [
      display.flex,
      alignItems.center,
      gap(space(2)),
      inlineSize(unit.pct(100)),
      py(unit.px(6)),
      px(unit.px(10)),
      bg(craftAi.surface.transparent),
      borderStyle.none,
      textAlign.left,
      color(ai.text),
      cursor.pointer,
      radius(radii.sm),
      when(interaction.hover, [bg(ai['surface-muted'])]),
    ],
  },
  ISOLATED,
);

// ─── launcher ───────────────────────────────────────────────────────────────

export const aiLauncher = craftStyles(
  'craftAiLauncher',
  {
    root: [
      fontFamily(systemUiStack),
      fontSize(unit.px(13)),
      position.fixed,
      right(ai['launcher-right']),
      bottom(ai['launcher-bottom']),
      zIndex(int(1)),
      // The overlay host disables pointer events so the app stays usable.
      pointerEvents.auto,
      display.inlineFlex,
      alignItems.center,
      justifyContent.center,
      gap(space(2)),
      margin(space(0)),
      borderStyle.none,
      radius(radii.full),
      py(unit.px(11)),
      px(space(4)),
      fontWeight(num(600)),
      lineHeight(num(1)),
      bg(ai.accent),
      color(ai['on-accent']),
      shadow({
        y: unit.px(8),
        blur: unit.px(24),
        color: ai['launcher-shadow'],
      }),
      cursor.pointer,
      ...transitions([prop.backgroundColor, prop.scale], {
        duration: unit.ms(120),
        easing: easing.ease,
      }),
      when(interaction.hover, [bg(ai['accent-hover'])]),
      when(interaction.active, [scale(num(0.97))]),
    ],
  },
  ISOLATED,
);

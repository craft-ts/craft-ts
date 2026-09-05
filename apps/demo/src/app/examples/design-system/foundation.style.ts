/**
 * The foundation of the mini design system: palette, axes, and the theme.
 *
 * Everything a component sheet is allowed to depend on lives here. A component
 * never reaches for a palette token directly — it reads a **theme variable**,
 * and the theme is the single place that decides what a variable holds in light
 * mode and in dark mode. That indirection is what makes dark mode one rule
 * instead of one rule per component.
 *
 * A `*.style.ts` imports vocabulary and nothing else; `style-file-boundary`
 * enforces it, which is what lets the build plugin evaluate this file in Node.
 */
import {
  at,
  craftStyles,
  cssVars,
  darkOf,
  defineBreakpoints,
  definePalette,
  defineStateAxis,
  kind,
  scheme,
  set,
  space,
  unit,
  when,
} from '@craft-ts/style';

// ─── palette ────────────────────────────────────────────────────────────────
// Every token carries both of its values and gets its role from the group it
// sits in. `darkOf(...)` is how the theme reaches the other side.

export const ui = definePalette({
  surface: {
    page: { light: '#fbfbfd', dark: '#0b0d11' },
    raised: { light: '#ffffff', dark: '#151922' },
    sunken: { light: '#f0f1f5', dark: '#0f131a' },
  },
  text: {
    strong: { light: '#111318', dark: '#f2f4f8' },
    muted: { light: '#5b6472', dark: '#98a2b3' },
    onAccent: { light: '#ffffff', dark: '#0b0d11' },
  },
  border: {
    subtle: { light: '#e3e6ea', dark: '#232936' },
    strong: { light: '#c3c9d2', dark: '#39414f' },
  },
  accent: {
    neutral: { light: '#4a5568', dark: '#a6b0c0' },
    info: { light: '#1b5fa1', dark: '#6fb2f0' },
    success: { light: '#0f7b4f', dark: '#3ddc97' },
    warning: { light: '#8a5a00', dark: '#f5b544' },
    danger: { light: '#a11b1b', dark: '#ff6b6b' },
  },
});

// ─── axes ───────────────────────────────────────────────────────────────────
// A component may only vary along an axis declared here. Each point carries the
// driver that reaches it, so a scenario the matrix enumerates is a scenario a
// test can actually produce.

export const bp = defineBreakpoints({
  sm: at.minInlineSize(unit.rem(30)),
  md: at.minInlineSize(unit.rem(48)),
  lg: at.minInlineSize(unit.rem(64)),
});

/** Semantic intent. Drives `data-tone` on the element that carries it. */
export const tone = defineStateAxis('tone', [
  'neutral',
  'info',
  'success',
  'warning',
  'danger',
]);

/** Density. Drives `data-size`. */
export const size = defineStateAxis('size', ['sm', 'md', 'lg']);

// ─── theme ──────────────────────────────────────────────────────────────────

/**
 * The theme variables. Components read these; nothing else.
 *
 * They are `<color>` and `<length>` registered through `@property`, so the
 * browser validates them: assigning a length where a colour belongs paints
 * nothing rather than painting wrong.
 *
 * **`inherits: true` here, and only here.** The default is `false`, which is
 * the right default for a variable an element sets on itself and reads on
 * itself — it bounds invalidation to that element. A theme variable is the
 * opposite case: it is set once on a wrapper and read by everything below, so
 * a non-inheriting theme silently hands every descendant the initial value
 * instead. Which looks exactly like dark mode not working, with no error
 * anywhere. Compare with `dsButton-bg` next door, which stays non-inheriting.
 */
const themed = { inherits: true } satisfies { inherits: true };

export const theme = cssVars('ds', {
  surface: kind.color(ui.surface.page, themed),
  raised: kind.color(ui.surface.raised, themed),
  sunken: kind.color(ui.surface.sunken, themed),
  ink: kind.color(ui.text.strong, themed),
  inkMuted: kind.color(ui.text.muted, themed),
  onAccent: kind.color(ui.text.onAccent, themed),
  border: kind.color(ui.border.subtle, themed),
  accent: kind.color(ui.accent.neutral, themed),
  // Absolute, because `@property` requires a computationally independent
  // initial value: `1rem` would make the browser drop the registration
  // entirely, silently. The theme writes the rem value below.
  gutter: kind.length(unit.px(16), themed),
});

const lightTheme = [
  set(theme.surface, ui.surface.page),
  set(theme.raised, ui.surface.raised),
  set(theme.sunken, ui.surface.sunken),
  set(theme.ink, ui.text.strong),
  set(theme.inkMuted, ui.text.muted),
  set(theme.onAccent, ui.text.onAccent),
  set(theme.border, ui.border.subtle),
  set(theme.accent, ui.accent.neutral),
];

const darkTheme = [
  set(theme.surface, darkOf(ui.surface.page)),
  set(theme.raised, darkOf(ui.surface.raised)),
  set(theme.sunken, darkOf(ui.surface.sunken)),
  set(theme.ink, darkOf(ui.text.strong)),
  set(theme.inkMuted, darkOf(ui.text.muted)),
  set(theme.onAccent, darkOf(ui.text.onAccent)),
  set(theme.border, darkOf(ui.border.strong)),
  set(theme.accent, darkOf(ui.accent.neutral)),
];

/**
 * Dark mode is **one** rule, here, and not one per component.
 *
 * Put `dsTheme.root` on a wrapper and everything below it flips. A component
 * that reads `theme.ink` needs no `when(scheme.dark, …)` of its own, which is
 * also why `colorScheme` will not multiply anyone's scenario count in wave 2:
 * the axis writes colours and only colours.
 */
export const dsTheme = craftStyles('dsTheme', {
  root: [
    ...lightTheme,
    set(theme.gutter, space(4)),
    when(bp.md, [set(theme.gutter, space(6))]),
    when(scheme.dark, darkTheme),
  ],
});

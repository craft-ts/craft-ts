/**
 * The component sheets of the mini design system.
 *
 * Read them for the three habits they are trying to show:
 *
 * 1. **A variant is an axis, never a class string.** No sheet below produces a
 *    name a template has to assemble; the template sets one class and one
 *    `data-*` attribute. That is the difference between a component whose
 *    visual states can be enumerated and one whose states you have to guess.
 * 2. **A component reads theme variables, not palette tokens.** The palette is
 *    the theme's business. This is what makes dark mode one rule in
 *    `foundation.style.ts` instead of five here.
 * 3. **What varies at runtime goes through a variable.** `meter.fill` reads
 *    `--ds-meter-value`; the template writes it with `assign(...)`. A width
 *    that depends on a signal cannot be a class, and pretending otherwise is
 *    how a design system ends up generating CSS in the browser.
 */
import {
  alignItems,
  bg,
  blockSize,
  borderColor,
  borderStyle,
  borderWidth,
  color,
  craftStyles,
  cssVars,
  cursor,
  display,
  flexDirection,
  flexWrap,
  font,
  fontWeight,
  gap,
  inlineSize,
  justifyContent,
  kind,
  lineWidth,
  marginBlock,
  num,
  p,
  px,
  py,
  radii,
  radius,
  set,
  space,
  text,
  textAlign,
  unit,
  when,
} from '@craft-ts/style';
import { bp, size, theme, tone, ui } from './foundation.style';

// ─── stack ──────────────────────────────────────────────────────────────────
// The layout primitive. Everything else composes inside one.

export const stack = craftStyles('dsStack', {
  column: [display.flex, flexDirection.column, gap(space(4))],
  row: [display.flex, flexDirection.row, alignItems.center, gap(space(3))],
  wrap: [
    display.flex,
    flexDirection.row,
    flexWrap.wrap,
    alignItems.center,
    gap(space(2)),
  ],
});

// ─── button ─────────────────────────────────────────────────────────────────

const buttonVars = cssVars('dsButton', {
  bg: kind.color(ui.accent.neutral),
  ink: kind.color(ui.text.onAccent),
  // Absolute initial values: `@property` refuses a relative unit there and
  // drops the registration without a word. The variants below write rem.
  padInline: kind.length(unit.px(16)),
  padBlock: kind.length(unit.px(8)),
});

export const button = craftStyles('dsButton', {
  root: [
    display.inlineFlex,
    alignItems.center,
    justifyContent.center,
    gap(space(2)),
    px(buttonVars.padInline),
    py(buttonVars.padBlock),
    radius(radii.md),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(theme.border),
    font(text.sm),
    fontWeight(num(600)),
    bg(buttonVars.bg),
    color(buttonVars.ink),
    cursor.pointer,

    // One rule per tone, and the rule writes a variable rather than a colour on
    // a property: the base rule that reads it never has to be repeated.
    when(tone.neutral, [set(buttonVars.bg, theme.accent)]),
    when(tone.info, [set(buttonVars.bg, ui.accent.info)]),
    when(tone.success, [set(buttonVars.bg, ui.accent.success)]),
    when(tone.warning, [set(buttonVars.bg, ui.accent.warning)]),
    when(tone.danger, [set(buttonVars.bg, ui.accent.danger)]),

    when(size.sm, [
      set(buttonVars.padInline, space(3)),
      set(buttonVars.padBlock, space(1)),
      font(text.xs),
    ]),
    when(size.lg, [
      set(buttonVars.padInline, space(6)),
      set(buttonVars.padBlock, space(3)),
      font(text.base),
    ]),
  ],

  /** The quiet variant: same geometry, no fill. */
  ghost: [
    display.inlineFlex,
    alignItems.center,
    justifyContent.center,
    gap(space(2)),
    px(space(3)),
    py(space(2)),
    radius(radii.md),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(theme.border),
    font(text.sm),
    fontWeight(num(600)),
    bg(theme.raised),
    color(theme.ink),
    cursor.pointer,
  ],
});

// ─── card ───────────────────────────────────────────────────────────────────

export const card = craftStyles('dsCard', {
  root: [
    display.flex,
    flexDirection.column,
    gap(space(3)),
    p(theme.gutter),
    bg(theme.raised),
    color(theme.ink),
    radius(radii.lg),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(theme.border),

    // The only breakpoint this component crosses. The contract records `md`
    // and nothing else, so the matrix will unfold two viewports, not four.
    when(bp.md, [gap(space(4))]),
  ],
  title: [font(text.lg), fontWeight(num(700)), marginBlock(space(0))],
  body: [font(text.sm), color(theme.inkMuted)],
  footer: [
    display.flex,
    justifyContent.flexEnd,
    gap(space(2)),
    marginBlock(space(1)),
  ],
});

// ─── alert ──────────────────────────────────────────────────────────────────

const alertVars = cssVars('dsAlert', {
  accent: kind.color(ui.accent.info),
});

export const alert = craftStyles('dsAlert', {
  root: [
    display.flex,
    alignItems.center,
    gap(space(3)),
    px(space(4)),
    py(space(3)),
    radius(radii.md),
    bg(theme.sunken),
    color(theme.ink),
    font(text.sm),
    // A left rule in the tone colour: one declaration, five variants.
    borderWidth(lineWidth.thick),
    borderStyle.solid,
    borderColor(alertVars.accent),

    when(tone.neutral, [set(alertVars.accent, theme.accent)]),
    when(tone.info, [set(alertVars.accent, ui.accent.info)]),
    when(tone.success, [set(alertVars.accent, ui.accent.success)]),
    when(tone.warning, [set(alertVars.accent, ui.accent.warning)]),
    when(tone.danger, [set(alertVars.accent, ui.accent.danger)]),
  ],
});

// ─── meter ──────────────────────────────────────────────────────────────────

/**
 * The dynamic half of level 1.
 *
 * `--ds-meter-value` is a `<percentage>`, registered through `@property`. The
 * template writes it with `assign(...)` from a signal; the sheet reads it once.
 * There is no class per value — there could not be, since the value is not
 * known at build time — and that is exactly the split the system insists on.
 */
export const meterVars = cssVars('dsMeter', {
  value: kind.percentage(unit.pct(0)),
  track: kind.color(ui.surface.sunken),
});

export const meter = craftStyles('dsMeter', {
  root: [display.flex, flexDirection.column, gap(space(1))],
  track: [
    display.block,
    inlineSize(unit.pct(100)),
    blockSize(space(2)),
    radius(radii.full),
    bg(meterVars.track),
  ],
  fill: [
    display.block,
    blockSize(unit.pct(100)),
    inlineSize(meterVars.value),
    radius(radii.full),
    bg(theme.accent),
  ],
  label: [font(text.xs), color(theme.inkMuted), textAlign.end],
});

/**
 * The status badge, in the typed style system.
 *
 * This file imports vocabulary and nothing else, which is what lets the build
 * plugin import it in Node and read the values it registers. The
 * `style-file-boundary` rule keeps it that way.
 *
 * Two things it demonstrates, and they are the two halves of level 1:
 *
 * - The tone is an **axis**, not a computed class string. The template sets one
 *   static class and one `data-status` attribute; the five variants are five
 *   rules the emitter already wrote. Nothing concatenates a class at runtime,
 *   so the set of visual states is enumerable rather than guessed.
 * - The colours travel through two typed custom properties. The base rule reads
 *   them once; each tone writes them. One class per tone per property would
 *   have multiplied the atoms by five for nothing.
 */
import {
  alignItems,
  bg,
  color,
  craftStyles,
  cssVars,
  defineStateAxis,
  definePalette,
  display,
  font,
  fontWeight,
  gap,
  kind,
  lineHeight,
  num,
  px,
  py,
  radii,
  radius,
  set,
  space,
  text,
  unit,
  when,
} from '@craft-ts/style';

/**
 * Demo-local colours, declared as a palette rather than dropped inline: the
 * group name gives each token its role, and both modes travel together.
 */
const badgePalette = definePalette({
  surface: {
    gray: { light: '#e2e8f0', dark: '#2d3748' },
    red: { light: '#fed7d7', dark: '#4a1d1d' },
    orange: { light: '#feebc8', dark: '#4a3111' },
    green: { light: '#c6f6d5', dark: '#14371f' },
    blue: { light: '#bee3f8', dark: '#183a56' },
  },
  text: {
    gray: { light: '#4a5568', dark: '#cbd5e0' },
    red: { light: '#c53030', dark: '#feb2b2' },
    orange: { light: '#c05621', dark: '#fbd38d' },
    green: { light: '#2f855a', dark: '#9ae6b4' },
    blue: { light: '#2b6cb0', dark: '#90cdf4' },
  },
});

export const statusTone = defineStateAxis('status', [
  'gray',
  'red',
  'orange',
  'green',
  'blue',
]);

export const v = cssVars('status', {
  bg: kind.color(badgePalette.surface.gray),
  ink: kind.color(badgePalette.text.gray),
});

export const status = craftStyles('status', {
  container: [display.inlineFlex, alignItems.center, gap(space(1))],

  emoji: [display.inlineBlock, font(text.sm), lineHeight(num(1))],

  badge: [
    px(space(2)),
    py(space(1)),
    radius(radii.md),
    font(text.xs),
    lineHeight(num(1)),
    fontWeight(num(500)),
    bg(v.bg),
    color(v.ink),

    when(statusTone.gray, [
      set(v.bg, badgePalette.surface.gray),
      set(v.ink, badgePalette.text.gray),
    ]),
    when(statusTone.red, [
      set(v.bg, badgePalette.surface.red),
      set(v.ink, badgePalette.text.red),
    ]),
    when(statusTone.orange, [
      set(v.bg, badgePalette.surface.orange),
      set(v.ink, badgePalette.text.orange),
    ]),
    when(statusTone.green, [
      set(v.bg, badgePalette.surface.green),
      set(v.ink, badgePalette.text.green),
    ]),
    when(statusTone.blue, [
      set(v.bg, badgePalette.surface.blue),
      set(v.ink, badgePalette.text.blue),
    ]),
  ],
});

/** The tone every resource status maps to. Five tones, seven statuses. */
export const TONE_OF_STATUS = {
  idle: 'gray',
  error: 'red',
  loading: 'orange',
  reloading: 'orange',
  resolved: 'green',
  local: 'blue',
  exception: 'red',
} as const;

export type StatusTone = (typeof TONE_OF_STATUS)[keyof typeof TONE_OF_STATUS];

/** Kept so the sheet uses the unit namespace at least once in the demo. */
export const badgeMinInlineSize = unit.rem(3);

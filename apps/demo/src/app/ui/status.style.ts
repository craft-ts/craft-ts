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
  whiteSpace,
} from '@craft-ts/style';
import { herbier, theme } from '@craft-ts/ui/style';

/**
 * The Herbier theme's tones, one per status colour: a neutral, and the
 * danger, warning, tip and info pairs the design system already defines.
 */
const badgePalette = {
  surface: {
    gray: theme.selected,
    red: theme.dangerSurface,
    orange: theme.warningSurface,
    green: theme.tipSurface,
    blue: theme.infoSurface,
  },
  text: {
    gray: theme.ink,
    red: theme.dangerInk,
    orange: theme.warningInk,
    green: theme.tipInk,
    blue: theme.infoInk,
  },
};

export const statusTone = defineStateAxis('status', [
  'gray',
  'red',
  'orange',
  'green',
  'blue',
]);

export const v = cssVars('status', {
  bg: kind.color(herbier.surface.selected),
  ink: kind.color(herbier.text.body),
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
    whiteSpace.nowrap,
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
} satisfies Record<string, string>;

export type StatusTone = keyof typeof statusTone;

/** Kept so the sheet uses the unit namespace at least once in the demo. */
export const badgeMinInlineSize = unit.rem(3);

/**
 * The good defaults craft-ts ships, in the `craft.base` layer.
 *
 * Each one used to be a per-component obligation that a linter tried to
 * re-prove from CSS text (`require-focus-visible`, `require-reduced-motion`).
 * Stated once here, for the whole document, they no longer depend on every
 * component remembering them:
 *
 * - `color-scheme` follows the `scheme` axis, so form controls and scrollbars
 *   match the page instead of staying light in dark mode.
 * - A visible focus ring on every `:focus-visible`, read from theme variables.
 * - Smooth scrolling only for users who did not ask for less motion, and
 *   under `prefers-reduced-motion` every animation and transition collapses
 *   to an instant — important, in the earliest layer that can hold it, which
 *   is the one place that beats every later layer.
 * - `accent-color` and `::selection` from the theme.
 *
 * The app re-themes all of it by writing the variables of `craftBase` in its
 * own `craftGlobalStyles` root: `set(craftBase.focusRing, ui.accent.info)`.
 */
import { kind } from '../kinds.ts';
import { defineVarTokens, set } from '../css-vars.ts';
import { declaration } from '../props/factory.ts';
import {
  accentColor,
  animationDuration,
  animationIterationCount,
  backgroundColor,
  color,
  outlineColor,
  outlineOffset,
  outlineStyle,
  outlineWidth,
  scrollBehavior,
  transitionDuration,
} from '../props/generated.ts';
import { motion, scheme } from '../axes/standard.ts';
import { when } from '../styles.ts';
import { darkOf, palette } from '../tokens/palette.ts';
import { num, unit } from '../tokens/units.ts';
import { important, type GlobalBlock } from './rules.ts';

const themed = { inherits: true } as const;

const foundation = defineVarTokens('craft', {
  accent: kind.color(palette.accent.info, themed),
  focusRing: kind.color(palette.accent.info, themed),
  focusWidth: kind.length(unit.px(2), themed),
  focusOffset: kind.length(unit.px(2), themed),
  selectionBg: kind.color(palette.accent.info, themed),
  selectionInk: kind.color(palette.text.inverted, themed),
});

/**
 * The foundation's theme variables. Write them from the app's
 * `craftGlobalStyles` root to re-theme focus, selection and form accents.
 */
export const craftBase = foundation.tokens;

/** Their `@property` blocks — emitted by the build when the foundation is on. */
export const CRAFT_BASE_VARS = foundation.declarations;

export const CRAFT_BASE: readonly GlobalBlock[] = [
  {
    selector: ':root',
    items: [
      declaration('color-scheme', 'light'),
      set(craftBase.accent, palette.accent.info),
      set(craftBase.focusRing, palette.accent.info),
      set(craftBase.selectionBg, palette.accent.info),
      set(craftBase.selectionInk, palette.text.inverted),
      accentColor(craftBase.accent),
      when(scheme.dark, [
        declaration('color-scheme', 'dark'),
        set(craftBase.accent, darkOf(palette.accent.info)),
        set(craftBase.focusRing, darkOf(palette.accent.info)),
        set(craftBase.selectionBg, darkOf(palette.accent.info)),
        set(craftBase.selectionInk, darkOf(palette.text.inverted)),
      ]),
    ],
  },
  {
    selector: 'html',
    items: [scrollBehavior.smooth, when(motion.reduced, [scrollBehavior.auto])],
  },
  {
    selector: '*, *::before, *::after',
    items: [
      when(motion.reduced, [
        important(animationDuration(unit.ms(0.01))),
        important(animationIterationCount(num(1))),
        important(transitionDuration(unit.ms(0.01))),
        important(scrollBehavior.auto),
      ]),
    ],
  },
  {
    selector: ':focus-visible',
    items: [
      outlineStyle.solid,
      outlineWidth(craftBase.focusWidth),
      outlineColor(craftBase.focusRing),
      outlineOffset(craftBase.focusOffset),
    ],
  },
  {
    selector: '::selection',
    items: [
      backgroundColor(craftBase.selectionBg),
      color(craftBase.selectionInk),
    ],
  },
];

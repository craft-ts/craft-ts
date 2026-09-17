/**
 * The typed part of the review application's design system.
 *
 * The rest of the review surface is still legacy CSS, but decision controls
 * must be covered by the same static contrast proof as a generated CraftTS
 * application. Keep the palette named and let the theme choose the value for
 * each colour scheme so the graph can report the decision behind a failure.
 */
import {
  bg,
  color,
  craftStyles,
  cssVars,
  darkOf,
  definePalette,
  kind,
  scheme,
  set,
  when,
} from '@craft-ts/style';

export const reviewUi = definePalette('reviewUi', {
  text: {
    onAccent: { light: '#ffffff', dark: '#ffffff' },
  },
  accent: {
    active: { light: '#2a3eb0', dark: '#5268ef' },
  },
});

const themed = { inherits: true } satisfies { inherits: true };

const theme = cssVars('reviewApp', {
  onAccent: kind.color(reviewUi.text.onAccent, themed),
  accentActive: kind.color(reviewUi.accent.active, themed),
});

export const reviewTheme = craftStyles('reviewTheme', {
  root: [
    set(theme.onAccent, reviewUi.text.onAccent),
    set(theme.accentActive, reviewUi.accent.active),
    when(scheme.dark, [
      set(theme.onAccent, darkOf(reviewUi.text.onAccent)),
      set(theme.accentActive, darkOf(reviewUi.accent.active)),
    ]),
  ],
});

export const decision = craftStyles('reviewDecision', {
  primary: [bg(theme.accentActive), color(theme.onAccent)],
  key: [color(theme.onAccent)],
});

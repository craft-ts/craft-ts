// #region contract
// The host's style contract — in a real project the host publishes it from its
// own `*.style.ts`, or from its package's `/style` entry (`@acme/shell/style`).
import { cssVars, defineStateAxis, kind, palette } from '@craft-ts/style';

// Set once by the host, read by every view below it: a theme inherits.
const themed = { inherits: true } as const;

export const shellTheme = cssVars('shell', {
  accent: kind.color(palette.accent.info, themed),
  surface: kind.color(palette.surface.raised, themed),
  ink: kind.color(palette.text.strong, themed),
});

/** Drives `data-emphasis` on the element that carries it. */
export const emphasis = defineStateAxis('emphasis', ['quiet', 'loud']);
// #endregion contract

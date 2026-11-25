// #region foundation
import { cssVars, defineStateAxis, kind, palette } from '@craft-ts/style';

// The project's own tokens and axes — see "Defining your design system".
const themed = { inherits: true } as const;

export const theme = cssVars('adapterTheme', {
  accent: kind.color(palette.accent.info, themed),
  danger: kind.color(palette.accent.danger, themed),
  onAccent: kind.color(palette.text.inverted, themed),
});

/** Drives `data-tone` on the element that carries it. */
export const tone = defineStateAxis('tone', ['neutral', 'danger']);
// #endregion foundation

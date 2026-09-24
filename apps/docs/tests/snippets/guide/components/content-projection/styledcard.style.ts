// #region sheet
import {
  color,
  craftStyles,
  cssVars,
  display,
  kind,
  p,
  palette,
  space,
} from '@craft-ts/style';

/** What the card offers its content: an inherited accent it may read. */
export const styledCardVars = cssVars('styledCard', {
  accent: kind.color(palette.accent.info, { inherits: true }),
});

export const styledCard = craftStyles('styledCard', {
  // The frame around the slot. `color` inherits into the content.
  body: [display.block, p(space(4)), color(palette.text.strong)],
});

/** The caller's own sheet, for the content it supplies. */
export const noteSheet = craftStyles('styledCardNote', {
  root: [color(styledCardVars.accent)],
});
// #endregion sheet

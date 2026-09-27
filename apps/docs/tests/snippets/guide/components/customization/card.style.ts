// #region sheet
import {
  bg,
  borderColor,
  borderStyle,
  borderWidth,
  craftStyles,
  cssVars,
  defineStateAxis,
  kind,
  lineWidth,
  p,
  palette,
  radii,
  radius,
  set,
  space,
  when,
} from '@craft-ts/style';

/** A title's ink, set by the card and inherited by whatever sits inside. */
export const cardVars = cssVars('customCard', {
  ink: kind.color(palette.text.strong, { inherits: true }),
});

export const cardActive = defineStateAxis('cardActive', ['true']);

export const cardSheet = craftStyles('docsCustomCard', {
  root: [
    p(space(4)),
    radius(radii.md),
    bg(palette.surface.raised),
    when(cardActive.true, [set(cardVars.ink, palette.accent.info)]),
  ],
  /** Added by a caller: it writes the border, which `root` leaves alone. */
  featured: [
    borderWidth(lineWidth.thick),
    borderStyle.solid,
    borderColor(palette.accent.info),
  ],
});
// #endregion sheet

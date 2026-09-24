// #region sheet
import {
  bg,
  blockSize,
  color,
  craftStyles,
  cssVars,
  defineStateAxis,
  fontWeight,
  inlineSize,
  kind,
  p,
  palette,
  radii,
  radius,
  set,
  space,
  unit,
  when,
} from '@craft-ts/style';

/** A variant is an axis: the template sets `data-cardTone`. */
export const cardTone = defineStateAxis('cardTone', ['danger']);

/** A value that changes at runtime is a typed variable, set with `assign`. */
export const cardVars = cssVars('card', {
  progress: kind.lengthPercentage(unit.pct(0)),
  accent: kind.color(palette.accent.info),
});

export const card = craftStyles('docsCard', {
  root: [
    p(space(4)),
    radius(radii.md),
    bg(palette.surface.raised),
    color(palette.text.strong),
    when(cardTone.danger, [set(cardVars.accent, palette.accent.danger)]),
  ],
  title: [fontWeight.bold],
  bar: [
    inlineSize(cardVars.progress),
    blockSize(space(1)),
    bg(cardVars.accent),
  ],
});
// #endregion sheet

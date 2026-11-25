// #region adapter
import {
  bg,
  color,
  craftStyles,
  fontWeight,
  p,
  radii,
  radius,
  space,
  when,
} from '@craft-ts/style';
import { theme, tone } from './foundation.style';

/**
 * The local CraftTS adapter: what this project needs from the kit's button,
 * re-expressed with the project's own tokens and axes.
 */
export const kitButton = craftStyles(
  'kitButton',
  {
    root: [
      p(space(2)),
      radius(radii.md),
      bg(theme.accent),
      color(theme.onAccent),
      fontWeight.bold,
      // The kit's "danger" modifier becomes a point on the project's axis.
      when(tone.danger, [bg(theme.danger)]),
    ],
  },
  { axes: [tone] },
);
// #endregion adapter

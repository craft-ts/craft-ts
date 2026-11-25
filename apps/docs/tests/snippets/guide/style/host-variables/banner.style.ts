// #region view
import { bg, color, craftStyles, p, space, when } from '@craft-ts/style';
// ✓ the host's contract — '@acme/shell/style' when the host is a package
import { emphasis, shellTheme } from './shell.style';

export const banner = craftStyles(
  'banner',
  {
    root: [
      p(space(4)),
      bg(shellTheme.surface),
      color(shellTheme.ink),
      // The host's axis is a point of the view's own matrix.
      when(emphasis.loud, [bg(shellTheme.accent)]),
    ],
  },
  { axes: [emphasis] },
);
// #endregion view

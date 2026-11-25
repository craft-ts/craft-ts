// #region adapted-view
import { bg, color, craftStyles, p, space } from '@craft-ts/style';
// ✓ the adapter's contract, never `--host-accent` itself
import { hostTheme } from './host-adapter.style';

export const panel = craftStyles('panel', {
  root: [p(space(4)), bg(hostTheme.surface), color(hostTheme.accent)],
});
// #endregion adapted-view

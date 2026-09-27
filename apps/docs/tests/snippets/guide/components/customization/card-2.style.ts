// #region sheet
import { color, craftStyles, fontWeight } from '@craft-ts/style';
import { cardVars } from './card.style';

/** The title reads the card's variable; it never looks at the card itself. */
export const titleSheet = craftStyles('docsCardTitle', {
  root: [color(cardVars.ink), fontWeight.bold],
});
// #endregion sheet

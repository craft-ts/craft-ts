import { craftComponent, div, span } from '@craft-ts/component';
import { logoUi } from './logo.style.ts';

/**
 * The craft-ts mark, in the colours of the season and of the day or night. It fills the
 * width its parent gives it. Decoration beside the site's name, so it is hidden from
 * assistive technology: the name is what they read.
 */
export const DocLogo = craftComponent('DocLogo', {}, () =>
  div({ class: logoUi.root, 'aria-hidden': 'true' }, [
    span({ class: logoUi.layer, 'data-bar': 'behind' }),
    span({ class: logoUi.layer, 'data-bar': 'upright' }),
    span({ class: logoUi.layer, 'data-bar': 'across' }),
  ]),
);

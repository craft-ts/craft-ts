import { craftComponent, div, span, type CraftNodeChild } from '@craft-ts/component';
import { logoUi } from './logo.style.ts';

const PARTS = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'shade', 'light'] as const;

/**
 * The craft-ts mark, in the colours of the season and of the day or night. It fills the
 * width its parent gives it. Decoration beside the site's name, so it is hidden from
 * assistive technology: the name is what they read.
 *
 * Eight bands of the gradient, painted in order, then the shade of the folds and the pale
 * edge over them; the silhouette on the root cuts the lot to the shape of the logo.
 */
export const DocLogo = craftComponent('DocLogo', {}, () =>
  div(
    { class: logoUi.root, 'aria-hidden': 'true' },
    PARTS.map((name): CraftNodeChild => span({ class: logoUi.layer, 'data-part': name })),
  ),
);

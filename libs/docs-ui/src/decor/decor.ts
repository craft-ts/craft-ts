import { craftComponent, div, span, type CraftNodeChild } from '@craft-ts/component';
import { contoursUi, forestUi, plateUi } from './decor.style.ts';

const LAYERS = ['back', 'ridge', 'middle', 'near', 'front'] as const;

/**
 * The forest of the hero: five planes of spruce, far to near, each a mask in its
 * own colour. Decoration only — hidden from assistive technology.
 */
export const DocForest = craftComponent('DocForest', {}, () =>
  div(
    { class: forestUi.root, 'aria-hidden': 'true' },
    // Each plane is its trees, then what sits on them: the next plane covers both.
    LAYERS.flatMap(
      (layer): CraftNodeChild[] => [
        span({ class: forestUi.layer, 'data-layer': layer }),
        span({ class: forestUi.trim, 'data-layer': layer }),
      ],
    ),
  ),
);

/** Contour lines over the whole of its parent: two sets, one stronger. */
export const DocContours = craftComponent('DocContours', {}, () =>
  div({ 'aria-hidden': 'true' }, [
    span({ class: contoursUi.glow }),
    span({ class: contoursUi.root, 'data-contour': 'strong' }),
    span({ class: contoursUi.root, 'data-contour': 'soft' }),
  ]),
);

/**
 * The botanical plate of the home page: a fern drawn in line work with a wash
 * of sage and a fruit in ochre. The caption is the figure's, given by the page.
 */
export const DocPlate = craftComponent('DocPlate', {}, () =>
  div({ class: plateUi.root, 'aria-hidden': 'true' }, [
    // The washes first, the line work over them. A colour the season's plate does not use
    // is an empty mask: the layer is there and draws nothing.
    span({ class: plateUi.layer, 'data-pass': 'sage' }),
    span({ class: plateUi.layer, 'data-pass': 'card' }),
    span({ class: plateUi.layer, 'data-pass': 'moss' }),
    span({ class: plateUi.layer, 'data-pass': 'accent' }),
    span({ class: plateUi.layer, 'data-pass': 'snow' }),
    span({ class: plateUi.layer, 'data-pass': 'ochre' }),
    span({ class: plateUi.layer, 'data-pass': 'ink' }),
  ]),
);

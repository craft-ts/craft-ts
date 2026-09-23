/**
 * The reset craft-ts ships, in the `craft.reset` layer.
 *
 * On by default (`craftStyle({ reset: true })`), so no app writes one — and
 * no two apps drift apart on what `h1` looks like before a sheet touches it.
 * Turning it off is a deliberate `reset: false`.
 *
 * Written with the typed vocabulary like any sheet. The two declarations the
 * generated table does not own (`text-size-adjust` and its prefixed twin) are
 * named once in `FOUNDATION_PROPERTIES`, which is also what lets the emitter's
 * last-net validation accept them.
 */
import { declaration, global } from '../props/factory.ts';
import {
  boxSizing,
  display,
  margin,
  maxInlineSize,
  overflowWrap,
  prop,
  textWrap,
} from '../props/generated.ts';
import { space } from '../tokens/scales.ts';
import { unit } from '../tokens/units.ts';
import type { GlobalBlock } from './rules.ts';

/** Properties only the foundation writes; see the module comment. */
export const FOUNDATION_PROPERTIES = [
  'text-size-adjust',
  '-webkit-text-size-adjust',
] as const;

const HEADINGS = 'h1, h2, h3, h4, h5, h6';

export const CRAFT_RESET: readonly GlobalBlock[] = [
  // Sizes include padding and border, everywhere, pseudo-elements included.
  { selector: '*, *::before, *::after', items: [boxSizing.borderBox] },
  // Spacing is a component's decision, never a user-agent default.
  { selector: '*', items: [margin(space(0))] },
  // A phone rotating to landscape does not get to inflate the text.
  {
    selector: 'html',
    items: [
      declaration('-webkit-text-size-adjust', 'none'),
      declaration('text-size-adjust', 'none'),
    ],
  },
  // Media are blocks that never overflow their container.
  {
    selector: 'img, picture, video, canvas, svg',
    items: [display.block, maxInlineSize(unit.pct(100))],
  },
  // Form controls take the document's font instead of the platform's.
  {
    selector: 'input, button, textarea, select',
    items: [global.inherit(prop.font)],
  },
  // Balanced headings, no orphan on the last line of a paragraph.
  { selector: HEADINGS, items: [textWrap.balance] },
  { selector: 'p', items: [textWrap.pretty] },
  // A long URL wraps instead of widening the page.
  { selector: `p, ${HEADINGS}`, items: [overflowWrap.anywhere] },
];

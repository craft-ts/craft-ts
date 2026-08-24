/**
 * The property table, plus the handful of short names worth having.
 *
 * Everything below is an **alias of a generated helper**, never a new helper:
 * `p` is `padding`, not a second definition of padding that could drift from
 * the spec. The only thing written by hand here is `font`, which pairs two
 * generated helpers because a size and its line height must not drift apart.
 *
 * `overflow` is absent, here and in the generated table. The single path to
 * `overflow: auto` is `provides(scrollPort.block)`, which lays down the CSS
 * effect and the discharge in the same object.
 */
import type { FontSizeToken } from '../tokens/scales';
import { rawLength } from '../tokens/units';
import type { Declaration } from './factory';
import {
  borderRadius,
  fontSize,
  gap,
  lineHeight,
  padding,
  paddingBlock,
  paddingInline,
  backgroundColor,
} from './generated';

export * from './generated';
export {
  global,
  declaration,
  propertyName,
  type Declaration,
  type PropertyToken,
} from './factory';

/** `padding`. */
export const p = padding;
/** `padding-inline`. */
export const px = paddingInline;
/** `padding-block`. */
export const py = paddingBlock;
/** `background-color`. */
export const bg = backgroundColor;
/** `border-radius`. */
export const radius = borderRadius;

export { gap };

/**
 * A size and its line height, together.
 *
 * Two declarations from one call is the only shape that cannot be half-applied.
 * A component that sets `font-size` and forgets `line-height` is the most
 * common way a type scale stops being a scale.
 */
export const font = (token: FontSizeToken): readonly Declaration[] => [
  fontSize(token),
  lineHeight(rawLength(token.lineHeight)),
];

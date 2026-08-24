/**
 * The closed scales.
 *
 * `space(4.5)` does not compile: the step is a union of literals, not a
 * `number`. When a step is missing, it is added here — that is the whole point
 * of a scale, and the reason `unsafeLength` exists as the marked alternative
 * rather than an arbitrary-value syntax.
 */
import { rawLength, type LengthValue } from './units';

export type SpaceStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16 | 20 | 24;

const SPACE_REM: Readonly<Record<SpaceStep, number>> = {
  0: 0,
  1: 0.25,
  2: 0.5,
  3: 0.75,
  4: 1,
  5: 1.25,
  6: 1.5,
  8: 2,
  10: 2.5,
  12: 3,
  16: 4,
  20: 5,
  24: 6,
};

export const space = (step: SpaceStep): LengthValue =>
  rawLength(`${SPACE_REM[step]}rem`);

export const radii = {
  none: rawLength('0'),
  sm: rawLength('0.25rem'),
  md: rawLength('0.375rem'),
  lg: rawLength('0.5rem'),
  xl: rawLength('0.75rem'),
  full: rawLength('9999px'),
} as const;

/**
 * Named `lineWidth` rather than `borderWidth`: the generated table already
 * exports a `borderWidth` **helper**, and one name for two concepts in the same
 * import is the collision this package spends its effort avoiding.
 */
export const lineWidth = {
  hairline: rawLength('1px'),
  thick: rawLength('2px'),
} as const;

/**
 * A type scale entry **is** a length, and carries its line height alongside.
 *
 * Being a length is what lets it flow into the generated `font-size` helper
 * without a conversion; carrying the line height is what lets `font(text.sm)`
 * emit both declarations, which is the only shape in which the pair cannot
 * drift apart.
 */
export interface FontSizeToken extends LengthValue {
  readonly lineHeight: string;
}

const size = (css: string, lineHeight: string): FontSizeToken =>
  ({ ...rawLength(css), lineHeight }) as FontSizeToken;

export const text = {
  xs: size('0.75rem', '1rem'),
  sm: size('0.875rem', '1.25rem'),
  base: size('1rem', '1.5rem'),
  lg: size('1.125rem', '1.75rem'),
  xl: size('1.375rem', '1.875rem'),
} as const;

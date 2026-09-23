/**
 * The CSS functions a component needs and the generated table cannot close:
 * shadows, `min()`/`max()`/`clamp()`, grid track lists.
 *
 * Each is a **typed constructor**, never a string. `math.min(unit.px(560),
 * unit.pct(100))` is a `<length-percentage>` because both arguments are; a
 * shadow's colour is a colour value, so a theme variable or a palette token
 * goes in and `'rgba(0,0,0,.2)'` does not.
 *
 * Namespaced (`math`, `tracks`) rather than exported bare: `min`, `max` and
 * `repeat` read like properties, and the rule of this package is that one
 * name never means two things in the same import.
 */
import { declaration, type Declaration } from './props/factory.ts';
import type {
  ColorValue,
  LengthPercentageValue,
  LengthValue,
} from './tokens/units.ts';

const lengthOf = (css: string): LengthValue =>
  ({ css, unproven: '' }) as LengthValue;

type LengthLike = LengthPercentageValue;

/**
 * `min()`, `max()`, `clamp()` over lengths and percentages.
 *
 * The result is typed as a `<length>` so it flows into every length helper;
 * the browser resolves it at layout time, which is the whole point.
 */
export const math = {
  min: (...values: readonly [LengthLike, LengthLike, ...LengthLike[]]) =>
    lengthOf(`min(${values.map((value) => value.css).join(', ')})`),
  max: (...values: readonly [LengthLike, LengthLike, ...LengthLike[]]) =>
    lengthOf(`max(${values.map((value) => value.css).join(', ')})`),
  clamp: (minimum: LengthLike, preferred: LengthLike, maximum: LengthLike) =>
    lengthOf(`clamp(${minimum.css}, ${preferred.css}, ${maximum.css})`),
} as const;

export interface ShadowLayer {
  readonly x?: LengthValue;
  readonly y: LengthValue;
  readonly blur: LengthValue;
  readonly spread?: LengthValue;
  readonly color: ColorValue;
  readonly inset?: boolean;
}

const layerText = (layer: ShadowLayer): string =>
  [
    layer.inset ? 'inset' : '',
    layer.x?.css ?? '0',
    layer.y.css,
    layer.blur.css,
    layer.spread?.css ?? '',
    layer.color.css,
  ]
    .filter(Boolean)
    .join(' ');

/**
 * `box-shadow`, one or more layers. The generated table only knows `none`,
 * because the grammar is a list the reader cannot close; this constructor is
 * the closed version of it.
 */
export function shadow(
  ...layers: readonly [ShadowLayer, ...ShadowLayer[]]
): Declaration {
  return declaration('box-shadow', layers.map(layerText).join(', '));
}

/**
 * Grid track lists. Typed as a `<length>` so `gridTemplateColumns` takes them;
 * the text is a valid track list by construction.
 */
export const tracks = {
  /** `repeat(auto-fit, minmax(<min>, 1fr))` — as many columns as fit. */
  autoFit: (minimum: LengthValue) =>
    lengthOf(`repeat(auto-fit, minmax(${minimum.css}, 1fr))`),
  /** `repeat(auto-fill, minmax(<min>, 1fr))` — keeps empty columns. */
  autoFill: (minimum: LengthValue) =>
    lengthOf(`repeat(auto-fill, minmax(${minimum.css}, 1fr))`),
  /** `repeat(<count>, minmax(0, 1fr))` — equal columns that may shrink. */
  equal: (count: number) =>
    lengthOf(`repeat(${Math.max(1, Math.trunc(count))}, minmax(0, 1fr))`),
} as const;

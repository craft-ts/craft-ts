/**
 * The CSS functions a component needs and the generated table cannot close:
 * shadows, `min()`/`max()`/`clamp()`, grid track lists, gradients.
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
  AngleValue,
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
declare const FLEX_TRACK: unique symbol;

/** `<flex>` — `tracks.fr(1)`. Accepted by `tracks.list` and nowhere else. */
export interface FlexTrack {
  readonly css: string;
  readonly [FLEX_TRACK]: true;
}

/** One entry of `tracks.list`. */
export type TrackSize =
  | LengthLike
  | FlexTrack
  | 'auto'
  | 'min-content'
  | 'max-content';

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
  /**
   * A share of the free space, `<n>fr`. Only a track list takes it: a flex
   * value is not a length, so it cannot reach `width` or `padding` by mistake.
   */
  fr: (amount: number): FlexTrack => ({ css: `${amount}fr` }) as FlexTrack,
  /**
   * `minmax(<min>, <max>)` — most often `tracks.minmax(space(0), tracks.fr(1))`,
   * a share of the space that may shrink below its content's width, where a
   * bare `fr` track would push the grid wider than its container.
   */
  minmax: (minimum: LengthLike, maximum: TrackSize): FlexTrack =>
    ({
      css: `minmax(${minimum.css}, ${typeof maximum === 'string' ? maximum : maximum.css})`,
    }) as FlexTrack,
  /** An explicit track list — `tracks.list(unit.rem(2), tracks.fr(1), 'auto')`. */
  list: (...sizes: readonly [TrackSize, ...TrackSize[]]) =>
    lengthOf(
      sizes
        .map((size) => (typeof size === 'string' ? size : size.css))
        .join(' '),
    ),
} as const;

// ─── images ─────────────────────────────────────────────────────────────────

declare const IMAGE: unique symbol;

/**
 * `<image>` — a gradient, built by `gradient.*`. Only `bgImage` and an image
 * variable (`kind.image`) take it, so a gradient cannot land in `color`.
 */
export interface ImageValue {
  readonly css: string;
  readonly unproven: string;
  readonly [IMAGE]: true;
}

/**
 * Gradients from colour values: a palette token or a theme variable goes in,
 * `'#ff0000'` does not. The stops are spread evenly, which is what nearly
 * every gradient in an interface is.
 */
/**
 * One colour stop: a colour alone (spread evenly), or a colour with where it
 * starts and, optionally, where it ends — `[ink, unit.pct(25)]`,
 * `[ink, space(0), unit.pct(25)]`.
 */
export type GradientStop =
  | ColorValue
  | readonly [ColorValue, LengthPercentageValue]
  | readonly [ColorValue, LengthPercentageValue, LengthPercentageValue];

type Stops = readonly [GradientStop, GradientStop, ...GradientStop[]];

const stopText = (stop: GradientStop): string =>
  Array.isArray(stop)
    ? (stop as readonly { readonly css: string }[])
        .map((part) => part.css)
        .join(' ')
    : (stop as ColorValue).css;

const image = (css: string): ImageValue =>
  ({ css, unproven: '' }) as ImageValue;

const list = (stops: Stops) => stops.map(stopText).join(', ');

export const gradient = {
  linear: (angle: AngleValue, stops: Stops): ImageValue =>
    image(`linear-gradient(${angle.css}, ${list(stops)})`),
  radial: (stops: Stops): ImageValue =>
    image(`radial-gradient(${list(stops)})`),
  /** Repeats its stops along the angle — stripes, rulers, tree guides. */
  repeatingLinear: (angle: AngleValue, stops: Stops): ImageValue =>
    image(`repeating-linear-gradient(${angle.css}, ${list(stops)})`),
  /** Repeats its stops around a point — a checkerboard is two of its quarters. */
  repeatingConic: (stops: Stops): ImageValue =>
    image(`repeating-conic-gradient(${list(stops)})`),
} as const;

/**
 * `background-image` from a gradient, or from an image variable written at
 * runtime with `assign(v.art, gradient.linear(...))`.
 *
 * Named apart from the generated `backgroundImage`, which takes a `url()`: one
 * name, one concept.
 */
export const bgImage = (
  ...images: readonly [ImageValue, ...ImageValue[]]
): Declaration =>
  declaration('background-image', images.map((layer) => layer.css).join(', '));

/** `background-size` as two lengths — what the generated helper cannot write. */
export const bgSize = (
  inline: LengthPercentageValue,
  block: LengthPercentageValue,
): Declaration => declaration('background-size', `${inline.css} ${block.css}`);

/** `background-position` as two lengths. */
export const bgPosition = (
  inline: LengthPercentageValue,
  block: LengthPercentageValue,
): Declaration =>
  declaration('background-position', `${inline.css} ${block.css}`);

/** `backdrop-filter: blur(<length>)` — frosted glass behind an overlay. */
export const backdropBlur = (radius: LengthValue): Declaration =>
  declaration('backdrop-filter', `blur(${radius.css})`);

/**
 * `color-scheme` — which palette the user agent paints form controls and
 * scrollbars in. The generated helper only knows `normal`; an app whose theme
 * can be chosen explicitly has to say `light` or `dark` where the choice is.
 */
export const uaScheme = {
  light: declaration('color-scheme', 'light'),
  dark: declaration('color-scheme', 'dark'),
} as const;

/**
 * `grid-column: 1 / -1` — an item that spans every column of its grid, the
 * one line placement an interface keeps writing. The generated helper takes an
 * identifier only.
 */
export const spanAllColumns = declaration('grid-column', '1 / -1');

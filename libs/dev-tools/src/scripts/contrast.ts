/**
 * WCAG 2.2 §1.4.3 contrast, as arithmetic and nothing else.
 *
 * Pure by construction: strings in, numbers out. It knows nothing about a
 * sheet, a graph, a browser or a digest, which is what lets the static solver
 * next door and the runtime digest in `@craft-ts/style-testing` share one
 * answer instead of drifting into two.
 *
 * **Why it lives in `@craft-ts/dev-tools` and not in `@craft-ts/style`**, where
 * the vocabulary it serves lives. Every library in this workspace reaches
 * `dev-tools` — through its ESLint configuration if nothing else — so
 * `dev-tools` is the root of the project graph and may depend on nothing.
 * Putting the arithmetic in `@craft-ts/style` therefore leaves two options:
 * a cycle, or a second copy of the formula. The second copy is the one that
 * fails silently — the digest calls a pair readable that the static solver
 * fails — and it is the copy this module was written to remove. So the
 * arithmetic sits at the root, and the packages that need it import it from
 * here. This module deliberately imports nothing, Node or otherwise.
 *
 * Two decisions carry the rest of the file:
 *
 * 1. **A colour this module cannot prove is not a colour.** `parseCssColor`
 *    returns an `unsupported` result rather than guessing, and every guess it
 *    refuses to make — a gradient, a semi-transparent fill, `currentColor` —
 *    becomes an `indeterminate` diagnostic upstream. A ratio computed from a
 *    colour nobody resolved is worse than no ratio: it is a green test.
 * 2. **The ratio is never rounded before it is compared.** `4.4999` fails a
 *    4.5 threshold. Rounding first turns the one number the criterion is
 *    written in into a number that passes it, and the report would then say
 *    `4.50:1 — pass` about a pair that does not.
 */

/** 0–255 per channel. Alpha lives outside; see `ColorParse`. */
export type Rgb = readonly [number, number, number];

export type ColorParse =
  | { readonly kind: 'opaque'; readonly rgb: Rgb; readonly css: string }
  | {
      readonly kind: 'unsupported';
      readonly css: string;
      readonly reason: UnsupportedColorReason;
      readonly detail: string;
    };

export type UnsupportedColorReason =
  | 'not-a-colour'
  | 'alpha'
  | 'unresolved-var'
  | 'non-literal-function';

/** Text below these thresholds needs 4.5:1; at or above them, 3:1. */
export const LARGE_TEXT_PX = 24;
export const LARGE_BOLD_TEXT_PX = 18.5;
/**
 * The weight at which the spec's "bold" starts.
 *
 * WCAG says "bold" without giving a number; CSS says `bold` is 700. Taking 700
 * is the reading that never lowers a threshold by accident — `600` at 18.5px
 * stays on 4.5:1, which is the conservative side of an ambiguity.
 */
export const BOLD_WEIGHT = 700;

export const AA_NORMAL_TEXT = 4.5;
export const AA_LARGE_TEXT = 3;

/* ------------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------------ */

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/;
const RGB_FUNCTION = /^rgba?\(([^()]*)\)$/;

const byte = (text: string): number => Number.parseInt(text, 16);

const channelsFromHex = (
  digits: string,
): readonly [number, number, number, number] => {
  const expanded =
    digits.length <= 4
      ? [...digits].map((digit) => digit + digit).join('')
      : digits;
  return [
    byte(expanded.slice(0, 2)),
    byte(expanded.slice(2, 4)),
    byte(expanded.slice(4, 6)),
    expanded.length === 8 ? byte(expanded.slice(6, 8)) / 255 : 1,
  ];
};

/**
 * `#rgb` / `#rrggbb` / `rgb()` / `rgba()` → channels, alpha included.
 *
 * The permissive reading, kept for the digest: it answers "what is this
 * colour", not "can this colour be trusted". Callers that need the second
 * question ask `parseCssColor`.
 */
export function parseColorChannels(
  value: string,
): readonly [number, number, number, number] | undefined {
  const text = value.trim().toLowerCase();
  if (text === 'transparent') return [0, 0, 0, 0];
  const fn = RGB_FUNCTION.exec(text);
  if (fn) {
    const words = (fn[1] as string).split(/[\s,/]+/).filter(Boolean);
    const [red, green, blue, opacity] = words;
    if (red === undefined || green === undefined || blue === undefined) {
      return undefined;
    }
    // A channel is a `<number>` 0–255 or a `<percentage>` of 255; alpha is the
    // same two spellings against 1. Two scales, so they are read separately
    // rather than through one map that would have to undo itself afterwards.
    const toChannel = (part: string): number =>
      part.endsWith('%')
        ? (Number.parseFloat(part) / 100) * 255
        : Number.parseFloat(part);
    const toAlpha = (part: string): number =>
      part.endsWith('%') ? Number.parseFloat(part) / 100 : Number.parseFloat(part);
    const channels = [toChannel(red), toChannel(green), toChannel(blue)];
    const alpha = opacity === undefined ? 1 : toAlpha(opacity);
    if ([...channels, alpha].some((value) => Number.isNaN(value))) {
      return undefined;
    }
    return [channels[0] as number, channels[1] as number, channels[2] as number, alpha];
  }
  const hex = HEX.exec(text);
  if (!hex) return undefined;
  return channelsFromHex(hex[1] as string);
}

/**
 * The strict reading: an opaque colour, or a named reason why not.
 *
 * v1 does not composite. A fill at `rgba(0,0,0,.5)` over an unknown backdrop
 * has no single value, and inventing one — compositing over white, say —
 * produces a ratio that is right on a white page and wrong everywhere else.
 * The honest answer is that the pair cannot be decided statically.
 */
export function parseCssColor(value: string): ColorParse {
  const css = value.trim();
  const lowered = css.toLowerCase();
  if (lowered.includes('var(')) {
    return {
      kind: 'unsupported',
      css,
      reason: 'unresolved-var',
      detail: `'${css}' still contains a var() reference. The solver resolves CraftTS variables before it gets here; one left over means the declaration that writes it was not found.`,
    };
  }
  if (/^[a-z-]+\(/.test(lowered) && !RGB_FUNCTION.test(lowered)) {
    return {
      kind: 'unsupported',
      css,
      reason: 'non-literal-function',
      detail: `'${css}' is a colour function v1 does not evaluate. Only hexadecimal and rgb()/rgba() are proven; everything else is reported rather than guessed.`,
    };
  }
  const channels = parseColorChannels(css);
  if (!channels) {
    return {
      kind: 'unsupported',
      css,
      reason: 'not-a-colour',
      detail: `'${css}' is not a colour this module can read. v1 covers #rgb, #rrggbb and opaque rgb()/rgba().`,
    };
  }
  const [r, g, b, alpha] = channels;
  if (alpha < 1) {
    return {
      kind: 'unsupported',
      css,
      reason: 'alpha',
      detail: `'${css}' is not opaque (alpha ${alpha}). Compositing needs the backdrop, which v1 does not resolve; a ratio computed against the colour alone would be right on one background and wrong on every other.`,
    };
  }
  return { kind: 'opaque', css, rgb: [r, g, b] };
}

/* ------------------------------------------------------------------------ *
 * Luminance and ratio
 * ------------------------------------------------------------------------ */

const linear = (value: number): number => {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
};

export const relativeLuminance = (rgb: Rgb | readonly number[]): number =>
  0.2126 * linear(rgb[0] as number) +
  0.7152 * linear(rgb[1] as number) +
  0.0722 * linear(rgb[2] as number);

/** The ratio of two resolved colours. Exact; nothing is rounded here. */
export function contrastRatioOf(one: Rgb, other: Rgb): number {
  const first = relativeLuminance(one);
  const second = relativeLuminance(other);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

export type ContrastResolution =
  | { readonly kind: 'resolved'; readonly ratio: number }
  | {
      readonly kind: 'unresolved';
      readonly side: 'foreground' | 'background';
      readonly reason: UnsupportedColorReason;
      readonly detail: string;
    };

/**
 * Both sides, or a named side that could not be read.
 *
 * The side is part of the answer because "unknown foreground" and "unknown
 * background" are different bugs with different fixes, and a report that says
 * only "indeterminate" sends the reader back to the source to find out which.
 */
export function resolveContrast(
  foreground: string,
  background: string,
): ContrastResolution {
  const fg = parseCssColor(foreground);
  if (fg.kind === 'unsupported') {
    return {
      kind: 'unresolved',
      side: 'foreground',
      reason: fg.reason,
      detail: fg.detail,
    };
  }
  const bg = parseCssColor(background);
  if (bg.kind === 'unsupported') {
    return {
      kind: 'unresolved',
      side: 'background',
      reason: bg.reason,
      detail: bg.detail,
    };
  }
  return { kind: 'resolved', ratio: contrastRatioOf(fg.rgb, bg.rgb) };
}

/**
 * The permissive ratio the layout digest uses.
 *
 * Kept as a separate entry point rather than folded into `resolveContrast`:
 * the digest reads computed styles off a real render, where a colour is always
 * a resolved `rgb()` and the only failure mode is a property nobody read. It
 * has no use for the four reasons, and `undefined` is the whole answer.
 */
export function contrastRatio(
  foreground: string,
  background: string,
): number | undefined {
  const one = parseColorChannels(foreground);
  const other = parseColorChannels(background);
  if (!one || !other) return undefined;
  return contrastRatioOf(
    [one[0], one[1], one[2]],
    [other[0], other[1], other[2]],
  );
}

/* ------------------------------------------------------------------------ *
 * Thresholds
 * ------------------------------------------------------------------------ */

export type TextScale = 'normal' | 'large';

export interface TextMetrics {
  readonly fontSizePx: number;
  readonly fontWeight: number;
}

export interface TextContrastRequirement {
  readonly scale: TextScale;
  readonly required: 3 | 4.5;
}

/**
 * Which threshold this text is judged against.
 *
 * The convention is stated in the plan and repeated here because it is a
 * *convention*, not a derivation: 24px, or 18.5px when the weight reaches
 * bold. It holds for latin faces. A CJK face, or a font whose cap height is
 * far from the norm, is outside v1 — the size in CSS pixels is not the size on
 * screen, and pretending otherwise would put a stamp on text that fails.
 */
export function textContrastRequirement(
  metrics: TextMetrics,
): TextContrastRequirement {
  const large =
    metrics.fontSizePx >= LARGE_TEXT_PX ||
    (metrics.fontSizePx >= LARGE_BOLD_TEXT_PX &&
      metrics.fontWeight >= BOLD_WEIGHT);
  return large
    ? { scale: 'large', required: AA_LARGE_TEXT }
    : { scale: 'normal', required: AA_NORMAL_TEXT };
}

/**
 * The comparison, on the unrounded ratio.
 *
 * A separate function so that no call site can be tempted to compare
 * `Number(ratio.toFixed(2))` — which passes `4.4999` and is the one arithmetic
 * mistake in this file that would never show up as a failing test.
 */
export const meetsContrast = (ratio: number, required: number): boolean =>
  ratio >= required;

/** `3.91` — for the message only. Never fed back into a comparison. */
export const formatRatio = (ratio: number): string =>
  `${(Math.floor(ratio * 100) / 100).toFixed(2)}:1`;

/**
 * Fonts, declared once and consumed as a token.
 *
 * `defineFont('body', {...})` replaces the three things an app used to write by
 * hand in its `styles.css`: the `@import url(fonts.googleapis…)`, the
 * `@font-face` blocks, and the `* { font-family: … !important }` that forced
 * the family onto everything. The build emits the first two — the Google Fonts
 * links go into `<head>` with a `preconnect`, where an `@import` would have
 * blocked the stylesheet on a second round trip — and the third is a normal
 * `fontFamily(font)` on `body` in `craftGlobalStyles`, inherited from there.
 *
 * The token is a `<string>` value (a family stack), so `fontFamily(token)`
 * takes it with no conversion and nothing else does.
 */
import type { CssStringValue } from './tokens/units.ts';

declare const FONT: unique symbol;

export type FontDisplay = 'auto' | 'block' | 'swap' | 'fallback' | 'optional';

export type GenericFamily =
  | 'system-ui'
  | 'ui-sans-serif'
  | 'ui-serif'
  | 'ui-monospace'
  | 'sans-serif'
  | 'serif'
  | 'monospace'
  | 'cursive';

export interface GoogleFontSource {
  readonly kind: 'google';
  readonly weights: readonly number[];
  /** Also load the italic of every weight. */
  readonly italic?: boolean;
}

export interface LocalFontFile {
  /** Served path, e.g. `/fonts/chivo-400.woff2`. */
  readonly url: string;
  /** A weight, or a `[min, max]` range for a variable font. */
  readonly weight?: number | readonly [number, number];
  readonly style?: 'normal' | 'italic';
}

export interface LocalFontSource {
  readonly kind: 'local';
  readonly files: readonly [LocalFontFile, ...LocalFontFile[]];
}

export type FontSource = GoogleFontSource | LocalFontSource;

export const googleFont = (
  options: Omit<GoogleFontSource, 'kind'>,
): GoogleFontSource => ({ kind: 'google', ...options });

export const localFont = (
  options: Omit<LocalFontSource, 'kind'>,
): LocalFontSource => ({ kind: 'local', ...options });

/**
 * Vertical and horizontal metrics, in font units — the numbers a font's
 * `head`, `hhea` and `OS/2` tables carry. Capsize publishes them for every
 * Google font (`@capsizecss/metrics`); copy them rather than guessing.
 */
export interface FontMetrics {
  readonly unitsPerEm: number;
  readonly ascent: number;
  /** Negative, as in the font tables. */
  readonly descent: number;
  readonly lineGap: number;
  /** Average glyph width, weighted by letter frequency. */
  readonly xWidthAvg: number;
}

/** A local font the fallback face is built from, with its metrics. */
export interface FallbackFace {
  readonly local: string;
  readonly metrics: FontMetrics;
}

/** The fallback faces shipped with the vocabulary. */
export const fallbackFaces = {
  arial: {
    local: 'Arial',
    metrics: {
      unitsPerEm: 2048,
      ascent: 1854,
      descent: -434,
      lineGap: 67,
      xWidthAvg: 904,
    },
  },
} as const satisfies Readonly<Record<string, FallbackFace>>;

export interface AdjustFallback {
  /** The metrics of the web font itself. */
  readonly metrics: FontMetrics;
  /** Which local font stands in while it loads. Defaults to Arial. */
  readonly face?: FallbackFace;
}

export interface FontSpec {
  readonly family: string;
  readonly source: FontSource;
  readonly display?: FontDisplay;
  readonly fallback: GenericFamily;
  /**
   * Builds a `<family> Fallback` face from a local font, resized so that it
   * occupies the same space as the web font: the text does not jump when the
   * real font arrives (cumulative layout shift).
   */
  readonly adjustFallback?: AdjustFallback;
}

/** The computed overrides of the fallback face. */
export interface FallbackOverrides {
  readonly family: string;
  readonly local: string;
  readonly sizeAdjust: string;
  readonly ascentOverride: string;
  readonly descentOverride: string;
  readonly lineGapOverride: string;
}

export interface RegisteredFont {
  readonly name: string;
  readonly family: string;
  readonly source: FontSource;
  readonly display: FontDisplay;
  readonly fallback: GenericFamily;
  readonly fallbackFace?: FallbackOverrides;
  /** The family stack `fontFamily(token)` writes. */
  readonly stack: string;
}

export interface FontToken extends CssStringValue {
  readonly font: RegisteredFont;
  readonly [FONT]: true;
}

const fonts = new Map<string, RegisteredFont>();

export const registeredFonts = (): readonly RegisteredFont[] => [
  ...fonts.values(),
];

/** Test-only: the registry is module state, and a spec must be able to reset it. */
export const resetFontRegistry = (): void => fonts.clear();

const percent = (ratio: number): string => `${Math.round(ratio * 1e4) / 100}%`;

/**
 * The fallback face's overrides, computed from both fonts' metrics.
 *
 * `size-adjust` matches the average glyph width, so a line breaks at the same
 * place in both fonts; the three overrides then re-express the web font's
 * vertical metrics in the *adjusted* em, so a line is the same height.
 */
export function fallbackOverrides(
  family: string,
  adjust: AdjustFallback,
): FallbackOverrides {
  const face = adjust.face ?? fallbackFaces.arial;
  const font = adjust.metrics;
  const sizeAdjust =
    font.xWidthAvg /
    font.unitsPerEm /
    (face.metrics.xWidthAvg / face.metrics.unitsPerEm);
  return {
    family: `${family} Fallback`,
    local: face.local,
    sizeAdjust: percent(sizeAdjust),
    ascentOverride: percent(font.ascent / font.unitsPerEm / sizeAdjust),
    descentOverride: percent(
      Math.abs(font.descent) / font.unitsPerEm / sizeAdjust,
    ),
    lineGapOverride: percent(font.lineGap / font.unitsPerEm / sizeAdjust),
  };
}

const FAMILY_NAME = /^[A-Za-z0-9][A-Za-z0-9 _-]*$/;

/**
 * A stack of fonts already installed on the reader's system — nothing to
 * load, so nothing to register.
 *
 * The generated table only knows the `ui-*` generic keywords, which Safari
 * alone resolves; a code excerpt written with `fontFamily.uiMonospace` falls
 * back to a serif everywhere else. The stack ends on a CSS generic family,
 * which is what makes it always resolve to something of the right kind.
 */
export function systemFontStack(
  families: readonly string[],
  generic: GenericFamily | 'monospace',
): CssStringValue {
  for (const family of families) {
    if (!FAMILY_NAME.test(family) && !KEYWORD_FAMILY.test(family)) {
      throw new Error(
        `systemFontStack: '${family}' is not a font family name the emitter can quote safely.`,
      );
    }
  }
  const css = [
    ...families.map((family) =>
      KEYWORD_FAMILY.test(family) ? family : JSON.stringify(family),
    ),
    generic,
  ].join(', ');
  return { css, unproven: '' } as CssStringValue;
}

/**
 * Families written as keywords, never quoted: a quoted `"system-ui"` names a
 * font called system-ui, which does not exist, instead of the system font.
 */
const KEYWORD_FAMILY =
  /^(ui-[a-z]+|system-ui|-apple-system|BlinkMacSystemFont)$/;

/** The monospace stack the vocabulary ships for code excerpts. */
export const monospaceStack = systemFontStack(
  ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas'],
  'monospace',
);

/** The platform's interface font, for UI chrome that must not follow the app's. */
export const systemUiStack = systemFontStack(
  ['system-ui', '-apple-system'],
  'sans-serif',
);

export function defineFont(name: string, spec: FontSpec): FontToken {
  if (fonts.has(name)) {
    throw new Error(
      `defineFont: '${name}' is already declared. One token per role — body, heading, mono — each declared once.`,
    );
  }
  if (!FAMILY_NAME.test(spec.family)) {
    throw new Error(
      `defineFont: '${spec.family}' is not a font family name the emitter can quote safely. Use letters, digits, spaces, dashes and underscores.`,
    );
  }
  if (spec.source.kind === 'google' && spec.source.weights.length === 0) {
    throw new Error(`defineFont: '${name}' loads no weight.`);
  }
  const fallbackFace = spec.adjustFallback
    ? fallbackOverrides(spec.family, spec.adjustFallback)
    : undefined;
  const stack = [
    JSON.stringify(spec.family),
    ...(fallbackFace ? [JSON.stringify(fallbackFace.family)] : []),
    spec.fallback,
  ].join(', ');
  const registered: RegisteredFont = {
    name,
    family: spec.family,
    source: spec.source,
    display: spec.display ?? 'swap',
    fallback: spec.fallback,
    stack,
    ...(fallbackFace ? { fallbackFace } : {}),
  };
  fonts.set(name, registered);
  return { css: stack, unproven: '', font: registered } as FontToken;
}

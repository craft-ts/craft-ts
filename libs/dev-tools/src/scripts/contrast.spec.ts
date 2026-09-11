/**
 * The arithmetic, measured rather than asserted in a comment.
 *
 * Two of the cases below exist because they are the ones a plausible
 * implementation gets wrong while staying green everywhere else: a ratio
 * rounded before the comparison (`4.4999` reads as `4.50` and passes), and a
 * semi-transparent colour composited against an assumed white page (right on
 * one background, wrong on every other). Both are checked directly.
 */
import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  contrastRatioOf,
  formatRatio,
  meetsContrast,
  parseColorChannels,
  parseCssColor,
  relativeLuminance,
  resolveContrast,
  textContrastRequirement,
} from './contrast.ts';

describe('reading a colour', () => {
  it('expands the short hexadecimal form', () => {
    expect(parseCssColor('#fff')).toEqual({
      kind: 'opaque',
      css: '#fff',
      rgb: [255, 255, 255],
    });
    expect(parseCssColor('#0B0D11')).toEqual({
      kind: 'opaque',
      css: '#0B0D11',
      rgb: [11, 13, 17],
    });
  });

  it('reads rgb() in both spellings, comma and space', () => {
    expect(parseCssColor('rgb(17, 34, 51)')).toMatchObject({
      kind: 'opaque',
      rgb: [17, 34, 51],
    });
    expect(parseCssColor('rgb(17 34 51 / 1)')).toMatchObject({
      kind: 'opaque',
      rgb: [17, 34, 51],
    });
    expect(parseCssColor('rgba(17, 34, 51, 1)')).toMatchObject({
      kind: 'opaque',
      rgb: [17, 34, 51],
    });
  });

  it('refuses a colour it cannot prove, and says which kind of refusal', () => {
    // Four distinct reasons, because they are four distinct bugs upstream.
    expect(parseCssColor('rgba(0, 0, 0, 0.5)')).toMatchObject({
      kind: 'unsupported',
      reason: 'alpha',
    });
    expect(parseCssColor('var(--ds-ink)')).toMatchObject({
      kind: 'unsupported',
      reason: 'unresolved-var',
    });
    expect(parseCssColor('color-mix(in srgb, #fff, #000)')).toMatchObject({
      kind: 'unsupported',
      reason: 'non-literal-function',
    });
    expect(parseCssColor('currentColor')).toMatchObject({
      kind: 'unsupported',
      reason: 'not-a-colour',
    });
  });

  it('never composites a semi-transparent colour onto an assumed page', () => {
    // `rgba(0,0,0,.5)` over white is #808080 and over black is #000000. Any
    // single ratio for it is a claim about a backdrop nobody resolved.
    const resolution = resolveContrast('rgba(0, 0, 0, 0.5)', '#ffffff');
    expect(resolution).toMatchObject({ kind: 'unresolved', side: 'foreground' });
  });

  it('keeps the permissive channel reader for the render digest', () => {
    // The digest reads computed styles, where alpha is real information and
    // `transparent` is the answer to "does this node paint".
    expect(parseColorChannels('transparent')).toEqual([0, 0, 0, 0]);
    expect(parseColorChannels('rgba(1, 2, 3, 0.25)')).toEqual([1, 2, 3, 0.25]);
    expect(parseColorChannels('not-a-colour')).toBeUndefined();
  });
});

describe('the ratio', () => {
  it('gives black on white exactly 21:1', () => {
    expect(contrastRatioOf([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 10);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10);
  });

  it('is symmetric — the lighter side is found, not assumed', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 10);
  });

  it('gives a colour against itself exactly 1:1', () => {
    expect(contrastRatioOf([90, 90, 90], [90, 90, 90])).toBeCloseTo(1, 12);
  });

  it('weights the channels the way the formula does', () => {
    // Green carries 0.7152 of the luminance and blue 0.0722: pure green is
    // far brighter than pure blue, which no eyeballed constant would produce.
    expect(relativeLuminance([0, 255, 0])).toBeGreaterThan(
      relativeLuminance([0, 0, 255]),
    );
  });

  it('names the side that could not be read', () => {
    expect(resolveContrast('#fff', 'linear-gradient(#000, #333)')).toMatchObject(
      { kind: 'unresolved', side: 'background', reason: 'non-literal-function' },
    );
  });
});

describe('the threshold', () => {
  it('asks 4.5:1 of normal text and 3:1 of large text', () => {
    expect(textContrastRequirement({ fontSizePx: 14, fontWeight: 400 })).toEqual(
      { scale: 'normal', required: 4.5 },
    );
    expect(textContrastRequirement({ fontSizePx: 24, fontWeight: 400 })).toEqual(
      { scale: 'large', required: 3 },
    );
  });

  it('lets bold reach the large threshold at 18.5px', () => {
    expect(
      textContrastRequirement({ fontSizePx: 18.5, fontWeight: 700 }),
    ).toEqual({ scale: 'large', required: 3 });
  });

  it('keeps semibold at 18.5px on the normal threshold', () => {
    // WCAG says "bold" without a number; CSS says bold is 700. Reading 600 as
    // bold would lower a threshold on an ambiguity, which is the wrong side.
    expect(
      textContrastRequirement({ fontSizePx: 18.5, fontWeight: 600 }),
    ).toEqual({ scale: 'normal', required: 4.5 });
  });

  it('does not round before comparing', () => {
    // 4.4999 displays as 4.50 and is not 4.5. A comparison on the formatted
    // number passes this pair, and no other test in the suite would notice.
    expect(meetsContrast(4.4999, 4.5)).toBe(false);
    expect(meetsContrast(4.5, 4.5)).toBe(true);
    expect(formatRatio(4.4999)).toBe('4.49:1');
  });
});

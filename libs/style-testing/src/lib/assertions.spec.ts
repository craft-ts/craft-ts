import { describe, expect, it } from 'vitest';
import {
  assertNoLayoutViolations,
  contrastRatio,
  findSmallTargets,
  findViolations,
  parseColor,
} from './assertions.ts';
import { layoutDigest, STYLE_KEYS, type MeasuredElement } from './digest.ts';

const blank = Object.fromEntries(STYLE_KEYS.map((key) => [key, '']));

const element = (
  overrides: Partial<MeasuredElement> & Pick<MeasuredElement, 'path'>,
): MeasuredElement => ({
  rect: { x: 0, y: 0, width: 100, height: 20 },
  styles: blank,
  scroll: { width: 100, height: 20, clientWidth: 100, clientHeight: 20 },
  zOrder: 0,
  ...overrides,
});

describe('colour', () => {
  it('reads the notations a computed style produces', () => {
    expect(parseColor('rgb(255, 255, 255)')).toEqual([255, 255, 255, 1]);
    expect(parseColor('rgba(0, 0, 0, 0.5)')).toEqual([0, 0, 0, 0.5]);
    expect(parseColor('#fff')).toEqual([255, 255, 255, 1]);
    expect(parseColor('transparent')).toEqual([0, 0, 0, 0]);
    expect(parseColor('somewhere between')).toBeUndefined();
  });

  it('computes the WCAG ratio', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#777', '#fff')).toBeCloseTo(4.48, 1);
  });
});

describe('findViolations', () => {
  it('names the node and the pixels when a title overflows', () => {
    const digest = layoutDigest([
      element({
        path: 'userCard/title',
        text: {
          content: 'Benutzerkontoeinstellungen',
          lines: 1,
          clipped: 34,
        },
        scroll: { width: 134, height: 20, clientWidth: 100, clientHeight: 20 },
      }),
    ]);
    const violations = findViolations(digest);
    expect(violations.map((violation) => violation.rule).sort()).toEqual([
      'overflow-inline',
      'text-clipped',
    ]);
    expect(violations[0]?.message).toContain('userCard/title');
    expect(violations[0]?.message).toContain('34px');
  });

  it('measures contrast against the nearest painted ancestor', () => {
    // A label almost never paints its own background; comparing against
    // `rgba(0,0,0,0)` would report every piece of text in the app.
    const digest = layoutDigest([
      element({
        path: 'card',
        styles: { ...blank, 'background-color': '#ffffff' },
      }),
      element({
        path: 'card/label',
        parent: 'card',
        styles: { ...blank, color: '#bbbbbb', 'background-color': 'transparent' },
        text: { content: 'Subtle', lines: 1, clipped: 0 },
      }),
    ]);
    const contrast = findViolations(digest).filter(
      (violation) => violation.rule === 'contrast',
    );
    expect(contrast).toHaveLength(1);
    expect(contrast[0]?.message).toContain('below 4.5:1');
  });

  it('says nothing about text that clears the ratio', () => {
    const digest = layoutDigest([
      element({ path: 'card', styles: { ...blank, 'background-color': '#ffffff' } }),
      element({
        path: 'card/label',
        parent: 'card',
        styles: { ...blank, color: '#111111' },
        text: { content: 'Readable', lines: 1, clipped: 0 },
      }),
    ]);
    expect(findViolations(digest)).toEqual([]);
  });

  it('honours an ignore list, per rule', () => {
    const digest = layoutDigest([
      element({
        path: 'marquee',
        scroll: { width: 400, height: 20, clientWidth: 100, clientHeight: 20 },
      }),
    ]);
    expect(findViolations(digest)).toHaveLength(1);
    expect(
      findViolations(digest, { ignore: { 'overflow-inline': ['marquee'] } }),
    ).toEqual([]);
  });
});

describe('findSmallTargets', () => {
  it('checks only the elements the caller says are interactive', () => {
    const digest = layoutDigest([
      element({ path: 'icon', rect: { x: 0, y: 0, width: 16, height: 16 } }),
      element({ path: 'decoration', rect: { x: 0, y: 0, width: 8, height: 8 } }),
    ]);
    const small = findSmallTargets(digest, ['icon']);
    expect(small).toHaveLength(1);
    expect(small[0]?.message).toContain('16×16px');
    expect(small[0]?.amount).toBe(8);
  });
});

describe('assertNoLayoutViolations', () => {
  it('fails with the node and the number, not with "the layout is broken"', () => {
    const digest = layoutDigest([
      element({
        path: 'userCard/title',
        text: { content: 'Benutzerkontoeinstellungen', lines: 1, clipped: 34 },
        scroll: { width: 134, height: 20, clientWidth: 100, clientHeight: 20 },
      }),
    ]);
    expect(() => assertNoLayoutViolations(digest, { scenario: 'locale=de' })).toThrow(
      /userCard\/title hides 34px/,
    );
    expect(() => assertNoLayoutViolations(digest, { scenario: 'locale=de' })).toThrow(
      /locale=de/,
    );
  });

  it('passes silently on a clean digest', () => {
    expect(() => assertNoLayoutViolations(layoutDigest([element({ path: 'a' })]))).not.toThrow();
  });
});

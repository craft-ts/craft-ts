import { describe, expect, it } from 'vitest';
import {
  carriesForward,
  deltaShape,
  digestDelta,
  formatDelta,
  half,
  layoutDigest,
  STYLE_KEYS,
  type MeasuredElement,
  type StyleKey,
} from './digest.ts';

const element = (
  overrides: Partial<MeasuredElement> & Pick<MeasuredElement, 'path'>,
): MeasuredElement => ({
  rect: { x: 0, y: 0, width: 100, height: 20 },
  styles: Object.fromEntries(STYLE_KEYS.map((key) => [key, ''])),
  scroll: { width: 100, height: 20, clientWidth: 100, clientHeight: 20 },
  zOrder: 0,
  ...overrides,
});

describe('rounding', () => {
  it('keeps the half pixel and nothing below it', () => {
    expect(half(12.24)).toBe(12);
    expect(half(12.26)).toBe(12.5);
    expect(half(12.76)).toBe(13);
  });

  it('does not let sub-pixel jitter into a digest', () => {
    const one = layoutDigest([element({ path: 'a', rect: { x: 0, y: 0, width: 100.02, height: 20 } })]);
    const other = layoutDigest([element({ path: 'a', rect: { x: 0, y: 0, width: 99.99, height: 20 } })]);
    expect(one.nodes[0]?.box).toEqual(other.nodes[0]?.box);
  });
});

describe('signature', () => {
  it('records the discrete facts, not the boxes', () => {
    const digest = layoutDigest([
      element({
        path: 'root',
        columns: 3,
        styles: { ...element({ path: 'x' }).styles, display: 'grid' },
        childRows: [0, 0, 40],
      }),
      element({
        path: 'root/title',
        parent: 'root',
        text: { content: 'Benutzerkonto', lines: 2, clipped: 12 },
      }),
      element({
        path: 'root/scroller',
        parent: 'root',
        styles: { ...element({ path: 'x' }).styles, overflow: 'auto' },
        scroll: { width: 400, height: 20, clientWidth: 100, clientHeight: 20 },
        rect: { x: 0, y: 40, width: 100, height: 20 },
      }),
    ]);

    expect(digest.signature.columns).toEqual({ root: 3 });
    expect(digest.signature.lines).toEqual({ 'root/title': 2 });
    expect(digest.signature.clipped).toEqual(['root/title']);
    expect(digest.signature.scrollbars).toEqual(['root/scroller']);
    // Children landing on two different rows is a wrap, and a wrap is a
    // threshold — the only kind of fact worth bisecting for.
    expect(digest.signature.wrapped).toEqual(['root']);
  });

  it('reports two siblings on one layer whose boxes intersect', () => {
    const digest = layoutDigest([
      element({ path: 'root' }),
      element({ path: 'root/a', parent: 'root', rect: { x: 0, y: 0, width: 60, height: 20 } }),
      element({ path: 'root/b', parent: 'root', rect: { x: 50, y: 0, width: 60, height: 20 } }),
    ]);
    expect(digest.signature.overlaps).toEqual([['root/a', 'root/b']]);
  });

  it('leaves a declared overlap alone', () => {
    const digest = layoutDigest(
      [
        element({ path: 'root' }),
        element({ path: 'root/anchor', parent: 'root', rect: { x: 0, y: 0, width: 60, height: 20 } }),
        element({ path: 'root/tooltip', parent: 'root', rect: { x: 50, y: 0, width: 60, height: 20 } }),
      ],
      { allowOverlap: ['root/tooltip'] },
    );
    expect(digest.signature.overlaps).toEqual([]);
  });

  it('does not report two boxes on different branches as overlapping', () => {
    // Layered layouts overlap across branches constantly; reporting it would
    // bury the one case that matters.
    const digest = layoutDigest([
      element({ path: 'left/a', parent: 'left', rect: { x: 0, y: 0, width: 60, height: 20 } }),
      element({ path: 'right/b', parent: 'right', rect: { x: 50, y: 0, width: 60, height: 20 } }),
    ]);
    expect(digest.signature.overlaps).toEqual([]);
  });
});

describe('digestDelta', () => {
  const before = layoutDigest([
    element({
      path: 'card',
      styles: { ...element({ path: 'x' }).styles, 'border-radius': '4px' },
    }),
  ]);
  const after = layoutDigest([
    element({
      path: 'card',
      styles: { ...element({ path: 'x' }).styles, 'border-radius': '8px' },
      rect: { x: 0, y: 0, width: 120, height: 20 },
    }),
  ]);

  it('reads as a sentence', () => {
    expect(digestDelta(before, after).map(formatDelta)).toEqual([
      'card border-radius 4px→8px',
      'card width 100→120',
    ]);
  });

  it('reports a node that appeared or disappeared', () => {
    const bigger = layoutDigest([element({ path: 'card' }), element({ path: 'badge' })]);
    expect(digestDelta(before, bigger).map(formatDelta)).toContain(
      'badge node absent→present',
    );
    expect(digestDelta(bigger, before).map(formatDelta)).toContain(
      'badge node present→absent',
    );
  });

  it('gives two scenarios with the same change the same shape', () => {
    const otherPath = layoutDigest([
      element({
        path: 'panel',
        styles: { ...element({ path: 'x' }).styles, 'border-radius': '4px' },
      }),
    ]);
    const otherPathAfter = layoutDigest([
      element({
        path: 'panel',
        styles: { ...element({ path: 'x' }).styles, 'border-radius': '8px' },
      }),
    ]);
    // Same decision, different element: one answer covers both.
    expect(deltaShape(digestDelta(otherPath, otherPathAfter))).toBe(
      'border-radius 4px→8px',
    );
  });
});

describe('version migration', () => {
  it('carries forward a digest that only differs by a newly recorded field', () => {
    const v1 = layoutDigest([
      element({
        path: 'card',
        styles: Object.fromEntries(
          STYLE_KEYS.filter((key) => key !== 'letter-spacing').map((key) => [key, '']),
        ),
      }),
    ]);
    const v2 = layoutDigest([
      element({
        path: 'card',
        styles: { ...element({ path: 'x' }).styles, 'letter-spacing': 'normal' },
      }),
    ]);
    // Without this rule the closed list is a decision nobody can revisit, and
    // widening it would send every attestation in the repository to a human.
    expect(carriesForward(v1, v2, ['letter-spacing' as StyleKey])).toBe(true);
  });

  it('does not carry forward a change to a field that already existed', () => {
    const v1 = layoutDigest([element({ path: 'card' })]);
    const v2 = layoutDigest([
      element({ path: 'card', rect: { x: 0, y: 0, width: 200, height: 20 } }),
    ]);
    expect(carriesForward(v1, v2, ['letter-spacing' as StyleKey])).toBe(false);
  });
});

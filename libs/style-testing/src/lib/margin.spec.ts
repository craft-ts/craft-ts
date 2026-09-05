import { describe, expect, it } from 'vitest';
import { assertMargins, checkMargins, costOf, marginOf } from './margin.ts';
import { findTransitions } from './transitions.ts';
import type { LayoutSignature } from './digest.ts';

const search = {
  axis: 'userCard/title',
  range: [0, 100] as const,
  samples: 12,
  transitions: [
    { before: 33, at: 34, change: 'userCard/title: 1 → 2 lines' },
    { before: 71, at: 72, change: 'userCard/title: 2 → 3 lines' },
  ],
};

describe('marginOf', () => {
  it('measures to the nearest transition above the current content', () => {
    const margin = marginOf(search, 33);
    expect(margin.transition?.at).toBe(34);
    expect(margin.headroom).toBe(1);
  });

  it('ignores a transition already crossed', () => {
    // A layout that is *already* wrapping has no margin to the wrap; counting
    // it would report comfort where there is none.
    const margin = marginOf(search, 40);
    expect(margin.transition?.at).toBe(72);
    expect(margin.headroom).toBe(32);
  });

  it('reports no transition when nothing in range breaks it', () => {
    const margin = marginOf(search, 90);
    expect(margin.transition).toBeUndefined();
    expect(margin.headroom).toBeUndefined();
  });
});

describe('checkMargins', () => {
  it('fails the German string that is one character from wrapping', () => {
    const violations = checkMargins([marginOf(search, 33)]);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain('Margin 1');
    expect(violations[0]?.message).toContain('1 → 2 lines');
  });

  it('passes a string with room to grow', () => {
    expect(checkMargins([marginOf(search, 20)])).toEqual([]);
  });

  it('says nothing about an axis with no transition above it', () => {
    expect(checkMargins([marginOf(search, 90)])).toEqual([]);
  });

  it('takes whichever of the two budgets is stricter', () => {
    const wide = {
      ...search,
      transitions: [{ before: 199, at: 200, change: 'wraps' }],
    };
    // 10 of 200 clears the absolute floor and fails the ratio.
    expect(checkMargins([marginOf(wide, 190)])).toHaveLength(1);
    expect(checkMargins([marginOf(wide, 190)], { minimumRatio: 0.01 })).toEqual([]);
  });
});

describe('assertMargins', () => {
  it('says what will break, not what did', () => {
    expect(() => assertMargins([marginOf(search, 33)])).toThrow(
      /Nothing is broken yet/,
    );
  });
});

describe('costOf', () => {
  it('records what one bisection cost, since wave 3 multiplies it', async () => {
    const signature = (lines: number): LayoutSignature => ({
      columns: {},
      lines: { title: lines },
      wrapped: [],
      clipped: [],
      scrollbars: [],
      overlaps: [],
    });
    const measured = await findTransitions(
      (value) => signature(value >= 34 ? 2 : 1),
      { axis: 'title', min: 0, max: 100 },
    );
    const cost = costOf(measured, 4200);
    expect(cost.samples).toBe(measured.samples);
    expect(cost.perTransition).toBe(measured.samples);
    expect(cost.milliseconds).toBe(4200);
  });
});

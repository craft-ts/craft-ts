import { describe, expect, it } from 'vitest';
import {
  findTransitions,
  magnitudeGrid,
  samplingAssumption,
  signatureKey,
  wordBoundaries,
} from './transitions.ts';
import type { LayoutSignature } from './digest.ts';

const signature = (lines: number, extra: Partial<LayoutSignature> = {}): LayoutSignature => ({
  columns: {},
  lines: { title: lines },
  wrapped: [],
  clipped: [],
  scrollbars: [],
  overlaps: [],
  ...extra,
});

describe('signatureKey', () => {
  it('does not depend on the order the collector filled its records', () => {
    expect(
      signatureKey({
        columns: { b: 1, a: 2 },
        lines: {},
        wrapped: ['z', 'a'],
        clipped: [],
        scrollbars: [],
        overlaps: [],
      }),
    ).toBe(
      signatureKey({
        columns: { a: 2, b: 1 },
        lines: {},
        wrapped: ['a', 'z'],
        clipped: [],
        scrollbars: [],
        overlaps: [],
      }),
    );
  });
});

describe('findTransitions', () => {
  it('finds the exact character count at which a title takes a second line', async () => {
    const render = (value: number) => signature(value >= 34 ? 2 : 1);
    const search = await findTransitions(render, {
      axis: 'title',
      min: 0,
      max: 100,
    });

    expect(search.transitions).toHaveLength(1);
    expect(search.transitions[0]).toMatchObject({ before: 33, at: 34 });
    expect(search.transitions[0]?.change).toBe('title: 1 → 2 lines');
  });

  it('costs a fraction of a sweep over the same range', async () => {
    const render = (value: number) => signature(value >= 340 ? 2 : 1);
    const search = await findTransitions(render, {
      axis: 'title',
      min: 0,
      max: 1000,
    });
    // The point of the coarse-then-bisect pass: a fine sweep of this range is
    // a thousand renders, and wave 3 multiplies whatever this number is by the
    // breakpoints and the neighbourhoods.
    expect(search.samples).toBeLessThan(25);
    expect(search.transitions[0]?.at).toBe(340);
  });

  it('finds several thresholds along one axis', async () => {
    const render = (value: number) =>
      signature(value >= 60 ? 3 : value >= 30 ? 2 : 1);
    const search = await findTransitions(render, {
      axis: 'title',
      min: 0,
      max: 100,
      gridSize: 10,
    });
    expect(search.transitions.map((transition) => transition.at)).toEqual([30, 60]);
  });

  it('finds nothing when the signature never moves', async () => {
    const search = await findTransitions(() => signature(1), {
      axis: 'title',
      min: 0,
      max: 100,
    });
    expect(search.transitions).toEqual([]);
  });

  it('reads a wrap, a clip and a scrollbar in words', async () => {
    const render = (value: number) =>
      value >= 50
        ? signature(1, { clipped: ['title'], scrollbars: ['row'] })
        : signature(1);
    const search = await findTransitions(render, {
      axis: 'title',
      min: 0,
      max: 100,
    });
    expect(search.transitions[0]?.change).toBe(
      'title starts clipping, row starts scrolling',
    );
  });

  it('misses a threshold that falls entirely between two coarse samples', async () => {
    // Stated rather than hidden: the bisection finds the transitions that exist
    // between the points it looked at, which is exactly why the sample count
    // goes into the attestation's assumptions.
    const render = (value: number) => signature(value === 50 ? 2 : 1);
    const search = await findTransitions(render, {
      axis: 'title',
      min: 0,
      max: 100,
      grid: [0, 100],
    });
    expect(search.transitions).toEqual([]);
  });
});

describe('grids', () => {
  it('puts a sample either side of every digit-count change', () => {
    expect(magnitudeGrid(0, 10_000)).toEqual([
      0, 1, 9, 10, 99, 100, 999, 1000, 9999, 10_000,
    ]);
  });

  it('puts a sample at every word boundary of a string', () => {
    expect(wordBoundaries('one two three')).toEqual([3, 7, 13]);
  });
});

describe('samplingAssumption', () => {
  it('records what the search actually looked at', async () => {
    const search = await findTransitions((value) => signature(value >= 34 ? 2 : 1), {
      axis: 'title',
      min: 0,
      max: 100,
    });
    const assumption = samplingAssumption(search);
    expect(assumption.kind).toBe('sampling');
    expect(assumption.axis).toBe('title');
    expect(assumption.transitions).toEqual([34]);
    expect(assumption.samples).toBe(search.samples);
  });
});

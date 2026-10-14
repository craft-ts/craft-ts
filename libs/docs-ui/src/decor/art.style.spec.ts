import { describe, expect, it } from 'vitest';
import { CONTOURS, contourMask, simplifyContour, simplifyPolyline } from './art.style.ts';

const pointsOf = (path: string): [number, number][] =>
  [...path.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])]);

describe('simplifyPolyline', () => {
  it('drops the points a straight line stands for, and keeps the ends and the corners', () => {
    const line = [[0, 0], [1, 0.05], [2, -0.05], [3, 0], [3, 3]] as const;
    expect(simplifyPolyline(line, 0.2)).toEqual([[0, 0], [3, 0], [3, 3]]);
  });

  it('leaves two points, and a curve that deviates more than the tolerance, alone', () => {
    expect(simplifyPolyline([[0, 0], [5, 5]], 1)).toEqual([[0, 0], [5, 5]]);
    const arc = [[0, 0], [1, 0.9], [2, 1.2], [3, 0.9], [4, 0]] as const;
    expect(simplifyPolyline(arc, 0.1)).toEqual(arc);
  });
});

describe('simplifyContour', () => {
  it('keeps the shape of a path: its ends, its closing, and every point within the tolerance', () => {
    const original = 'M10.0 10.0 L11.0 10.1 L12.0 9.9 L13.0 10.0 L20.0 20.0 L30.5 20.5Z';
    const simplified = simplifyContour(original, 0.3);
    expect(simplified).toBe('M10 10 L13 10 L20 20 L30.5 20.5Z');
    expect(pointsOf(simplified)[0]).toEqual(pointsOf(original)[0]);
    expect(pointsOf(simplified).at(-1)).toEqual(pointsOf(original).at(-1));
  });

  it('leaves a path with no points as it is', () => {
    expect(simplifyContour('')).toBe('');
  });
});

describe('the contours of the hero', () => {
  it('lose points but none of their lines', () => {
    for (const set of ['strong', 'soft'] as const) {
      const mask = decodeURIComponent(contourMask(set));
      const drawn = mask.match(/<path d="[^"]+"/g) ?? [];
      expect(drawn).toHaveLength(CONTOURS[set].length);
      const before = CONTOURS[set].reduce((sum, d) => sum + pointsOf(d).length, 0);
      const after = drawn.reduce((sum, d) => sum + pointsOf(d).length, 0);
      expect(after).toBeLessThan(before);
      expect(after).toBeGreaterThan(before * 0.5);
    }
  });
});

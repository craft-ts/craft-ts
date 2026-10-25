import { describe, expect, it } from 'vitest';
import { lcsPairs } from './diff.js';

function lcsLength(left: readonly string[], right: readonly string[]): number {
  const table = Array.from({ length: left.length + 1 }, () => new Array<number>(right.length + 1).fill(0));
  for (let i = left.length - 1; i >= 0; i -= 1) for (let j = right.length - 1; j >= 0; j -= 1)
    table[i]![j] = left[i] === right[j] ? 1 + table[i + 1]![j + 1]! : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  return table[0]![0]!;
}

function random(seed: number) {
  let state = seed;
  return () => { state = (state * 1_103_515_245 + 12_345) % 2_147_483_648; return state / 2_147_483_648; };
}

describe('lcsPairs', () => {
  it('returns increasing matched pairs of a longest common subsequence', () => {
    const next = random(7);
    for (let round = 0; round < 400; round += 1) {
      const alphabet = 1 + Math.floor(next() * 5);
      const left = Array.from({ length: Math.floor(next() * 14) }, () => String(Math.floor(next() * alphabet)));
      const right = Array.from({ length: Math.floor(next() * 14) }, () => String(Math.floor(next() * alphabet)));
      const pairs = lcsPairs(left, right);
      expect(pairs).toHaveLength(lcsLength(left, right));
      for (const [index, [i, j]] of pairs.entries()) {
        expect(left[i]).toBe(right[j]);
        if (index > 0) { expect(i).toBeGreaterThan(pairs[index - 1]![0]); expect(j).toBeGreaterThan(pairs[index - 1]![1]); }
      }
    }
  });

  it('handles empty and disjoint lists', () => {
    expect(lcsPairs([], ['a'])).toEqual([]);
    expect(lcsPairs(['a', 'b'], ['c', 'd'])).toEqual([]);
    expect(lcsPairs(['a'], ['a'])).toEqual([[0, 0]]);
  });
});

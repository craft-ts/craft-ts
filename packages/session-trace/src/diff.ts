/**
 * Matched index pairs of a longest common subsequence of two key lists.
 *
 * Myers' O((N+M)·D) diff with the linear-space bisection (middle snake): the
 * memory stays proportional to N+M, and traces that look alike (small D) are
 * aligned almost in linear time. The structure follows diff-match-patch's
 * `diff_bisect`, which skips diagonals that leave the grid.
 */
export function lcsPairs(left: readonly string[], right: readonly string[]): Array<[number, number]> {
  const ids = new Map<string, number>();
  const id = (key: string) => { let value = ids.get(key); if (value === undefined) { value = ids.size; ids.set(key, value); } return value; };
  const a = Int32Array.from(left, id);
  const b = Int32Array.from(right, id);
  const pairs: Array<[number, number]> = [];
  align(a, b, 0, a.length, 0, b.length, pairs);
  return pairs;
}

function align(a: Int32Array, b: Int32Array, aStart: number, aEnd: number, bStart: number, bEnd: number, pairs: Array<[number, number]>): void {
  while (aStart < aEnd && bStart < bEnd && a[aStart] === b[bStart]) { pairs.push([aStart, bStart]); aStart += 1; bStart += 1; }
  const suffix: Array<[number, number]> = [];
  while (aStart < aEnd && bStart < bEnd && a[aEnd - 1] === b[bEnd - 1]) { aEnd -= 1; bEnd -= 1; suffix.push([aEnd, bEnd]); }
  if (aStart < aEnd && bStart < bEnd) {
    const split = bisect(a, b, aStart, aEnd, bStart, bEnd);
    if (split) {
      align(a, b, aStart, split[0], bStart, split[1], pairs);
      align(a, b, split[0], aEnd, split[1], bEnd, pairs);
    }
  }
  for (let index = suffix.length - 1; index >= 0; index -= 1) pairs.push(suffix[index]!);
}

/** Point where a shortest edit path crosses the middle; undefined when nothing is shared. */
function bisect(a: Int32Array, b: Int32Array, aStart: number, aEnd: number, bStart: number, bEnd: number): [number, number] | undefined {
  const n = aEnd - aStart, m = bEnd - bStart;
  const maxD = Math.ceil((n + m) / 2);
  const offset = maxD;
  const length = 2 * maxD + 2;
  const forward = new Int32Array(length).fill(-1);
  const backward = new Int32Array(length).fill(-1);
  forward[offset + 1] = 0; backward[offset + 1] = 0;
  const delta = n - m;
  const front = delta % 2 !== 0;
  let k1Start = 0, k1End = 0, k2Start = 0, k2End = 0;
  for (let d = 0; d < maxD; d += 1) {
    for (let k1 = -d + k1Start; k1 <= d - k1End; k1 += 2) {
      const k1Offset = offset + k1;
      let x1 = k1 === -d || (k1 !== d && forward[k1Offset - 1]! < forward[k1Offset + 1]!) ? forward[k1Offset + 1]! : forward[k1Offset - 1]! + 1;
      let y1 = x1 - k1;
      while (x1 < n && y1 < m && a[aStart + x1] === b[bStart + y1]) { x1 += 1; y1 += 1; }
      forward[k1Offset] = x1;
      if (x1 > n) k1End += 2;
      else if (y1 > m) k1Start += 2;
      else if (front) {
        const k2Offset = offset + delta - k1;
        if (k2Offset >= 0 && k2Offset < length && backward[k2Offset] !== -1 && x1 >= n - backward[k2Offset]!) return [aStart + x1, bStart + y1];
      }
    }
    for (let k2 = -d + k2Start; k2 <= d - k2End; k2 += 2) {
      const k2Offset = offset + k2;
      let x2 = k2 === -d || (k2 !== d && backward[k2Offset - 1]! < backward[k2Offset + 1]!) ? backward[k2Offset + 1]! : backward[k2Offset - 1]! + 1;
      let y2 = x2 - k2;
      while (x2 < n && y2 < m && a[aEnd - 1 - x2] === b[bEnd - 1 - y2]) { x2 += 1; y2 += 1; }
      backward[k2Offset] = x2;
      if (x2 > n) k2End += 2;
      else if (y2 > m) k2Start += 2;
      else if (!front) {
        const k1Offset = offset + delta - k2;
        if (k1Offset >= 0 && k1Offset < length && forward[k1Offset] !== -1) {
          const x1 = forward[k1Offset]!;
          const y1 = offset + x1 - k1Offset;
          if (x1 >= n - x2) return [aStart + x1, bStart + y1];
        }
      }
    }
  }
  return undefined;
}

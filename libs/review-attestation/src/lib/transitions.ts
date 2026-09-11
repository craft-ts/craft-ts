/**
 * Finding where a layout tips over.
 *
 * A content axis is continuous — a title is 12 or 34 or 200 characters — and a
 * layout does not care about most of that range. What it has are **thresholds**:
 * the character count at which a title takes a second line, the order of
 * magnitude at which a price stops fitting its column. Between two thresholds
 * every value renders the same, so testing one arbitrary string tells you
 * nothing about the ones either side of it.
 *
 * So: a coarse grid first, then bisection only inside the intervals where the
 * **discrete** signature actually moved. Watching the signature rather than the
 * boxes is the whole trick — boxes move continuously and would report a
 * transition at every sample.
 *
 * Every sample is counted, and the count goes into the attestation's
 * assumptions. A bisection is not exactly true: it finds the transitions that
 * exist between the points it looked at, and an attestation that hid that would
 * be claiming a coverage it does not have.
 */
import type { LayoutSignature } from './digest.js';

/** What the bisection compares. Two runs agree when this string is equal. */
export function signatureKey(signature: LayoutSignature): string {
  return JSON.stringify([
    Object.entries(signature.columns).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
    Object.entries(signature.lines).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
    [...signature.wrapped].sort(),
    [...signature.clipped].sort(),
    [...signature.scrollbars].sort(),
    [...signature.overlaps].map((pair) => [...pair]).sort(),
  ]);
}

export interface Transition {
  /** Last value that still renders like the one below it. */
  readonly before: number;
  /** First value that renders differently. */
  readonly at: number;
  /** What changed, as a one-line reading of the signature. */
  readonly change: string;
}

export interface TransitionSearch {
  readonly axis: string;
  readonly transitions: readonly Transition[];
  /** Total renders. This is the number that decides whether wave 3 opens. */
  readonly samples: number;
  readonly range: readonly [number, number];
}

export interface SearchOptions {
  readonly axis: string;
  readonly min: number;
  readonly max: number;
  /**
   * The coarse pass.
   *
   * Not a uniform sweep: word boundaries and digit-count changes are where a
   * layout actually tips, and a uniform grid spends most of its samples in the
   * middle of intervals where nothing happens.
   */
  readonly grid?: readonly number[];
  /** Coarse samples when no grid is given. Eight to sixteen is the useful band. */
  readonly gridSize?: number;
  /** Stop bisecting once the interval is this wide. */
  readonly precision?: number;
}

const defaultGrid = (min: number, max: number, size: number): number[] => {
  const points = new Set<number>([min, max]);
  for (let index = 1; index < size; index += 1) {
    points.add(Math.round(min + ((max - min) * index) / size));
  }
  return [...points].sort((left, right) => left - right);
};

/**
 * Digit-count boundaries inside a range.
 *
 * `999 → 1000` is where a number column breaks, and a uniform grid walks past
 * it nine times out of ten.
 */
export function magnitudeGrid(min: number, max: number): readonly number[] {
  const points = new Set<number>([min, max]);
  for (let power = 1; power <= 1e15; power *= 10) {
    if (power - 1 >= min && power - 1 <= max) points.add(power - 1);
    if (power >= min && power <= max) points.add(power);
  }
  return [...points].sort((left, right) => left - right);
}

/**
 * Word boundaries of a string, as character counts.
 *
 * A title breaks to a second line at a space, not at an arbitrary character, so
 * these are the only counts where the signature can change.
 */
export function wordBoundaries(text: string): readonly number[] {
  const boundaries: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === ' ') boundaries.push(index);
  }
  boundaries.push(text.length);
  return boundaries;
}

/**
 * Searches one axis for the values at which the signature changes.
 *
 * `render` is given a value and returns the signature at that value; it is the
 * only thing here that touches a browser, which is what makes this file a unit
 * test rather than an end-to-end one.
 */
export async function findTransitions(
  render: (value: number) => Promise<LayoutSignature> | LayoutSignature,
  options: SearchOptions,
): Promise<TransitionSearch> {
  const precision = options.precision ?? 1;
  const grid =
    options.grid ?? defaultGrid(options.min, options.max, options.gridSize ?? 8);

  let samples = 0;
  const cache = new Map<number, string>();
  const keyAt = async (value: number): Promise<string> => {
    const known = cache.get(value);
    if (known !== undefined) return known;
    samples += 1;
    const key = signatureKey(await render(value));
    cache.set(value, key);
    return key;
  };

  const transitions: Transition[] = [];
  for (let index = 0; index + 1 < grid.length; index += 1) {
    let low = grid[index] as number;
    let high = grid[index + 1] as number;
    const lowKey = await keyAt(low);
    const highKey = await keyAt(high);
    if (lowKey === highKey) continue;

    // Bisect only inside an interval the coarse pass proved contains a change.
    // Bisecting everywhere is the same total cost as a fine sweep, which is the
    // cost this whole scheme exists to avoid.
    while (high - low > precision) {
      const middle = Math.floor((low + high) / 2);
      if (middle === low || middle === high) break;
      if ((await keyAt(middle)) === lowKey) low = middle;
      else high = middle;
    }
    transitions.push({
      before: low,
      at: high,
      change: describeChange(cache.get(low) ?? lowKey, cache.get(high) ?? highKey),
    });
  }

  return {
    axis: options.axis,
    transitions,
    samples,
    range: [options.min, options.max],
  };
}

/**
 * A one-line reading of two signatures.
 *
 * Deliberately blunt: a reviewer needs "it takes a second line", not a
 * structural diff of two JSON documents.
 */
export function describeChange(before: string, after: string): string {
  const [beforeColumns, beforeLines, beforeWrapped, beforeClipped, beforeScroll] =
    JSON.parse(before) as [
      [string, number][],
      [string, number][],
      string[],
      string[],
      string[],
    ];
  const [afterColumns, afterLines, afterWrapped, afterClipped, afterScroll] =
    JSON.parse(after) as [
      [string, number][],
      [string, number][],
      string[],
      string[],
      string[],
    ];

  const reasons: string[] = [];
  const compareCounts = (
    left: [string, number][],
    right: [string, number][],
    noun: string,
  ) => {
    // A node that gains or loses its count is treated as having gone through
    // zero rather than skipped. An entry appearing *is* a layout fact — a cell
    // that starts holding text is exactly the kind of threshold this is for —
    // and skipping it left the caller with "the layout changed", which is the
    // report this function exists to avoid.
    const before = new Map(left);
    const after = new Map(right);
    for (const path of new Set([...before.keys(), ...after.keys()])) {
      const previous = before.get(path) ?? 0;
      const current = after.get(path) ?? 0;
      if (previous !== current) {
        reasons.push(`${path}: ${previous} → ${current} ${noun}`);
      }
    }
    reasons.sort();
  };
  compareCounts(beforeLines, afterLines, 'lines');
  compareCounts(beforeColumns, afterColumns, 'columns');

  const appeared = (left: string[], right: string[], noun: string) => {
    for (const path of right) {
      if (!left.includes(path)) reasons.push(`${path} starts ${noun}`);
    }
    for (const path of left) {
      if (!right.includes(path)) reasons.push(`${path} stops ${noun}`);
    }
  };
  appeared(beforeWrapped, afterWrapped, 'wrapping');
  appeared(beforeClipped, afterClipped, 'clipping');
  appeared(beforeScroll, afterScroll, 'scrolling');

  return reasons.length > 0 ? reasons.join(', ') : 'the layout changed';
}

/** The assumption an attestation carries when a search fed it. */
export const samplingAssumption = (search: TransitionSearch) =>
  ({
    kind: 'sampling' as const,
    axis: search.axis,
    samples: search.samples,
    transitions: search.transitions.map((transition) => transition.at),
  }) as const;

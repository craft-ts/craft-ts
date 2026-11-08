import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import type { GoldenCapture, GoldenReplayResult } from './golden-replay.js';

/**
 * Compares one session of a golden set replayed on the base (twice) and on
 * the head (once). The two base runs tell the noise: what differs between them
 * — a measured value, a pixel — changes on its own and is never reported. What
 * differs between base and head outside that noise is the change.
 *
 * The verdict separates what the head broke from what it changed and from
 * what the session can no longer show:
 * - `regression`: the base replays to the end, the head does not (a state the
 *   code no longer produces, a call a click no longer makes, an action whose
 *   element is gone);
 * - `changed`: both replay, and a moment differs: a person has to look;
 * - `unchanged`: both replay, and nothing differs outside the noise;
 * - `stale`: the base itself does not replay to the end — the session no
 *   longer matches the app and must be recorded again, it proves nothing;
 * - `flaky`: the two base runs disagree on how far they go.
 */
export type GoldenVerdict = 'regression' | 'changed' | 'unchanged' | 'stale' | 'flaky';

export type MeasureChange = Readonly<{ path: string; base: string | undefined; head: string | undefined }>;

export type MomentComparison = Readonly<{
  replayIndex: number;
  eventId?: string;
  reasons: readonly string[];
  status: 'same' | 'changed' | 'missing-in-head' | 'new-in-head';
  /** Measured values that differ, outside the noise (at most `maxChanges`). */
  measureChanges: readonly MeasureChange[];
  measureChangeCount: number;
  /** Measured values that differ between the two base runs. */
  noisyMeasures: number;
  /** Share of the picture that differs, outside the noise (0–1). */
  pixelRatio: number;
  /** Share of the picture that differs between the two base runs. */
  noisyPixelRatio: number;
  /** The picture sizes differ: no pixel comparison. */
  sizeChanged?: true;
  /** For a person: the changed pixels in red, the noise left out. */
  diffPng?: Buffer;
  basePng?: Buffer;
  headPng?: Buffer;
}>;

export type GoldenSessionComparison = Readonly<{
  sessionId: string;
  verdict: GoldenVerdict;
  /** Why, in a few words. */
  reason: string;
  base: RunSummary;
  head: RunSummary;
  /** The head's gap, when it stopped on one. */
  difference?: GoldenReplayResult['difference'];
  moments: readonly MomentComparison[];
}>;

type RunSummary = Readonly<{
  status: GoldenReplayResult['status'];
  replayIndex: number;
  total: number;
  message?: string;
  unprovenInteractions: number;
  /** Actions at the end of the recording left out of the replay. */
  droppedSteps?: number;
}>;

export type CompareGoldenRunsOptions = Readonly<{
  /** pixelmatch's colour threshold (default 0.1). */
  pixelThreshold?: number;
  /** Below this share of changed pixels a moment is the same (default 0.0005). */
  minPixelRatio?: number;
  /** Measured changes listed per moment (default 40). */
  maxChanges?: number;
}>;

export function compareGoldenRuns(
  runs: Readonly<{ base: readonly [GoldenReplayResult, GoldenReplayResult]; head: GoldenReplayResult }>,
  options: CompareGoldenRunsOptions = {},
): GoldenSessionComparison {
  const [base, baseAgain] = runs.base;
  const head = runs.head;
  const common = { sessionId: base.sessionId, base: summary(base), head: summary(head) };
  const baseCompleted = [base, baseAgain].map((run) => run.status === 'completed');
  if (!baseCompleted[0] && !baseCompleted[1])
    return { ...common, verdict: 'stale', reason: `la base ne rejoue pas la session (${base.status}${base.message ? ` : ${base.message}` : ''}) : à réenregistrer`, moments: [] };
  if (baseCompleted[0] !== baseCompleted[1] || base.replayIndex !== baseAgain.replayIndex)
    return { ...common, verdict: 'flaky', reason: 'les deux rejeux de la base ne vont pas au même point', moments: [] };
  if (head.status !== 'completed')
    return {
      ...common,
      verdict: 'regression',
      reason: head.status === 'diverged'
        ? `la tête s’écarte de l’enregistrement à l’action ${head.replayIndex + 1}`
        : `la tête ne rejoue pas jusqu’au bout (${head.status}${head.message ? ` : ${head.message}` : ''})`,
      ...(head.difference ? { difference: head.difference } : {}),
      moments: [],
    };
  const lost = head.unprovenInteractions.filter((note) => !base.unprovenInteractions.includes(note));
  const moments = compareMoments(base.captures, baseAgain.captures, head.captures, options);
  if (lost.length > 0)
    return { ...common, verdict: 'regression', reason: `${lost.length} action(s) dont l’élément n’existe plus dans la tête : ${lost[0]}`, moments };
  const changed = moments.filter((moment) => moment.status !== 'same');
  return changed.length > 0
    ? { ...common, verdict: 'changed', reason: `${changed.length} moment(s) sur ${moments.length} diffèrent`, moments }
    : { ...common, verdict: 'unchanged', reason: 'aucune différence hors du bruit', moments };
}

function summary(run: GoldenReplayResult): RunSummary {
  return {
    status: run.status,
    replayIndex: run.replayIndex,
    total: run.total,
    ...(run.message ? { message: run.message } : {}),
    unprovenInteractions: run.unprovenInteractions.length,
    ...(run.tailCut ? { droppedSteps: run.tailCut.droppedSteps } : {}),
  };
}

function compareMoments(
  base: readonly GoldenCapture[],
  baseAgain: readonly GoldenCapture[],
  head: readonly GoldenCapture[],
  options: CompareGoldenRunsOptions,
): MomentComparison[] {
  const byIndex = (captures: readonly GoldenCapture[]) => new Map(captures.map((capture) => [capture.replayIndex, capture]));
  const again = byIndex(baseAgain);
  const heads = byIndex(head);
  const moments: MomentComparison[] = base.map((capture) => {
    const headCapture = heads.get(capture.replayIndex);
    const identity = {
      replayIndex: capture.replayIndex,
      ...(capture.eventId === undefined ? {} : { eventId: capture.eventId }),
      reasons: capture.reasons,
    };
    if (!headCapture)
      return { ...identity, status: 'missing-in-head', measureChanges: [], measureChangeCount: 0, noisyMeasures: 0, pixelRatio: 1, noisyPixelRatio: 0, basePng: capture.png };
    return compareMoment(identity, capture, again.get(capture.replayIndex), headCapture, options);
  });
  const known = new Set(base.map((capture) => capture.replayIndex));
  for (const capture of head)
    if (!known.has(capture.replayIndex))
      moments.push({
        replayIndex: capture.replayIndex,
        ...(capture.eventId === undefined ? {} : { eventId: capture.eventId }),
        reasons: capture.reasons,
        status: 'new-in-head',
        measureChanges: [],
        measureChangeCount: 0,
        noisyMeasures: 0,
        pixelRatio: 1,
        noisyPixelRatio: 0,
        headPng: capture.png,
      });
  return moments.sort((a, b) => a.replayIndex - b.replayIndex);
}

function compareMoment(
  identity: Pick<MomentComparison, 'replayIndex' | 'eventId' | 'reasons'>,
  base: GoldenCapture,
  baseAgain: GoldenCapture | undefined,
  head: GoldenCapture,
  options: CompareGoldenRunsOptions,
): MomentComparison {
  const maxChanges = options.maxChanges ?? 40;
  const baseMeasure = flattenMeasure(base.digest);
  const againMeasure = baseAgain ? flattenMeasure(baseAgain.digest) : baseMeasure;
  const headMeasure = flattenMeasure(head.digest);
  const noisy = differingPaths(baseMeasure, againMeasure);
  const differing = [...differingPaths(baseMeasure, headMeasure)].filter((path) => !noisy.has(path));
  // A node added or removed is one change: its fields are not listed.
  const wholes = differing.filter((path) => baseMeasure.get(path) === PRESENT || headMeasure.get(path) === PRESENT);
  const changes = differing
    .filter((path) => !wholes.some((whole) => path !== whole && (path.startsWith(`${whole}.`) || path.startsWith(`${whole}[`))))
    .sort()
    .map((path) => ({ path, base: baseMeasure.get(path), head: headMeasure.get(path) }));
  const pixels = comparePixels(base.png, baseAgain?.png ?? base.png, head.png, options.pixelThreshold ?? 0.1);
  const changed = changes.length > 0 || pixels.sizeChanged === true || pixels.ratio >= (options.minPixelRatio ?? 0.0005);
  return {
    ...identity,
    status: changed ? 'changed' : 'same',
    measureChanges: changes.slice(0, maxChanges),
    measureChangeCount: changes.length,
    noisyMeasures: noisy.size,
    pixelRatio: pixels.ratio,
    noisyPixelRatio: pixels.noisyRatio,
    ...(pixels.sizeChanged ? { sizeChanged: true as const } : {}),
    ...(changed ? { basePng: base.png, headPng: head.png, ...(pixels.diff ? { diffPng: pixels.diff } : {}) } : {}),
  };
}

/** The value of a keyed element itself: added or removed, it is one change, not one per field. */
export const PRESENT = '(présent)';

/**
 * A measurement as `path → value`. An array of objects that carry a `path`
 * (the nodes of a layout digest) is keyed by it, so a node added before the
 * others does not shift them all; the element itself is listed as `PRESENT`.
 */
export function flattenMeasure(value: unknown, prefix = '', out = new Map<string, string>()): Map<string, string> {
  if (Array.isArray(value)) {
    const keyed = value.length > 0 && value.every((item) => isRecord(item) && typeof item['path'] === 'string');
    value.forEach((item, index) => {
      const path = `${prefix}[${keyed ? String((item as Record<string, unknown>)['path']) : index}]`;
      if (keyed) out.set(path, PRESENT);
      flattenMeasure(item, path, out);
    });
    if (value.length === 0) out.set(prefix, '[]');
  } else if (isRecord(value)) {
    const keys = Object.keys(value);
    for (const key of keys) flattenMeasure(value[key], prefix ? `${prefix}.${key}` : key, out);
    if (keys.length === 0) out.set(prefix, '{}');
  } else if (value !== undefined) {
    out.set(prefix, JSON.stringify(value));
  }
  return out;
}

function differingPaths(left: ReadonlyMap<string, string>, right: ReadonlyMap<string, string>): Set<string> {
  const paths = new Set<string>();
  for (const [path, value] of left) if (right.get(path) !== value) paths.add(path);
  for (const path of right.keys()) if (!left.has(path)) paths.add(path);
  return paths;
}

/** Changed pixels between base and head, the pixels that differ between the two base runs left out. */
export function comparePixels(
  basePng: Buffer,
  baseAgainPng: Buffer,
  headPng: Buffer,
  threshold: number,
): Readonly<{ ratio: number; noisyRatio: number; sizeChanged?: true; diff?: Buffer }> {
  const base = PNG.sync.read(basePng);
  const again = PNG.sync.read(baseAgainPng);
  const head = PNG.sync.read(headPng);
  if (base.width !== head.width || base.height !== head.height) return { ratio: 1, noisyRatio: 0, sizeChanged: true };
  const total = base.width * base.height;
  const noise = new Uint8Array(total * 4);
  const comparableNoise = again.width === base.width && again.height === base.height;
  if (comparableNoise)
    pixelmatch(base.data, again.data, noise, base.width, base.height, { threshold, diffMask: true });
  else noise.fill(255);
  const diff = new PNG({ width: base.width, height: base.height });
  pixelmatch(base.data, head.data, diff.data, base.width, base.height, { threshold, diffMask: true });
  let changed = 0;
  let noisy = 0;
  for (let pixel = 0; pixel < total; pixel += 1) {
    const alpha = pixel * 4 + 3;
    if (noise[alpha]! > 0) {
      noisy += 1;
      diff.data[alpha] = 0;
    } else if (diff.data[alpha]! > 0) changed += 1;
  }
  return {
    ratio: changed / total,
    noisyRatio: noisy / total,
    ...(changed > 0 ? { diff: PNG.sync.write(diff) } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

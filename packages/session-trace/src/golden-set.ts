import { defaultCoverageUnitWeight, sessionCoverageUnits } from './coverage-units.js';
import { SESSION_TRACE_SCHEMA_VERSION, type SessionTrace } from './normalize.js';

/**
 * The golden set: the few recorded sessions that, replayed on every change,
 * cover what all the recorded sessions cover. Chosen by coverage units
 * (`sessionCoverageUnits`), never by hand; each kept session says which units
 * only it shows — its reason to be in the suite.
 */
export const GOLDEN_SET_SCHEMA_VERSION = 1;
export const DEFAULT_GOLDEN_SET_MAX_SESSIONS = 50;
/** A unit the caller marks as a priority (an unproven behaviour) weighs this many times more. */
export const GOLDEN_SET_PRIORITY_FACTOR = 3;

export type GoldenSetCandidate = Readonly<{
  sessionId: string;
  /** ISO date of the recording. */
  recordedAt: string;
  trace: Pick<SessionTrace, 'steps' | 'hash'>;
  /**
   * Whether the session replays without a gap on the current build. `false`
   * keeps it out of the set; `undefined` (never checked) lets it in as
   * `unverified`.
   */
  replayable?: boolean;
  /** Kept whatever its coverage, and never pruned. */
  pinned?: boolean;
}>;

export type GoldenSessionStatus = 'active' | 'unverified';

export type GoldenSetEntry = Readonly<{
  sessionId: string;
  recordedAt: string;
  traceHash: string;
  status: GoldenSessionStatus;
  pinned?: true;
  /** Every unit the session shows, sorted. */
  units: readonly string[];
  /** The units no other kept session shows, sorted. */
  uniqueUnits: readonly string[];
}>;

export type GoldenSetManifest = Readonly<{
  format: 'craft-golden-set';
  schemaVersion: typeof GOLDEN_SET_SCHEMA_VERSION;
  app: string;
  /** Normalizer version the units were read with. */
  traceSchemaVersion: number;
  sessions: readonly GoldenSetEntry[];
  /**
   * Units that a session of the previous set was the only one to show, and
   * that no session shows now: it went stale or was deleted, and somebody has
   * to record that path again.
   */
  toRecapture: readonly string[];
}>;

export type GoldenSetRejection = Readonly<{
  sessionId: string;
  reason: 'not-replayable' | 'duplicate' | 'redundant' | 'over-budget';
  /** For a duplicate: the kept session with the same trace. */
  duplicateOf?: string;
}>;

export type GoldenSetSelection = Readonly<{
  manifest: GoldenSetManifest;
  rejected: readonly GoldenSetRejection[];
  /** Units shown by an eligible session but left out by `maxSessions`. */
  uncovered: readonly string[];
}>;

export type GoldenSetOptions = Readonly<{
  app: string;
  /** At most this many sessions, pinned ones included (default 50). */
  maxSessions?: number;
  /** Worth of a unit; `defaultCoverageUnitWeight` by default. 0 ignores it. */
  weight?: (unit: string) => number;
  /** Units worth `GOLDEN_SET_PRIORITY_FACTOR` times more (unproven behaviours). */
  priorityUnits?: Iterable<string>;
  /** The set in force: its sessions win ties, so the suite does not churn. */
  previous?: GoldenSetManifest;
}>;

type Candidate = GoldenSetCandidate & { units: readonly string[] };

/** Choose the golden set among recorded sessions. Pure and deterministic. */
export function selectGoldenSet(candidates: readonly GoldenSetCandidate[], options: GoldenSetOptions): GoldenSetSelection {
  const maxSessions = Math.max(0, Math.floor(options.maxSessions ?? DEFAULT_GOLDEN_SET_MAX_SESSIONS));
  const weightOf = options.weight ?? defaultCoverageUnitWeight;
  const priority = new Set(options.priorityUnits ?? []);
  const worth = (unit: string) => Math.max(0, weightOf(unit)) * (priority.has(unit) ? GOLDEN_SET_PRIORITY_FACTOR : 1);
  const previousIds = new Set(options.previous?.sessions.map((entry) => entry.sessionId) ?? []);
  const rejected: GoldenSetRejection[] = [];

  // Preference among equals: pinned, then in the set already, then newest,
  // then shortest (cheaper to replay), then id.
  const prefer = (left: Candidate, right: Candidate) =>
    Number(right.pinned === true) - Number(left.pinned === true) ||
    Number(previousIds.has(right.sessionId)) - Number(previousIds.has(left.sessionId)) ||
    compareText(right.recordedAt, left.recordedAt) ||
    left.trace.steps.length - right.trace.steps.length ||
    compareText(left.sessionId, right.sessionId);

  const eligible: Candidate[] = [];
  for (const candidate of [...candidates].sort((a, b) => compareText(a.sessionId, b.sessionId))) {
    if (candidate.replayable === false) rejected.push({ sessionId: candidate.sessionId, reason: 'not-replayable' });
    else eligible.push({ ...candidate, units: sessionCoverageUnits(candidate.trace) });
  }

  // One session per distinct trace.
  const byHash = new Map<string, Candidate[]>();
  for (const candidate of eligible) byHash.set(candidate.trace.hash, [...(byHash.get(candidate.trace.hash) ?? []), candidate]);
  const distinct: Candidate[] = [];
  for (const group of byHash.values()) {
    const [kept, ...duplicates] = [...group].sort(prefer);
    if (!kept) continue;
    distinct.push(kept);
    for (const duplicate of duplicates)
      rejected.push({ sessionId: duplicate.sessionId, reason: 'duplicate', duplicateOf: kept.sessionId });
  }

  // Greedy weighted set cover, pinned sessions first.
  const selected: Candidate[] = [];
  const covered = new Set<string>();
  const take = (candidate: Candidate) => {
    selected.push(candidate);
    for (const unit of candidate.units) covered.add(unit);
  };
  const remaining = distinct.sort(prefer);
  for (const candidate of remaining.filter((item) => item.pinned)) if (selected.length < maxSessions) take(candidate);
  let pool = remaining.filter((item) => !selected.includes(item));
  const gainOf = (candidate: Candidate) => candidate.units.reduce((sum, unit) => (covered.has(unit) ? sum : sum + worth(unit)), 0);
  while (selected.length < maxSessions && pool.length) {
    let best: Candidate | undefined;
    let bestGain = 0;
    for (const candidate of pool) {
      const gain = gainOf(candidate);
      if (gain > bestGain) { best = candidate; bestGain = gain; }
    }
    if (!best) break;
    take(best);
    pool = pool.filter((item) => item !== best);
  }

  // A session taken early may be covered by later ones: drop it, newest
  // choices kept, so the set holds no session without a unit of its own.
  for (const candidate of [...selected].reverse()) {
    if (candidate.pinned) continue;
    const others = selected.filter((item) => item !== candidate);
    const shownElsewhere = new Set(others.flatMap((item) => item.units));
    if (candidate.units.every((unit) => worth(unit) === 0 || shownElsewhere.has(unit))) {
      selected.splice(selected.indexOf(candidate), 1);
      pool.push(candidate);
    }
  }

  const finalCovered = new Set(selected.flatMap((item) => item.units));
  for (const candidate of pool.sort((a, b) => compareText(a.sessionId, b.sessionId))) {
    const bringsSomething = candidate.units.some((unit) => worth(unit) > 0 && !finalCovered.has(unit));
    rejected.push({ sessionId: candidate.sessionId, reason: bringsSomething ? 'over-budget' : 'redundant' });
  }
  const uncovered = [...new Set(pool.flatMap((item) => item.units))].filter((unit) => worth(unit) > 0 && !finalCovered.has(unit)).sort();

  const shownBy = new Map<string, number>();
  for (const candidate of selected) for (const unit of candidate.units) shownBy.set(unit, (shownBy.get(unit) ?? 0) + 1);
  const sessions = selected
    .map((candidate): GoldenSetEntry => ({
      sessionId: candidate.sessionId,
      recordedAt: candidate.recordedAt,
      traceHash: candidate.trace.hash,
      status: candidate.replayable === true ? 'active' : 'unverified',
      ...(candidate.pinned ? { pinned: true as const } : {}),
      units: candidate.units,
      uniqueUnits: candidate.units.filter((unit) => shownBy.get(unit) === 1),
    }))
    .sort((a, b) => compareText(a.sessionId, b.sessionId));

  const keptIds = new Set(sessions.map((entry) => entry.sessionId));
  const lost = (options.previous?.sessions ?? [])
    .filter((entry) => !keptIds.has(entry.sessionId))
    .flatMap((entry) => entry.uniqueUnits)
    .filter((unit) => !finalCovered.has(unit));
  // A unit already waiting for a recording stays listed until a session shows it.
  const stillWaiting = (options.previous?.toRecapture ?? []).filter((unit) => !finalCovered.has(unit));

  return {
    manifest: {
      format: 'craft-golden-set',
      schemaVersion: GOLDEN_SET_SCHEMA_VERSION,
      app: options.app,
      traceSchemaVersion: SESSION_TRACE_SCHEMA_VERSION,
      sessions,
      toRecapture: [...new Set([...lost, ...stillWaiting])].sort(),
    },
    rejected: rejected.sort((a, b) => compareText(a.sessionId, b.sessionId)),
    uncovered,
  };
}

/**
 * The kept sessions that show at least one of `units`: the ones to replay
 * after a change that touches them. Newest first.
 */
export function goldenSessionsShowing(manifest: GoldenSetManifest, units: Iterable<string> | ((unit: string) => boolean)): readonly GoldenSetEntry[] {
  const matches = typeof units === 'function' ? units : ((wanted: ReadonlySet<string>) => (unit: string) => wanted.has(unit))(new Set(units));
  return manifest.sessions
    .filter((entry) => entry.units.some(matches))
    .sort((a, b) => compareText(b.recordedAt, a.recordedAt) || compareText(a.sessionId, b.sessionId));
}

/** The one validation of a golden-set manifest read from disk or the network. */
export function isGoldenSetManifest(value: unknown): value is GoldenSetManifest {
  if (!isRecord(value) || value['format'] !== 'craft-golden-set' || value['schemaVersion'] !== GOLDEN_SET_SCHEMA_VERSION) return false;
  if (typeof value['app'] !== 'string' || typeof value['traceSchemaVersion'] !== 'number') return false;
  if (!isStringArray(value['toRecapture']) || !Array.isArray(value['sessions'])) return false;
  return value['sessions'].every((entry) =>
    isRecord(entry) &&
    typeof entry['sessionId'] === 'string' &&
    typeof entry['recordedAt'] === 'string' &&
    typeof entry['traceHash'] === 'string' &&
    (entry['status'] === 'active' || entry['status'] === 'unverified') &&
    (entry['pinned'] === undefined || entry['pinned'] === true) &&
    isStringArray(entry['units']) &&
    isStringArray(entry['uniqueUnits']));
}

function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function isStringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every((item) => typeof item === 'string'); }

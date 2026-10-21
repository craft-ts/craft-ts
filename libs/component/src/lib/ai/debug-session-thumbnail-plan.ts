import type { SendContextEvent } from '@craft-ts/core';
import { getReplaySteps } from './debug-session-replay';

/** Why a moment of the replay deserves a thumbnail. */
export type ThumbnailReason =
  | 'start'
  | 'navigation'
  | 'craft'
  | 'checkpoint'
  | 'interaction'
  | 'end';

/**
 * One moment worth a picture: the state of the app once `replayIndex` actions
 * have run. `0` is the app as it opens, before any action.
 */
export interface ThumbnailCapturePoint {
  readonly replayIndex: number;
  readonly reasons: readonly ThumbnailReason[];
  readonly score: number;
  /** The tab that ran the last action, or opened the replay. */
  readonly participantId?: string;
  /** The last action run (absent for the opening state). */
  readonly eventId?: string;
  readonly sequence?: number;
  /** Recorded time of this moment, from the first action. */
  readonly offsetMs: number;
}

export interface ThumbnailPlanOptions {
  /** The most thumbnails kept for one recording. */
  readonly maxPoints?: number;
  /** Moments closer than this, in recorded time, share one thumbnail. */
  readonly minGapMs?: number;
}

export const DEFAULT_THUMBNAIL_MAX_POINTS = 20;
export const DEFAULT_THUMBNAIL_MIN_GAP_MS = 1_000;

const REASON_SCORE: Readonly<Record<ThumbnailReason, number>> = {
  start: 100,
  end: 100,
  navigation: 3,
  craft: 2,
  checkpoint: 1.5,
  interaction: 1,
};

interface Candidate {
  replayIndex: number;
  reasons: Set<ThumbnailReason>;
  timeMs: number;
  participantId: string | undefined;
  eventId: string | undefined;
  sequence: number | undefined;
}

function scoreOf(reasons: ReadonlySet<ThumbnailReason>): number {
  let score = 0;
  for (const reason of reasons) score = Math.max(score, REASON_SCORE[reason]);
  return score + (reasons.size - 1) * 0.1;
}

/** Which kind of visual settling an event signals, if any. */
function signalOf(event: SendContextEvent): ThumbnailReason | undefined {
  if (event.phase !== 'succeeded' && event.phase !== 'emitted')
    return undefined;
  if (event.kind === 'navigation')
    return event.name === 'NavigationEnd' && event.phase === 'succeeded'
      ? 'navigation'
      : undefined;
  if (event.kind === 'route-load') {
    return event.phase === 'succeeded' ? 'navigation' : undefined;
  }
  if (event.kind === 'craft')
    return event.phase === 'succeeded' &&
      typeof event.name === 'string' &&
      event.name.startsWith('method:')
      ? 'craft'
      : undefined;
  if (event.kind === 'snapshot' || event.name?.includes('checkpoint'))
    return 'checkpoint';
  return undefined;
}

/** The clock all the actions share: the archive's when every action has it. */
function clockOf(steps: readonly SendContextEvent[]): (e: SendContextEvent) => number {
  if (steps.every((step) => step.globalElapsedMs !== undefined))
    return (event) => event.globalElapsedMs ?? event.timestamp;
  if (steps.every((step) => step.elapsedMs !== undefined))
    return (event) => event.elapsedMs ?? event.timestamp;
  return (event) => event.timestamp;
}

/**
 * Picks the moments of a recording that make a useful thumbnail strip, from
 * the events alone: the opening state, the end of each navigation, of each
 * Craft call and of each checkpoint that an action led to, and the end.
 * Moments that are close in recorded time are merged into the later one — the
 * app has settled by then — and the least telling ones go first when there are
 * more than `maxPoints`.
 *
 * `events` is the list the replay runs: the plan indexes its actions the way
 * the replay counts them.
 */
export function planThumbnailCapturePoints(
  events: readonly SendContextEvent[],
  options: ThumbnailPlanOptions = {},
): readonly ThumbnailCapturePoint[] {
  const maxPoints = Math.max(2, options.maxPoints ?? DEFAULT_THUMBNAIL_MAX_POINTS);
  const minGapMs = options.minGapMs ?? DEFAULT_THUMBNAIL_MIN_GAP_MS;
  const steps = getReplaySteps(events);
  if (steps.length === 0) return [];

  const positions = new Map<string, number>();
  events.forEach((event, position) => positions.set(event.id, position));
  const timeOf = clockOf(steps);
  const originMs = timeOf(steps[0]!);

  const candidates: Candidate[] = [
    {
      replayIndex: 0,
      reasons: new Set<ThumbnailReason>(['start']),
      timeMs: originMs,
      participantId: steps[0]!.participantId,
      eventId: undefined,
      sequence: undefined,
    },
  ];

  steps.forEach((step, index) => {
    const isLast = index === steps.length - 1;
    const from = positions.get(step.id) ?? -1;
    const until = isLast
      ? events.length
      : (positions.get(steps[index + 1]!.id) ?? events.length);
    const reasons = new Set<ThumbnailReason>();
    for (let position = from + 1; position < until; position++) {
      const event = events[position]!;
      if (
        step.participantId !== undefined &&
        event.participantId !== undefined &&
        event.participantId !== step.participantId
      )
        continue;
      const reason = signalOf(event);
      if (reason) reasons.add(reason);
    }
    if (isLast) reasons.add('end');
    if (reasons.size === 0) return;
    // A click that led to something is worth showing as the click.
    if (step.kind === 'dom') reasons.add('interaction');
    candidates.push({
      replayIndex: index + 1,
      reasons,
      timeMs: timeOf(step),
      participantId: step.participantId,
      eventId: step.id,
      sequence: step.sequence,
    });
  });

  const merged: Candidate[] = [];
  for (const candidate of candidates) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.replayIndex > 0 &&
      candidate.timeMs - previous.timeMs < minGapMs
    ) {
      for (const reason of previous.reasons) candidate.reasons.add(reason);
      merged[merged.length - 1] = candidate;
    } else {
      merged.push(candidate);
    }
  }

  let kept = merged;
  while (kept.length > maxPoints) {
    let weakest = -1;
    let weakestScore = Number.POSITIVE_INFINITY;
    let weakestGap = Number.POSITIVE_INFINITY;
    for (let index = 1; index < kept.length - 1; index++) {
      const score = scoreOf(kept[index]!.reasons);
      const gap = kept[index]!.timeMs - kept[index - 1]!.timeMs;
      if (
        score < weakestScore ||
        (score === weakestScore && gap < weakestGap)
      ) {
        weakest = index;
        weakestScore = score;
        weakestGap = gap;
      }
    }
    if (weakest < 0) break;
    kept = kept.filter((_, index) => index !== weakest);
  }

  return kept.map((candidate) => ({
    replayIndex: candidate.replayIndex,
    reasons: [...candidate.reasons],
    score: scoreOf(candidate.reasons),
    ...(candidate.participantId === undefined
      ? {}
      : { participantId: candidate.participantId }),
    ...(candidate.eventId === undefined ? {} : { eventId: candidate.eventId }),
    ...(candidate.sequence === undefined
      ? {}
      : { sequence: candidate.sequence }),
    offsetMs: Math.max(0, candidate.timeMs - originMs),
  }));
}

/**
 * Which archived sessions may enter an app's golden set (see
 * `selectGoldenSet` of `@craft-ts/session-trace`): the journeys a person made
 * on that app, finished, whole. What the tooling recorded (e2e runs, guided
 * resumes, recipe runs) already has a home and is left out.
 */
import type { GoldenSetCandidate, SessionTrace } from '@craft-ts/session-trace';
import { PORTABLE_DEBUG_SESSION_VERSION, type StoredDebugSessionSummary } from './debug-session-store.js';
import type { ThumbnailManifest } from './thumbnails/thumbnail-store.js';

export type GoldenSetSkipReason = 'other-app' | 'tooling' | 'recording' | 'truncated' | 'outdated';

export type StoredSessionForGoldenSet = Readonly<{
  summary: Pick<StoredDebugSessionSummary, 'id' | 'startUrl' | 'createdAt' | 'status' | 'truncated' | 'test' | 'resume'> &
    Partial<Pick<StoredDebugSessionSummary, 'recordingVersion'>>;
  trace: Pick<SessionTrace, 'steps' | 'hash'>;
  /** The thumbnails' replay is the only replay the archive has run so far. */
  thumbnails?: Pick<ThumbnailManifest, 'status' | 'stoppedAtReplayIndex'>;
  /**
   * The app was opened by the resume tooling (a guided resume, a recipe run,
   * « Déboguer ici »): its address carried a launch parameter at some boot.
   */
  launchedByTooling?: boolean;
}>;

/** The query parameters the resume tooling opens the app with. */
const TOOLING_LAUNCH_PARAMETERS = /^craft-(resume|debug-snapshot)/;

/** Whether one of these addresses was opened by the resume tooling. */
export function openedByTooling(urls: readonly string[]): boolean {
  return urls.some((url) => {
    try {
      return [...new URL(url, 'http://local.invalid').searchParams.keys()].some((name) =>
        TOOLING_LAUNCH_PARAMETERS.test(name),
      );
    } catch {
      return false;
    }
  });
}

export function goldenSetCandidates(
  sessions: readonly StoredSessionForGoldenSet[],
  origin: string,
): Readonly<{
  candidates: readonly GoldenSetCandidate[];
  skipped: readonly Readonly<{ sessionId: string; reason: GoldenSetSkipReason }>[];
}> {
  const wanted = originOf(origin);
  const candidates: GoldenSetCandidate[] = [];
  const skipped: { sessionId: string; reason: GoldenSetSkipReason }[] = [];
  for (const { summary, trace, thumbnails, launchedByTooling } of sessions) {
    const reason: GoldenSetSkipReason | undefined =
      wanted === undefined || originOf(summary.startUrl) !== wanted ? 'other-app'
        : summary.test || summary.resume || launchedByTooling || openedByTooling([summary.startUrl]) ? 'tooling'
          : summary.status === 'recording' ? 'recording'
            : summary.truncated ? 'truncated'
              // Recorded before the app's exchanges were (version 8): its calls
              // have no answer to be replayed with, it can only stop at the first.
              : (summary.recordingVersion ?? PORTABLE_DEBUG_SESSION_VERSION) < PORTABLE_DEBUG_SESSION_VERSION ? 'outdated'
                : undefined;
    if (reason) {
      if (reason !== 'other-app') skipped.push({ sessionId: summary.id, reason });
      continue;
    }
    const replayable = replayableFrom(thumbnails);
    candidates.push({
      sessionId: summary.id,
      recordedAt: summary.createdAt,
      trace,
      ...(replayable === undefined ? {} : { replayable }),
    });
  }
  return { candidates, skipped };
}

/**
 * A replay that took every picture went through; one that stopped at a moment
 * met a gap. Any other failure (no browser, cancelled) proves nothing.
 */
function replayableFrom(
  thumbnails: StoredSessionForGoldenSet['thumbnails'],
): boolean | undefined {
  if (thumbnails?.status === 'ready') return true;
  if (thumbnails?.status === 'failed' && thumbnails.stoppedAtReplayIndex !== undefined) return false;
  return undefined;
}

function originOf(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

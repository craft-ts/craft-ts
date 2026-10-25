import {
  planThumbnailCapturePoints,
  type ThumbnailCapturePoint,
} from '@craft-ts/component';
import { exposeReplayWorkerSurface } from './replay-browser';
import {
  activeReplayParticipantId,
  canReplaySelectedSession,
  connected,
  difference,
  loadError,
  registers,
  replayState,
  replayViewport,
  replayViewportScale,
  replayIndex,
  replayableEvents,
  seekHooks,
  seekTarget,
  session,
  status,
  visibleEvents,
} from './replay-state';

/**
 * The control surface of the thumbnail worker: a hidden browser that opens this
 * dashboard on a recording (`?replay-worker=1`) to photograph the replay. It
 * does not click the buttons — it reads where the replay is, asks for the plan
 * of moments worth a picture, and has the replay advance to one of them. The
 * shape below is the contract with the worker in the log server.
 */
export type ReplayWorkerSnapshot = Readonly<{
  /** The tabs are open and the replay waits for its first action. */
  ready: boolean;
  /** Why the replay cannot go on, if it cannot. */
  failed: string | undefined;
  state: string;
  /** Actions that have run. */
  replayIndex: number;
  total: number;
  /** An advance is under way. */
  seeking: boolean;
  /** The replay stopped on a gap with the recording. */
  difference: boolean;
  /** That gap, for a reader that reports it (the e2e baseline replay). */
  differenceDetail:
    | Readonly<{ eventId?: string; expected: unknown; actual: unknown }>
    | undefined;
  /** How much the page is shrunk to fit its frame; 1 is its recorded size. */
  scale: number;
  activeParticipantId: string | undefined;
  viewport: Readonly<{ width: number; height: number }> | undefined;
}>;

export type ReplayWorkerSurface = Readonly<{
  snapshot: () => ReplayWorkerSnapshot;
  plan: (options?: { maxPoints?: number }) => readonly ThumbnailCapturePoint[];
  /** Runs the replay on until this many actions have run. */
  advanceTo: (index: number) => void;
}>;

const SETTLED_STATES: readonly string[] = ['ready', 'paused', 'completed'];

function snapshot(): ReplayWorkerSnapshot {
  const state = replayState();
  const loaded = session() !== undefined;
  const unplayable = loaded && !canReplaySelectedSession();
  const failed =
    loadError() ??
    (state === 'error' ? status() : undefined) ??
    (unplayable ? 'Aucun replay fiable pour cette session.' : undefined);
  return {
    ready:
      loaded &&
      !unplayable &&
      connected() &&
      SETTLED_STATES.includes(state) &&
      replayableEvents().length > 0,
    failed,
    state,
    replayIndex: replayIndex(),
    total: replayableEvents().length,
    seeking: seekTarget() !== undefined || registers.seekStepping,
    difference: difference() !== undefined,
    differenceDetail: differenceDetail(),
    scale: replayViewportScale(),
    activeParticipantId: activeReplayParticipantId(),
    viewport: replayViewport() ?? session()?.viewport,
  };
}

function differenceDetail(): ReplayWorkerSnapshot['differenceDetail'] {
  const current = difference();
  if (!current) return undefined;
  return {
    ...(current.eventId ? { eventId: current.eventId } : {}),
    expected: current.expected,
    actual: current.actual,
  };
}

export function installReplayWorkerSurface(): void {
  const surface: ReplayWorkerSurface = {
    snapshot,
    plan: (options) => planThumbnailCapturePoints(visibleEvents(), options),
    advanceTo: (index) => {
      seekTarget.set(index);
      seekHooks.drive();
    },
  };
  exposeReplayWorkerSurface(surface);
}

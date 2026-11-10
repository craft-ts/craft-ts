import {
  planThumbnailCapturePoints,
  type ReplayTailCut,
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
  replayWarnings,
  replayableEvents,
  replayedEvents,
  seekTarget,
  session,
  status,
  visibleEvents,
} from '../state/replay-state';

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
  /**
   * The replay's notes so far (fallbacks, observations it could not pair):
   * a suite reports an `[Interaction non prouvée]` instead of passing on it.
   */
  warnings: readonly string[];
  /**
   * The end of the recording the replay leaves out (a tab closed mid-request,
   * a page loaded again): `total` counts only what is replayed.
   */
  tailCut: ReplayTailCut | undefined;
}>;

export type ReplayWorkerSurface = Readonly<{
  snapshot: () => ReplayWorkerSnapshot;
  plan: (options?: { maxPoints?: number }) => readonly ThumbnailCapturePoint[];
  /** Starts normal playback; the caller waits until the requested index. */
  advanceTo: (index: number) => void;
  /**
   * Runs the actions one at a time up to `index` and stays paused there: the
   * same moment on every run, which a regression suite compares. Playback
   * (`advanceTo`) goes on while the picture is taken.
   */
  seekTo: (index: number) => void;
  /**
   * Shows one tab alone at the size it was recorded, the others set aside
   * and still running; `undefined` brings the grid back. A session replayed
   * in several tabs (each page load is one) is photographed tab by tab.
   */
  showAlone: (participantId: string | undefined) => void;
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
    warnings: replayWarnings(),
    tailCut: registers.tailCut,
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

export function installReplayWorkerSurface(
  playReplay: () => void,
  seekReplayToIndex: (index: number) => void,
  showAlone: (participantId: string | undefined) => void,
): void {
  const surface: ReplayWorkerSurface = {
    snapshot,
    plan: (options) => planThumbnailCapturePoints(replayedEvents(visibleEvents()), options),
    advanceTo: () => {
      // Keep the application on the recorded clock. Fast-forward seeking can
      // overlap async queries and compare a later checkpoint with stale data.
      if (['ready', 'paused'].includes(replayState())) playReplay();
    },
    seekTo: (index) => {
      if (['ready', 'paused'].includes(replayState())) seekReplayToIndex(index);
    },
    showAlone,
  };
  exposeReplayWorkerSurface(surface);
}

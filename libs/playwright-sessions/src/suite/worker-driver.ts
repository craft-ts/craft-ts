import type { Frame, Locator, Page } from '@playwright/test';

/**
 * The one way this package drives the dashboard's replay: its worker contract
 * (`?replay-worker=1`, `window.__craftReplayWorker`), never its buttons or
 * labels. See `replay-worker.ts` in the dashboard.
 */
export type WorkerSnapshot = Readonly<{
  ready: boolean;
  failed: string | undefined;
  state: string;
  replayIndex: number;
  total: number;
  seeking: boolean;
  difference: boolean;
  differenceDetail?: Readonly<{ eventId?: string; expected: unknown; actual: unknown }>;
  scale?: number;
  activeParticipantId?: string;
  viewport?: Readonly<{ width: number; height: number }>;
  /** The replay's notes; absent from a dashboard older than the field. */
  warnings?: readonly string[];
}>;

/** One moment of the replay worth a picture (the dashboard's thumbnail plan). */
export type ReplayPlanPoint = Readonly<{
  replayIndex: number;
  reasons: readonly string[];
  participantId?: string;
  eventId?: string;
  sequence?: number;
  offsetMs: number;
}>;

type WorkerSurface = {
  snapshot(): WorkerSnapshot;
  plan(options: { maxPoints: number }): ReplayPlanPoint[];
  advanceTo(index: number): void;
  seekTo?(index: number): void;
};
type WorkerWindow = { __craftReplayWorker?: WorkerSurface };

export type WorkerUrlOptions = Readonly<{
  /** The dashboard route: `#/sessions/<id>` or `#/e2e-replay?source=…`. */
  hash: string;
  /** Check the state the replayed methods own instead of restoring it. */
  verifyState?: boolean;
  /** Let the code recompute every state it can, and check it. */
  stateSource?: 'recorded' | 'recomputed';
  /** Dispatch the recorded actions (the app's handlers run) instead of invoking their methods. */
  replayMode?: 'invocation' | 'interaction';
}>;

export function workerUrl(dashboardUrl: string, options: WorkerUrlOptions): string {
  const url = new URL(dashboardUrl);
  url.searchParams.set('replay-worker', '1');
  if (options.verifyState) url.searchParams.set('replay-verify-state', '1');
  if (options.stateSource === 'recomputed') url.searchParams.set('replay-state', 'recomputed');
  if (options.replayMode === 'interaction') url.searchParams.set('replay-mode', 'interaction');
  url.hash = options.hash;
  return url.href;
}

/** The worker's state, or `undefined` while the dashboard has not installed it. */
export function readWorker(page: Page): Promise<WorkerSnapshot | undefined> {
  return page
    .evaluate(() => (window as unknown as WorkerWindow).__craftReplayWorker?.snapshot())
    .catch(() => undefined);
}

/** Polls the worker until `done` holds, or `undefined` at the deadline. */
export async function waitForWorker(
  page: Page,
  done: (snapshot: WorkerSnapshot) => boolean,
  deadline: number,
): Promise<WorkerSnapshot | undefined> {
  for (;;) {
    const snapshot = await readWorker(page);
    if (snapshot && done(snapshot)) return snapshot;
    if (Date.now() >= deadline) return undefined;
    await page.waitForTimeout(Math.min(150, remaining(deadline)));
  }
}

export function workerPlan(page: Page, maxPoints: number): Promise<ReplayPlanPoint[]> {
  return page.evaluate(
    (arg: { maxPoints: number }) => (window as unknown as WorkerWindow).__craftReplayWorker?.plan(arg) ?? [],
    { maxPoints },
  );
}

/** Starts playback towards `index` (the replay goes on once there). */
export function advanceWorker(page: Page, index: number): Promise<void> {
  return page.evaluate((target: number) => (window as unknown as WorkerWindow).__craftReplayWorker?.advanceTo(target), index);
}

/**
 * Runs the actions one at a time up to `index` and stays paused there. A
 * dashboard too old to seek answers `false`.
 */
export function seekWorker(page: Page, index: number): Promise<boolean> {
  return page.evaluate((target: number) => {
    const worker = (window as unknown as WorkerWindow).__craftReplayWorker;
    if (!worker?.seekTo) return false;
    worker.seekTo(target);
    return true;
  }, index);
}

export type AdvanceOutcome =
  | Readonly<{ kind: 'reached' | 'difference' | 'failed'; snapshot: WorkerSnapshot }>
  | Readonly<{ kind: 'stalled' | 'timeout'; snapshot: WorkerSnapshot | undefined }>;

/**
 * Waits until `target` actions have run. A replay of several tabs can be slow
 * to take one action (a tab opens on its first), so what is timed is the time
 * without a new action (`stallMs`), within an overall `deadline`.
 */
export async function waitForAdvance(
  page: Page,
  target: number,
  options: Readonly<{ stallMs: number; deadline: number }>,
): Promise<AdvanceOutcome> {
  let progress = { index: -1, at: Date.now() };
  let last: WorkerSnapshot | undefined;
  for (;;) {
    const snapshot = await readWorker(page);
    if (snapshot) {
      last = snapshot;
      if (snapshot.failed !== undefined) return { kind: 'failed', snapshot };
      if (snapshot.difference) return { kind: 'difference', snapshot };
      if (snapshot.replayIndex >= Math.min(target, snapshot.total) && !snapshot.seeking) return { kind: 'reached', snapshot };
      if (snapshot.replayIndex !== progress.index) progress = { index: snapshot.replayIndex, at: Date.now() };
      else if (Date.now() - progress.at > options.stallMs) return { kind: 'stalled', snapshot };
    }
    if (Date.now() >= options.deadline) return { kind: 'timeout', snapshot: last };
    await page.waitForTimeout(Math.min(150, remaining(options.deadline)));
  }
}

/** The iframe a participant is replayed in (the first one without an id). */
export function replayFrameLocator(page: Page, participantId: string | undefined): Locator {
  return page.locator(
    participantId
      ? `iframe[data-replay-participant="${participantId.replace(/["\\]/g, '\\$&')}"]`
      : 'iframe[data-replay-participant]',
  ).first();
}

/**
 * Waits until the replayed page stops mutating (`quietMs` without a DOM
 * change, `maxWaitMs` at most) and its fonts are loaded; returns its frame.
 */
export async function settleReplayFrame(
  frameLocator: Locator,
  options: Readonly<{ quietMs: number; maxWaitMs: number }>,
): Promise<Frame | undefined> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const frame = await (await frameLocator.elementHandle())?.contentFrame();
      if (!frame) return undefined;
      await frame.evaluate(
        ({ quiet, max }: { quiet: number; max: number }) =>
          new Promise<void>((resolve) => {
            const startedAt = performance.now();
            let lastMutation = startedAt;
            const observer = new MutationObserver(() => {
              lastMutation = performance.now();
            });
            observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
            const tick = (): void => {
              const now = performance.now();
              const quietEnough = document.readyState === 'complete' && now - lastMutation >= quiet;
              if (quietEnough || now - startedAt >= max) {
                observer.disconnect();
                void document.fonts.ready.then(() => resolve());
              } else setTimeout(tick, 50);
            };
            tick();
          }),
        { quiet: options.quietMs, max: options.maxWaitMs },
      );
      return frame;
    } catch {
      // The page navigated under us: look again at the new document.
    }
  }
  return undefined;
}

export function remaining(deadline: number): number {
  return Math.max(1, deadline - Date.now());
}

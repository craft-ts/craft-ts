/// <reference lib="dom" />
import {
  launch,
  loadPlaywright,
  type Page,
  type PlaywrightModule,
} from './thumbnails/playwright-capturer.js';

/**
 * Replays an archived session the way the regression suite does — each
 * action dispatched on its element (the app's handlers run), every state the
 * code can produce recomputed and checked — in a hidden Chromium, through the
 * dashboard's worker contract (`?replay-worker=1`, `__craftReplayWorker`).
 * No picture: the answer is whether the session still replays, and if not,
 * the gap it stops on.
 *
 * What an agent asks after an edit: the sessions the change touches
 * (`sessions.relevant` of the graph MCP), replayed here, one at a time.
 */
export type SuiteReplayStatus =
  /** Every action ran and every recomputed state matched. */
  | 'completed'
  /** The code no longer produces a recorded state or call. */
  | 'diverged'
  /** The replay could not run (session not replayable, page error). */
  | 'failed'
  | 'stalled'
  | 'timeout'
  /** No browser to replay with. */
  | 'unavailable';

export type SuiteReplayResult = Readonly<{
  sessionId: string;
  status: SuiteReplayStatus;
  replayIndex: number;
  total: number;
  message?: string;
  /** The gap, when `diverged`: what was recorded and what the code produced. */
  difference?: unknown;
  /** Actions replayed by invoking their methods: their element was not found. */
  unprovenInteractions: readonly string[];
  /** Every note of the replay. */
  notes: readonly string[];
  /**
   * The end of the recording left out (a tab closed mid-request, a page loaded
   * again): `total` counts only what was replayed.
   */
  tailCut?: TailCut;
  durationMs: number;
}>;

export type TailCut = Readonly<{
  reason: 'missing-result' | 'page-reload' | 'reload-requested';
  atSequence: number;
  keptSteps: number;
  droppedSteps: number;
  operationId?: string;
}>;

export type SuiteReplayer = (sessionId: string) => Promise<SuiteReplayResult>;

export type SuiteReplayerOptions = Readonly<{
  /** Where the dashboard runs, e.g. `http://localhost:4210/`. */
  dashboardUrl: string;
  loadPlaywright?: () => Promise<PlaywrightModule>;
  /** Whole replay (default 120 s). */
  timeoutMs?: number;
  /** No action for this long stops it (default 20 s). */
  stallMs?: number;
  /** Poll interval of the worker (default 150 ms). */
  pollMs?: number;
}>;

type WorkerSnapshot = Readonly<{
  ready: boolean;
  failed: string | undefined;
  state: string;
  replayIndex: number;
  total: number;
  seeking: boolean;
  difference: boolean;
  differenceDetail?: unknown;
  warnings?: readonly string[];
  tailCut?: TailCut;
}>;
type WorkerWindow = {
  __craftReplayWorker?: {
    snapshot(): WorkerSnapshot;
    advanceTo(index: number): void;
    seekTo?(index: number): void;
  };
};

const UNPROVEN = '[Interaction non prouvée]';

export function createSuiteReplayer(options: SuiteReplayerOptions): SuiteReplayer {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const stallMs = options.stallMs ?? 20_000;
  const pollMs = options.pollMs ?? 150;
  // One browser at a time: replays share the dashboard and the machine.
  let queue: Promise<unknown> = Promise.resolve();
  return (sessionId) => {
    const run = queue.then(() => replay(sessionId), () => replay(sessionId));
    queue = run.catch(() => undefined);
    return run;
  };

  async function replay(sessionId: string): Promise<SuiteReplayResult> {
    const startedAt = Date.now();
    const deadline = startedAt + timeoutMs;
    let last: WorkerSnapshot | undefined;
    const result = (status: SuiteReplayStatus, extra: Partial<Pick<SuiteReplayResult, 'message' | 'difference'>> = {}): SuiteReplayResult => {
      const notes = last?.warnings ?? [];
      return {
        sessionId,
        status,
        replayIndex: last?.replayIndex ?? 0,
        total: last?.total ?? 0,
        ...extra,
        unprovenInteractions: notes.filter((note) => note.startsWith(UNPROVEN)),
        notes,
        ...(last?.tailCut ? { tailCut: last.tailCut } : {}),
        durationMs: Date.now() - startedAt,
      };
    };
    let playwright: PlaywrightModule;
    try {
      playwright = await (options.loadPlaywright ?? loadPlaywright)();
    } catch (error) {
      return result('unavailable', { message: `Playwright est introuvable : installe-le pour rejouer (${message(error)}).` });
    }
    let browser: Awaited<ReturnType<typeof launch>>;
    try {
      browser = await launch(playwright);
    } catch (error) {
      return result('unavailable', { message: message(error) });
    }
    try {
      const context = await browser.newContext({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
      const page = await context.newPage();
      const url = new URL(options.dashboardUrl);
      url.searchParams.set('replay-worker', '1');
      url.searchParams.set('replay-state', 'recomputed');
      url.searchParams.set('replay-mode', 'interaction');
      url.hash = `#/sessions/${encodeURIComponent(sessionId)}`;
      await page.goto(url.href, { waitUntil: 'domcontentloaded' });

      for (;;) {
        last = await snapshot(page);
        if (last?.failed !== undefined) return result('failed', { message: last.failed });
        if (last?.ready) break;
        if (Date.now() > deadline) return result('timeout', { message: 'le replay n’est pas prêt' });
        await sleep(pollMs);
      }
      const total = last.total;
      const seeks = await page.evaluate((target: number) => {
        const worker = (window as unknown as WorkerWindow).__craftReplayWorker;
        if (worker?.seekTo) {
          worker.seekTo(target);
          return true;
        }
        worker?.advanceTo(target);
        return false;
      }, total);
      if (!seeks) last = { ...last, warnings: [...(last.warnings ?? []), 'Dashboard sans seekTo : rejoué en lecture continue.'] };

      let progress = { index: last.replayIndex, at: Date.now() };
      for (;;) {
        await sleep(pollMs);
        const current = await snapshot(page);
        if (!current) continue;
        last = current;
        if (current.failed !== undefined) return result('failed', { message: current.failed });
        if (current.difference) return result('diverged', { difference: current.differenceDetail ?? null });
        if (current.replayIndex >= current.total && !current.seeking) return result('completed');
        if (current.replayIndex !== progress.index) progress = { index: current.replayIndex, at: Date.now() };
        else if (Date.now() - progress.at > stallMs)
          return result('stalled', { message: `aucune action depuis ${Math.round(stallMs / 1000)} s (action ${current.replayIndex} sur ${current.total}, état ${current.state})` });
        if (Date.now() > deadline) return result('timeout', { message: `durée maximale atteinte (action ${current.replayIndex} sur ${current.total})` });
      }
    } catch (error) {
      return result('failed', { message: message(error) });
    } finally {
      await browser.close().catch(() => undefined);
    }
  }
}

function snapshot(page: Page): Promise<WorkerSnapshot | undefined> {
  return page
    .evaluate(() => (window as unknown as WorkerWindow).__craftReplayWorker?.snapshot())
    .catch(() => undefined) as Promise<WorkerSnapshot | undefined>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function message(error: unknown): string {
  return error instanceof Error ? (error.message.split('\n')[0] ?? error.message) : String(error);
}

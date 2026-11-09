import type { BrowserContext, Frame, Page } from '@playwright/test';
import {
  readWorker,
  replayFrameLocator,
  seekWorker,
  settleReplayFrame,
  waitForAdvance,
  waitForWorker,
  workerPlan,
  workerUrl,
  type ReplayPlanPoint,
  type TailCut,
  type WorkerSnapshot,
} from './worker-driver.js';

/**
 * Replays one session of a golden set the way a regression suite needs it:
 * the code under test recomputes every state it can (`replay-state=recomputed`)
 * and the replay stops on the first one it no longer produces; the replay is
 * brought to each moment of the capture plan one action at a time and paused
 * there, so a picture is of the same moment on every run; the replayed page
 * is made still before it is measured and photographed.
 *
 * The evidence of a moment is its layout digest (boxes, closed list of styles)
 * first, its picture second: a picture is for a person, the digest is what a
 * comparison reads. The digest is measured by the caller's `measure`
 * (`collectLayoutDigest` of `@craft-ts/style-testing/digest`): this package
 * sits below it in the graph and cannot import it.
 */
export type GoldenCapture = Readonly<{
  replayIndex: number;
  reasons: readonly string[];
  offsetMs: number;
  eventId?: string;
  participantId?: string;
  png: Buffer;
  /** What `measure` returned for the replayed page; absent without `measure`. */
  digest?: unknown;
}>;

export type GoldenReplayStatus =
  /** Every action ran and every recomputed state matched. */
  | 'completed'
  /** The code no longer produces a recorded state (or call): a regression, or a stale session. */
  | 'diverged'
  /** The replay could not run (session not replayable, page error). */
  | 'failed'
  /** No action completed for `stallMs`. */
  | 'stalled'
  | 'timeout';

export type GoldenReplayResult = Readonly<{
  sessionId: string;
  status: GoldenReplayStatus;
  message?: string;
  /** The gap, when `diverged`: the recorded and live values of the states in cause. */
  difference?: WorkerSnapshot['differenceDetail'];
  /**
   * Actions replayed by invoking their methods because their element was not
   * found (`[Interaction non prouvée]`): their handlers were not proven.
   */
  unprovenInteractions: readonly string[];
  /** Every note of the replay (unpaired observations, fallbacks, divergences), to read a failure. */
  notes: readonly string[];
  /** Actions run when the replay stopped. */
  replayIndex: number;
  total: number;
  /** The end of the recording left out (never reached, never compared). */
  tailCut?: TailCut;
  captures: readonly GoldenCapture[];
  /** What was pinned, so two results are only compared under the same conditions. */
  determinism: Readonly<{ seed: number; reducedMotion: true; stillness: true; browser: string }>;
}>;

export type GoldenReplayOptions = Readonly<{
  dashboardUrl: string;
  sessionId: string;
  /** Most moments photographed (default 20). */
  maxPoints?: number;
  /** Whole replay, in ms (default 120 s). */
  timeoutMs?: number;
  /** No action for this long stops the replay (default 20 s). */
  stallMs?: number;
  /** DOM quiet time before a capture (default 400 ms), and the most it waits (default 4 s). */
  quietMs?: number;
  maxWaitMs?: number;
  /** Seed of `Math.random` in the replayed page. */
  seed?: number;
  /** `'recorded'` replays as the dashboard does (no state check): only for comparison. */
  stateSource?: 'recorded' | 'recomputed';
  /**
   * `'interaction'` (default) dispatches each recorded action on its element:
   * the app's handlers run and must make the recorded calls. `'invocation'`
   * calls the recorded methods directly (a click that lost its handler passes).
   */
  replayMode?: 'invocation' | 'interaction';
  /** Measures the replayed page at each moment (its layout digest). */
  measure?: (frame: Frame) => Promise<unknown>;
  /** Receives the console of the dashboard and of the replayed pages, to read a failure. */
  debug?: (line: string) => void;
}>;

export const GOLDEN_REPLAY_SEED = 0x2f6e2b1;

/**
 * The dashboard's cues over the replayed page (a tab's veil — « Onglet
 * fermé », « En pause » —, the click marker) are marked `data-replay-cue`:
 * they are the replay's, not the page's, and stay out of its pictures.
 */
export const HIDE_REPLAY_CUES = '[data-replay-cue] { visibility: hidden !important; }';

/**
 * Makes the replayed page still, and only it: the dashboard keeps its own
 * clock and random, which the synchronisation of the tabs relies on.
 * Animations end at once, transitions do not run, carets do not blink, and
 * `Math.random` is seeded. The recorded clock and the recorded random of the
 * Craft runtime are the replay's own business.
 */
export function stillReplayedPageScript(input: Readonly<{ dashboardOrigin: string; seed: number }>): string {
  return `(() => {
  if (window === window.top || location.origin === ${JSON.stringify(input.dashboardOrigin)}) return;
  let state = ${input.seed >>> 0} || 1;
  Math.random = () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0x100000000;
  };
  const css = '*, *::before, *::after { animation-delay: -1ms !important; animation-duration: 1ms !important; animation-iteration-count: 1 !important; transition-delay: 0s !important; transition-duration: 0s !important; caret-color: transparent !important; scroll-behavior: auto !important; }';
  const install = () => {
    const style = document.createElement('style');
    style.setAttribute('data-craft-golden-still', '');
    style.textContent = css;
    document.head.appendChild(style);
  };
  if (document.head) install();
  else document.addEventListener('DOMContentLoaded', install, { once: true });
})();`;
}

export async function replayGoldenSession(
  context: BrowserContext,
  options: GoldenReplayOptions,
): Promise<GoldenReplayResult> {
  const maxPoints = options.maxPoints ?? 20;
  const deadline = Date.now() + (options.timeoutMs ?? 120_000);
  const stallMs = options.stallMs ?? 20_000;
  const settle = { quietMs: options.quietMs ?? 400, maxWaitMs: options.maxWaitMs ?? 4_000 };
  const seed = options.seed ?? GOLDEN_REPLAY_SEED;
  const dashboardOrigin = new URL(options.dashboardUrl).origin;
  const determinism = {
    seed,
    reducedMotion: true as const,
    stillness: true as const,
    browser: context.browser()?.version() ?? 'unknown',
  };
  const captures: GoldenCapture[] = [];
  const result = (
    status: GoldenReplayStatus,
    snapshot: WorkerSnapshot | undefined,
    extra: Partial<Pick<GoldenReplayResult, 'message' | 'difference'>> = {},
  ): GoldenReplayResult => ({
    sessionId: options.sessionId,
    status,
    ...extra,
    unprovenInteractions: (snapshot?.warnings ?? []).filter((warning) => warning.startsWith('[Interaction non prouvée]')),
    notes: snapshot?.warnings ?? [],
    replayIndex: snapshot?.replayIndex ?? 0,
    total: snapshot?.total ?? 0,
    ...(snapshot?.tailCut ? { tailCut: snapshot.tailCut } : {}),
    captures,
    determinism,
  });

  await context.addInitScript(stillReplayedPageScript({ dashboardOrigin, seed }));
  const page = await context.newPage();
  const debug = options.debug;
  if (debug) page.on('console', (message) => debug(`${message.type()}: ${message.text()}`));
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(
      workerUrl(options.dashboardUrl, {
        hash: `#/sessions/${encodeURIComponent(options.sessionId)}`,
        stateSource: options.stateSource ?? 'recomputed',
        replayMode: options.replayMode ?? 'interaction',
      }),
      { waitUntil: 'domcontentloaded' },
    );
    // A session where the person did nothing (the page opened, or loaded
    // again by the dev server) has no action: the dashboard is ready with
    // none and never says « ready ». Once that holds for a second, the
    // session replayed what it had: nothing. Its one moment is the page as
    // it opened, so that a change to what that page shows is still seen.
    let emptySince: number | undefined;
    const ready = await waitForWorker(
      page,
      (snapshot) => {
        const empty = snapshot.state === 'ready' && snapshot.total === 0;
        emptySince = empty ? (emptySince ?? Date.now()) : undefined;
        return snapshot.ready || snapshot.failed !== undefined || (emptySince !== undefined && Date.now() - emptySince >= 1_000);
      },
      deadline,
    );
    if (!ready) return result('timeout', await readWorker(page), { message: 'le replay n’est pas prêt' });
    if (ready.failed !== undefined) return result('failed', ready, { message: ready.failed });
    if (!ready.ready) {
      const opened = await captureOpenedPage(page, ready, deadline, settle, options.measure);
      if (opened) captures.push(opened);
      return result('completed', ready);
    }
    await fitRecordedViewport(page, ready, deadline);

    const plan = [...(await workerPlan(page, maxPoints))].sort((a, b) => a.replayIndex - b.replayIndex);
    // The last moment is the end: the state recomputed after the last action is checked too.
    const moments: (ReplayPlanPoint | { replayIndex: number; end: true })[] = [...plan];
    if ((plan.at(-1)?.replayIndex ?? -1) < ready.total) moments.push({ replayIndex: ready.total, end: true });

    let last: WorkerSnapshot = ready;
    for (const moment of moments) {
      if (moment.replayIndex > last.replayIndex && !(await seekWorker(page, moment.replayIndex)))
        return result('failed', last, { message: 'ce dashboard ne sait pas s’arrêter à une action (seekTo absent)' });
      const outcome = await waitForAdvance(page, moment.replayIndex, { stallMs, deadline });
      if (outcome.snapshot) last = outcome.snapshot;
      if (outcome.kind === 'difference')
        return result('diverged', outcome.snapshot, { difference: outcome.snapshot.differenceDetail });
      if (outcome.kind === 'failed') return result('failed', outcome.snapshot, { message: outcome.snapshot.failed });
      if (outcome.kind === 'stalled')
        return result('stalled', outcome.snapshot, { message: `aucune action depuis ${stallMs / 1000} s` });
      if (outcome.kind === 'timeout') return result('timeout', outcome.snapshot, { message: 'durée maximale atteinte' });
      if ('end' in moment) break;
      const capture = await captureMoment(page, moment, last, settle, options.measure);
      if (capture) captures.push(capture);
    }
    return result('completed', last);
  } catch (error) {
    return result('failed', await readWorker(page), { message: error instanceof Error ? error.message.split('\n')[0] : String(error) });
  } finally {
    await page.close().catch(() => undefined);
  }
}

/**
 * The page a session without action opened on, as its only moment. Not a
 * failure when there is none to take: the session still replayed all it had.
 */
async function captureOpenedPage(
  page: Page,
  snapshot: WorkerSnapshot,
  deadline: number,
  settle: Readonly<{ quietMs: number; maxWaitMs: number }>,
  measure: GoldenReplayOptions['measure'],
): Promise<GoldenCapture | undefined> {
  try {
    await fitRecordedViewport(page, snapshot, deadline);
    return await captureMoment(page, { replayIndex: 0, reasons: ['opened'], offsetMs: 0 }, snapshot, settle, measure);
  } catch {
    return undefined;
  }
}

async function captureMoment(
  page: Page,
  point: ReplayPlanPoint,
  snapshot: WorkerSnapshot,
  settle: Readonly<{ quietMs: number; maxWaitMs: number }>,
  measure: GoldenReplayOptions['measure'],
): Promise<GoldenCapture | undefined> {
  const participantId = point.participantId ?? snapshot.activeParticipantId;
  const frameLocator = replayFrameLocator(page, participantId);
  if (!(await frameLocator.isVisible())) return undefined;
  const frame = await settleReplayFrame(frameLocator, settle);
  if (!frame) return undefined;
  const png = await frameLocator.screenshot({ type: 'png', animations: 'disabled', caret: 'hide', style: HIDE_REPLAY_CUES });
  return {
    replayIndex: point.replayIndex,
    reasons: point.reasons,
    offsetMs: point.offsetMs,
    ...(point.eventId === undefined ? {} : { eventId: point.eventId }),
    ...(participantId === undefined ? {} : { participantId }),
    png,
    ...(measure ? { digest: await measure(frame) } : {}),
  };
}

/** The recorded viewport at scale 1: a window big enough that the page is not shrunk. */
async function fitRecordedViewport(page: Page, snapshot: WorkerSnapshot, deadline: number): Promise<void> {
  if (!snapshot.viewport) return;
  await page.setViewportSize({
    width: Math.min(3840, snapshot.viewport.width + 560),
    height: Math.min(2400, snapshot.viewport.height + 480),
  });
  await waitForWorker(page, (current) => (current.scale ?? 1) >= 0.99, Math.min(deadline, Date.now() + 4_000));
}

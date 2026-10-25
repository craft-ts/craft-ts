import type { Browser, BrowserContext, Page } from '@playwright/test';
import type { BaselineReplay } from './finalize.js';

/** What the dashboard's worker surface answers; see its `replay-worker.ts`. */
type WorkerSnapshot = Readonly<{
  ready: boolean;
  failed: string | undefined;
  state: string;
  replayIndex: number;
  total: number;
  seeking: boolean;
  difference: boolean;
  differenceDetail?: unknown;
}>;
type WorkerWindow = { __craftReplayWorker?: { snapshot(): WorkerSnapshot; advanceTo(index: number): void } };

export const BASELINE_REPLAY_TIMEOUT_MS = 60_000;
/** No action completed for this long: the replayed page stopped answering. */
const STALL_MS = 10_000;

/**
 * Replays the latest green reference of a test on the current build, through
 * the dashboard's worker contract (`?replay-worker=1`, `__craftReplayWorker`)
 * as the thumbnail worker does — never through its buttons or labels.
 */
export async function replayBaselineInDashboard(input: Readonly<{
  browser: Browser;
  serverUrl: string;
  dashboardUrl: string;
  testId: string;
  project: string;
  baselineFile: string;
  timeoutMs?: number;
}>): Promise<BaselineReplay> {
  const timeoutMs = input.timeoutMs ?? BASELINE_REPLAY_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  let context: BrowserContext | undefined;
  try {
    const base = input.serverUrl.replace(/\/$/, '');
    const listing = await fetch(`${base}/e2e-sessions`);
    if (!listing.ok) return { status: 'unavailable', message: `le log-server répond HTTP ${listing.status}` };
    const { sessions = [] } = await listing.json() as { sessions?: Array<{ root: number; id: string; project: string }> };
    const history = sessions.find((item) => item.id === input.testId && item.project === input.project);
    if (!history) return { status: 'unavailable', message: 'le log-server ne sert pas l’historique de ce test' };
    const source = `${base}/e2e-sessions/${encodeURIComponent(input.testId)}/${encodeURIComponent(input.project)}/${encodeURIComponent(input.baselineFile)}?root=${history.root}&decompress=1`;
    const url = new URL(input.dashboardUrl);
    url.searchParams.set('replay-worker', '1');
    url.hash = `#/e2e-replay?${new URLSearchParams({ source })}`;
    context = await input.browser.newContext();
    const page = await context.newPage();
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: remaining(deadline) });
    const ready = await waitForSnapshot(page, (snapshot) => snapshot.ready || snapshot.failed !== undefined, deadline);
    if (!ready) return { status: 'timeout', message: `référence non prête après ${timeoutMs / 1000} s` };
    if (ready.failed !== undefined) return { status: 'error', message: ready.failed };
    await page.evaluate((index) => (window as unknown as WorkerWindow).__craftReplayWorker!.advanceTo(index), ready.total);
    let progress = { index: ready.replayIndex, at: Date.now() };
    let last = ready;
    const end = await waitForSnapshot(page, (snapshot) => {
      last = snapshot;
      if (snapshot.replayIndex !== progress.index) progress = { index: snapshot.replayIndex, at: Date.now() };
      return snapshot.difference || snapshot.failed !== undefined || (!snapshot.seeking && snapshot.replayIndex >= snapshot.total) || Date.now() - progress.at > STALL_MS;
    }, deadline);
    if (!end) return { status: 'timeout', message: `référence arrêtée à l’étape ${last.replayIndex} sur ${last.total} après ${timeoutMs / 1000} s` };
    if (!end.difference && end.failed === undefined && end.replayIndex < end.total)
      return { status: 'timeout', message: `la page rejouée ne répond plus depuis ${STALL_MS / 1000} s à l’étape ${end.replayIndex} sur ${end.total}` };
    if (end.difference) return { status: 'diverged', difference: end.differenceDetail ?? null };
    if (end.failed !== undefined) return { status: 'error', message: end.failed };
    return { status: 'completed' };
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) };
  } finally {
    await context?.close().catch(() => undefined);
  }
}

async function waitForSnapshot(page: Page, done: (snapshot: WorkerSnapshot) => boolean, deadline: number): Promise<WorkerSnapshot | undefined> {
  for (;;) {
    const snapshot = await page.evaluate(() => (window as unknown as WorkerWindow).__craftReplayWorker?.snapshot()).catch(() => undefined);
    if (snapshot && done(snapshot)) return snapshot;
    if (Date.now() >= deadline) return undefined;
    await page.waitForTimeout(Math.min(250, remaining(deadline)));
  }
}

function remaining(deadline: number): number { return Math.max(1, deadline - Date.now()); }

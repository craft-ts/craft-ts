import type { Browser, BrowserContext } from '@playwright/test';
import type { BaselineReplay } from './finalize.js';
import { advanceWorker, remaining, waitForAdvance, waitForWorker, workerUrl } from './suite/worker-driver.js';

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
    context = await input.browser.newContext();
    const page = await context.newPage();
    // A method that no longer changes the state must show as a gap, not be
    // hidden by restoring the recorded state.
    const url = workerUrl(input.dashboardUrl, { hash: `#/e2e-replay?${new URLSearchParams({ source })}`, verifyState: true });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: remaining(deadline) });
    const ready = await waitForWorker(page, (snapshot) => snapshot.ready || snapshot.failed !== undefined, deadline);
    if (!ready) return { status: 'timeout', message: `référence non prête après ${timeoutMs / 1000} s` };
    if (ready.failed !== undefined) return { status: 'error', message: ready.failed };
    await advanceWorker(page, ready.total);
    const end = await waitForAdvance(page, ready.total, { stallMs: STALL_MS, deadline });
    switch (end.kind) {
      case 'reached': return { status: 'completed' };
      case 'difference': return { status: 'diverged', difference: end.snapshot.differenceDetail ?? null };
      case 'failed': return { status: 'error', message: end.snapshot.failed ?? 'échec du replay' };
      case 'stalled':
        return { status: 'timeout', message: `la page rejouée ne répond plus depuis ${STALL_MS / 1000} s à l’étape ${end.snapshot?.replayIndex ?? 0} sur ${end.snapshot?.total ?? ready.total}` };
      default:
        return { status: 'timeout', message: `référence arrêtée à l’étape ${end.snapshot?.replayIndex ?? 0} sur ${end.snapshot?.total ?? ready.total} après ${timeoutMs / 1000} s` };
    }
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) };
  } finally {
    await context?.close().catch(() => undefined);
  }
}

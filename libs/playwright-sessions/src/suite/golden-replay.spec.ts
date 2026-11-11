import type { BrowserContext } from '@playwright/test';
import { describe, expect, it } from 'vitest';
import { replayGoldenSession } from './golden-replay.js';

/** A context whose one page shows the dashboard's worker as `snapshot` says. */
function fakeContext(snapshot: () => Record<string, unknown>): BrowserContext {
  const page = {
    on: () => undefined,
    emulateMedia: async () => undefined,
    goto: async () => undefined,
    evaluate: async () => snapshot(),
    waitForTimeout: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
    close: async () => undefined,
  };
  return {
    addInitScript: async () => undefined,
    newPage: async () => page,
    browser: () => ({ version: () => 'test' }),
  } as unknown as BrowserContext;
}

const worker = (extra: Record<string, unknown>) => ({
  ready: false,
  failed: undefined,
  state: 'loading',
  replayIndex: 0,
  total: 0,
  seeking: false,
  difference: false,
  differenceDetail: undefined,
  scale: 1,
  activeParticipantId: undefined,
  viewport: undefined,
  warnings: [],
  tailCut: undefined,
  ...extra,
});

describe('replayGoldenSession', () => {
  it('calls a session without any action replayed, at once, with no moment when its page cannot be seen', async () => {
    const startedAt = Date.now();
    const result = await replayGoldenSession(fakeContext(() => worker({ state: 'ready', total: 0 })), {
      dashboardUrl: 'http://localhost:4210/',
      sessionId: 's',
      timeoutMs: 20_000,
    });
    expect(result).toMatchObject({ status: 'completed', replayIndex: 0, total: 0, captures: [] });
    // A second of grace, not the whole wait.
    expect(Date.now() - startedAt).toBeLessThan(5_000);
  });

  it('photographs the page a session without any action opened on, as its one moment', async () => {
    const frame = { evaluate: async () => ({ title: 'Accueil' }) };
    const context = fakeContext(() => worker({ state: 'ready', total: 0 }));
    const page = await context.newPage();
    Object.assign(page, {
      locator: () => ({
        count: async () => 1,
        first: () => ({
          isVisible: async () => true,
          elementHandle: async () => ({ contentFrame: async () => frame }),
          screenshot: async () => Buffer.from('png'),
        }),
      }),
    });
    const result = await replayGoldenSession(context, {
      dashboardUrl: 'http://localhost:4210/',
      sessionId: 's',
      timeoutMs: 20_000,
      quietMs: 1,
      measure: async (measured) => measured.evaluate(() => undefined),
    });
    expect(result).toMatchObject({ status: 'completed', total: 0, captures: [{ replayIndex: 0, reasons: ['opened'], digest: { title: 'Accueil' } }] });
  });

  it('still waits for a dashboard that has not loaded the session', async () => {
    const result = await replayGoldenSession(fakeContext(() => worker({ state: 'loading', total: 0 })), {
      dashboardUrl: 'http://localhost:4210/',
      sessionId: 's',
      timeoutMs: 1_500,
    });
    expect(result).toMatchObject({ status: 'timeout', message: 'le replay n’est pas prêt' });
  });
});

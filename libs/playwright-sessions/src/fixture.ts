import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { normalizeSessionTrace } from '@craft-ts/session-trace';
import { parseTestCraftSession } from './contract.js';
import { recordRun, readBaselines } from './history-store.js';
import { compareSessionTraces, renderSessionTraceComparison } from '@craft-ts/session-trace';
import { resolveCraftSessionMode } from './mode.js';
import { join } from 'node:path';

export type CraftSessionsOptions = Readonly<{
  store?: string;
  serverUrl?: string;
  dashboardUrl?: string;
  budgetBytes?: Readonly<{ session: number; test: number }>;
  update?: 'on-success' | 'never';
  replayBaselineOnFailure?: boolean;
}>;
type Marker = Readonly<{ id: string; test: Readonly<Record<string, unknown>> }>;
type CraftSessionsApi = Readonly<{
  newContext(options?: Parameters<import('@playwright/test').Browser['newContext']>[0]): Promise<BrowserContext>;
  step<T>(label: string, body: () => Promise<T>): Promise<T>;
}>;
type Fixtures = { craftSessionContract: ReturnType<typeof parseTestCraftSession>; sessionMarker: Marker | undefined; craftSessions: CraftSessionsApi };
type WorkerFixtures = { craftSessionsOptions: CraftSessionsOptions };

export const test = base.extend<Fixtures, WorkerFixtures>({
  craftSessionsOptions: [{}, { scope: 'worker', option: true }],
  sessionMarker: [async ({ context, craftSessionContract, craftSessionsOptions }, use, testInfo) => {
    const mode = resolveCraftSessionMode(process.env, craftSessionsOptions);
    if (mode === 'off' || craftSessionContract.capture === 'none') { await use(undefined); return; }
    const marker: Marker = {
      id: randomUUID(),
      test: {
        id: parseTestCraftSession(testInfo).id,
        title: testInfo.title.slice(0, 512),
        specFile: relative(process.cwd(), testInfo.file).slice(0, 512),
        project: testInfo.project.name.slice(0, 512),
        retry: testInfo.retry,
        gitSha: gitSha(),
      },
    };
    await context.addInitScript((value) => {
      (globalThis as typeof globalThis & { __CRAFT_E2E_SESSION__?: Marker }).__CRAFT_E2E_SESSION__ = value;
    }, marker);
    await use(marker);
  }, { auto: true }],
  craftSessionContract: [async ({ craftSessionsOptions }, use, testInfo) => {
    void craftSessionsOptions;
    const contract = parseTestCraftSession(testInfo);
    await use(contract);
  }, { auto: true }],
  craftSessions: [async ({ browser, context, page, sessionMarker, craftSessionContract, craftSessionsOptions }, use, testInfo) => {
    const pages = new Set<Page>([page]);
    const contexts = new Set<BrowserContext>([context]);
    const api: CraftSessionsApi = {
      async newContext(options) {
        const next = await browser.newContext(options);
        contexts.add(next);
        if (sessionMarker) await next.addInitScript((value) => {
          (globalThis as typeof globalThis & { __CRAFT_E2E_SESSION__?: Marker }).__CRAFT_E2E_SESSION__ = value;
        }, sessionMarker);
        next.on('page', (newPage) => pages.add(newPage));
        return next;
      },
      async step(label, body) {
        for (const existingContext of contexts) for (const existingPage of existingContext.pages())
          await existingPage.evaluate((text) => (globalThis as typeof globalThis & { __craftDebugSession?: { mark(label: string): void } }).__craftDebugSession?.mark(text), label).catch(() => undefined);
        return base.step(label, body);
      },
    };
    await use(api);
    for (const existingContext of contexts) for (const existingPage of existingContext.pages()) {
      pages.add(existingPage);
      const finish = await existingPage.evaluate(async () => {
        const api = (globalThis as typeof globalThis & { __craftDebugSession?: { id(): string; finish(): Promise<string> } }).__craftDebugSession;
        if (!api) return undefined;
        return { id: api.id(), result: await api.finish() };
      }).catch(() => undefined);
      if (!sessionMarker) continue;
      if (!finish) {
        if (craftSessionContract.capture === 'required' && testInfo.status === 'passed')
          throw new Error(`${testInfo.title}: aucune capture craft n’a été installée dans la page.`);
        continue;
      }
      const serverUrl = craftSessionsOptions.serverUrl ?? process.env['CRAFT_E2E_SESSION_SERVER_ORIGIN'] ?? 'http://127.0.0.1:4321';
      const response = await getSessionWithRetry(serverUrl, finish.id, String(sessionMarker.test['id']));
      if (!response && craftSessionContract.capture === 'required' && testInfo.status === 'passed')
        throw new Error(`${testInfo.title}: la session craft ${finish.id} est introuvable sur ${serverUrl}.`);
      if (response) {
        const session = response;
        const trace = normalizeSessionTrace(session as never);
        const mode = resolveCraftSessionMode(process.env, craftSessionsOptions);
        const historyDir = craftSessionsOptions.store ? join(craftSessionsOptions.store, String(sessionMarker.test['id']), testInfo.project.name) : join(testInfo.project.testDir, '__sessions__', String(sessionMarker.test['id']), testInfo.project.name);
        if (mode === 'update' && testInfo.status === 'passed') {
          const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0;
          const bytes = gzipSync(JSON.stringify(session)).byteLength;
          if (craftSessionsOptions.budgetBytes && bytes > craftSessionsOptions.budgetBytes.session)
            throw new Error(`${testInfo.title}: export de session (${bytes} octets) au-dessus du budget.`);
          recordRun(historyDir, {
            id: String(sessionMarker.test['id']), project: testInfo.project.name,
            keep: craftSessionContract.keep, session, trace,
            meta: {
              recordedAt: new Date().toISOString(), durationMs: testInfo.duration,
              retry: testInfo.retry, gitSha: String(sessionMarker.test['gitSha']), dirty,
              title: testInfo.title, specFile: String(sessionMarker.test['specFile']),
              environment: { browser: testInfo.project.use['browserName']?.toString() ?? 'chromium', browserVersion: browser.version(), platform: process.platform },
            },
          });
        } else if (mode !== 'off' && testInfo.status !== 'passed') {
          const baselines = readBaselines(historyDir);
          const comparison = compareSessionTraces(trace, baselines.map((baseline) => normalizeSessionTrace(baseline.session as never)));
          if (baselines.length) {
            const markdown = renderSessionTraceComparison(comparison, { testId: String(sessionMarker.test['id']), project: testInfo.project.name });
            await testInfo.attach('craft-session-diff.md', { body: markdown, contentType: 'text/markdown' });
            await testInfo.attach('craft-session-diff.json', { body: Buffer.from(JSON.stringify(comparison, null, 2)), contentType: 'application/json' });
            if (comparison.firstDivergence) testInfo.annotations.push({ type: 'craft-session-divergence', description: JSON.stringify(comparison.firstDivergence) });
            if (craftSessionsOptions.replayBaselineOnFailure) {
              testInfo.setTimeout(Math.max(testInfo.timeout, 120_000));
              const replayReport = await replayLatestBaseline({
                browser,
                serverUrl,
                dashboardUrl: craftSessionsOptions.dashboardUrl ?? process.env['CRAFT_E2E_SESSION_DASHBOARD_URL'] ?? 'http://localhost:4210/',
                testId: String(sessionMarker.test['id']),
                project: testInfo.project.name,
              });
              await testInfo.attach('craft-session-baseline-replay.md', {
                body: replayReport,
                contentType: 'text/markdown',
              });
            }
          }
          await testInfo.attach('craft-session.json.gz', { body: gzipSync(JSON.stringify(session)), contentType: 'application/gzip' });
        }
      }
    }
    for (const extra of contexts) if (extra !== context) await extra.close();
  }, { auto: true }],
});

export { expect };

let cachedGitSha: string | undefined;
function gitSha(): string {
  cachedGitSha ??= execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  return cachedGitSha;
}

async function getSessionWithRetry(serverUrl: string, sessionId: string, testId: string): Promise<Record<string, unknown> | undefined> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const response = await fetch(`${serverUrl}/sessions/${sessionId}`);
      if (response.ok) return await response.json() as Record<string, unknown>;
      if (attempt === 0) {
        const list = await fetch(`${serverUrl}/sessions?testId=${encodeURIComponent(testId)}`).then((result) => result.ok ? result.json() : undefined) as { sessions?: Array<{ id?: string }> } | undefined;
        const latestId = list?.sessions?.[0]?.id;
        if (latestId) {
          const latest = await fetch(`${serverUrl}/sessions/${latestId}`);
          if (latest.ok) return await latest.json() as Record<string, unknown>;
        }
      }
    } catch { /* The app may still be posting its pagehide finish beacon. */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return undefined;
}

async function replayLatestBaseline(input: Readonly<{
  browser: import('@playwright/test').Browser;
  serverUrl: string;
  dashboardUrl: string;
  testId: string;
  project: string;
}>): Promise<string> {
  let context: BrowserContext | undefined;
  try {
    const base = input.serverUrl.replace(/\/$/, '');
    const listingResponse = await fetch(`${base}/e2e-sessions`);
    if (!listingResponse.ok) return `Référence non rejouée : le log-server répond HTTP ${listingResponse.status}.`;
    const listing = await listingResponse.json() as {
      sessions?: Array<{ root: number; id: string; project: string; runs: Array<{ file: string }> }>;
    };
    const history = listing.sessions?.find((item) => item.id === input.testId && item.project === input.project);
    const latest = history?.runs[0];
    if (!history || !latest) return 'Référence non rejouée : aucun export vert n’est disponible.';
    const source = `${base}/e2e-sessions/${encodeURIComponent(history.id)}/${encodeURIComponent(history.project)}/${encodeURIComponent(latest.file)}?root=${history.root}&decompress=1`;
    const dashboard = new URL(input.dashboardUrl);
    dashboard.hash = `#/e2e-replay?${new URLSearchParams({ source }).toString()}`;
    context = await input.browser.newContext();
    const page = await context.newPage();
    await page.goto(dashboard.toString());
    try {
      await page.waitForFunction(() => {
        const state = document.querySelector('[data-lab="detail-page"]')?.getAttribute('data-replay-state');
        if (state === 'completed' || state === 'error') return true;
        const play = document.querySelector<HTMLButtonElement>('[aria-label="Lecture à vitesse réelle"]');
        return state === 'ready' && play !== null && !play.disabled;
      }, undefined, { timeout: 30_000 });
    } catch {
      const state = await page.locator('[data-lab="detail-page"]').getAttribute('data-replay-state').catch(() => null);
      const text = (await page.locator('body').innerText().catch(() => '')).slice(0, 2_000);
      return `Référence non prête (état ${state ?? 'absent'}). Vérifier la route dashboard et le replay.\n\n${text}`;
    }
    let state = await page.locator('[data-lab="detail-page"]').getAttribute('data-replay-state');
    if (state === 'ready') {
      await page.getByRole('button', { name: 'Lecture à vitesse réelle' }).click();
      try {
        await page.waitForFunction(() => {
          const replayState = document.querySelector('[data-lab="detail-page"]')?.getAttribute('data-replay-state');
          return replayState === 'completed' || replayState === 'error';
        }, undefined, { timeout: 60_000 });
      } catch {
        const text = (await page.locator('body').innerText().catch(() => '')).slice(0, 2_000);
        return `Référence lancée mais non terminée.\n\n${text}`;
      }
      state = await page.locator('[data-lab="detail-page"]').getAttribute('data-replay-state');
    }
    if (state === 'completed')
      return 'La référence verte rejoue sans écart sur le build courant : le problème observé vient des données, du back ou de l’environnement.';
    const difference = await page.locator('[data-lab="diff"]').innerText().catch(() => 'Le replay de référence s’est arrêté sans détail de divergence.');
    return `La référence verte diverge sur le build courant : le front, son environnement de replay ou un adaptateur a changé.\n\n${difference}`;
  } catch (error) {
    return `Référence non classée : ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    await context?.close().catch(() => undefined);
  }
}

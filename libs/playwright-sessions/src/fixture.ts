import { randomUUID } from 'node:crypto';
import { join, relative } from 'node:path';
import { test as base, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { SessionTraceMarker } from '@craft-ts/session-trace';
import { replayBaselineInDashboard, BASELINE_REPLAY_TIMEOUT_MS } from './baseline-replay.js';
import { parseTestCraftSession, type CraftSessionContract } from './contract.js';
import { finalizeCraftSession } from './finalize.js';
import { readGitState, type GitState } from './git.js';
import { resolveCraftSessionMode } from './mode.js';

export type CraftSessionsOptions = Readonly<{
  serverUrl?: string;
  dashboardUrl?: string;
  budgetBytes?: Readonly<{ session: number; test: number }>;
  update?: 'on-success' | 'never';
  replayBaselineOnFailure?: boolean;
}>;
type Marker = Readonly<{ id: string; test: Readonly<Record<string, unknown>> }>;
type CraftSessionsApi = Readonly<{
  newContext(options?: Parameters<Browser['newContext']>[0]): Promise<BrowserContext>;
  step<T>(label: string, body: () => Promise<T>): Promise<T>;
  /** UUID of this test attempt, also stored in the session's test metadata. */
  runId: string | undefined;
}>;
type Fixtures = { craftSessionContract: CraftSessionContract; craftSessions: CraftSessionsApi };
type WorkerFixtures = { craftSessionsOptions: CraftSessionsOptions; craftSessionGit: GitState };
type PageSessionApi = { __craftDebugSession?: { id(): string; finish(): Promise<string>; mark(label: string): void } };

const SESSION_READY_BINDING = '__craftE2eSessionReady';

export const test = base.extend<Fixtures, WorkerFixtures>({
  craftSessionsOptions: [{}, { scope: 'worker', option: true }],
  craftSessionGit: [async ({}, use) => { await use(readGitState()); }, { scope: 'worker' }],
  craftSessionContract: [async ({}, use, testInfo) => { await use(parseTestCraftSession(testInfo)); }, { auto: true }],
  craftSessions: [async ({ browser, context, page, craftSessionContract, craftSessionsOptions, craftSessionGit }, use, testInfo) => {
    const mode = resolveCraftSessionMode(process.env, craftSessionsOptions);
    const captured = mode !== 'off' && craftSessionContract.capture !== 'none';
    const runId = captured ? randomUUID() : undefined;
    const marker: Marker | undefined = runId ? {
      id: randomUUID(),
      test: {
        id: craftSessionContract.id,
        title: testInfo.title.slice(0, 512),
        specFile: relative(process.cwd(), testInfo.file).slice(0, 512),
        project: testInfo.project.name.slice(0, 512),
        retry: testInfo.retry,
        gitSha: craftSessionGit.sha,
        runId,
      },
    } : undefined;
    const contexts = new Set<BrowserContext>();
    // Effective ids, kept as soon as a page knows them: a page the test closes
    // before the end still has its session found.
    const pageIds = new Map<Page, string>();
    const markers: SessionTraceMarker[] = [];
    const attach = async (target: BrowserContext) => {
      contexts.add(target);
      if (!marker) return;
      await target.addInitScript((value) => {
        (globalThis as typeof globalThis & { __CRAFT_E2E_SESSION__?: Marker }).__CRAFT_E2E_SESSION__ = value;
      }, marker);
      await target.exposeBinding(SESSION_READY_BINDING, ({ page: source }, id: unknown) => {
        if (typeof id === 'string') pageIds.set(source, id);
      });
    };
    await attach(context);
    const api: CraftSessionsApi = {
      runId,
      async newContext(options) {
        const next = await browser.newContext(options);
        await attach(next);
        return next;
      },
      async step(label, body) {
        markers.push({ label: label.slice(0, 512), at: Date.now() });
        for (const target of contexts) for (const existingPage of target.pages())
          await existingPage.evaluate((text) => (globalThis as typeof globalThis & PageSessionApi).__craftDebugSession?.mark(text), label).catch(() => undefined);
        return base.step(label, body);
      },
    };
    await use(api);

    try {
      if (!marker) return;
      // Every open page finishes before any lookup, so each session is complete.
      const sessionIds = [...pageIds.values()];
      for (const target of contexts) for (const openPage of target.pages()) {
        const id = await openPage.evaluate(async () => {
          const session = (globalThis as typeof globalThis & PageSessionApi).__craftDebugSession;
          if (!session) return undefined;
          await session.finish();
          return session.id();
        }).catch(() => undefined);
        if (id) sessionIds.push(id);
      }
      const serverUrl = craftSessionsOptions.serverUrl ?? process.env['CRAFT_E2E_SESSION_SERVER_ORIGIN'] ?? 'http://127.0.0.1:4321';
      const dashboardUrl = craftSessionsOptions.dashboardUrl ?? process.env['CRAFT_E2E_SESSION_DASHBOARD_URL'] ?? 'http://localhost:4210/';
      const replayBaseline = craftSessionsOptions.replayBaselineOnFailure
        ? async ({ baselineFile }: { baselineFile: string }) => {
          // Bounded, and said: the replay adds at most this much to the test.
          testInfo.setTimeout(testInfo.timeout + BASELINE_REPLAY_TIMEOUT_MS);
          return replayBaselineInDashboard({ browser, serverUrl, dashboardUrl, testId: craftSessionContract.id, project: testInfo.project.name, baselineFile });
        }
        : undefined;
      const result = await finalizeCraftSession({
        testId: craftSessionContract.id,
        project: testInfo.project.name,
        title: testInfo.title,
        contract: craftSessionContract,
        mode,
        status: testInfo.status ?? 'passed',
        sessionIds,
        serverUrl,
        historyDir: join(testInfo.project.testDir, '__sessions__', craftSessionContract.id, testInfo.project.name),
        markers,
        meta: {
          recordedAt: new Date().toISOString(), durationMs: testInfo.duration,
          retry: testInfo.retry, gitSha: craftSessionGit.sha, dirty: craftSessionGit.dirty,
          title: testInfo.title, specFile: String(marker.test['specFile']),
          environment: { browser: testInfo.project.use.browserName?.toString() ?? 'chromium', browserVersion: browser.version(), platform: process.platform },
        },
        ...(craftSessionsOptions.budgetBytes ? { budgetBytes: craftSessionsOptions.budgetBytes } : {}),
        compareUrl: (sessionId) => {
          const url = new URL(dashboardUrl);
          url.hash = `#/compare?${new URLSearchParams({ test: craftSessionContract.id, project: testInfo.project.name, run: sessionId })}`;
          return url.toString();
        },
        attach: (name, body, contentType) => testInfo.attach(name, { body, contentType }),
        annotate: (type, description) => { testInfo.annotations.push({ type, description }); },
        ...(replayBaseline ? { replayBaseline } : {}),
      });
      for (const warning of result.warnings) console.warn(`[craft-sessions] ${craftSessionContract.id}: ${warning}`);
    } finally {
      for (const extra of contexts) if (extra !== context) await extra.close();
    }
  }, { auto: true }],
});

export { expect };

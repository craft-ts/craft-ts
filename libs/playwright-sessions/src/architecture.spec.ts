import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertE2eSessionContract, findCraftSessionConfigs, type PlaywrightListing } from './architecture.js';
import { craftSession } from './contract.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); vi.restoreAllMocks(); });

type TestSpec = { title: string; id: string; keep?: number; reason?: string };
/** A workspace with one app per entry, each with its e2e folder and listing. */
function workspace(apps: Record<string, readonly TestSpec[]>) {
  const root = mkdtempSync(join(tmpdir(), 'craft-architecture-'));
  roots.push(root);
  const listings = new Map<string, PlaywrightListing>();
  for (const [app, tests] of Object.entries(apps)) {
    const testDir = join(root, app, 'e2e');
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(root, app, 'playwright.config.ts'), "export default { testDir: './e2e' };\n");
    writeFileSync(join(testDir, 'fixtures.ts'), "export { test, craftSession } from '@craft-ts/playwright-sessions';\n");
    listings.set(`${app}/playwright.config.ts`, {
      config: { rootDir: testDir, projects: [{ name: 'chromium', testDir }] },
      suites: [{ title: 'checkout.spec.ts', file: 'checkout.spec.ts', specs: tests.map((test) => ({
        title: test.title,
        tests: [{ projectName: 'chromium', annotations: [craftSession({ id: test.id, ...(test.keep ? { keep: test.keep } : {}), ...(test.reason ? { reason: test.reason } : {}) })] }],
      })) }],
    });
  }
  const check = (budgetBytes?: { session: number; test: number }) => assertE2eSessionContract({
    workspaceRoot: root, configs: [...listings.keys()], list: async (config) => listings.get(config)!, ...(budgetBytes ? { budgetBytes } : {}),
  });
  return { root, check };
}

function history(root: string, app: string, id: string, project = 'chromium', options: { keep?: number; runs?: Array<{ file: string; retry?: number; bytes?: number }>; extraFiles?: string[] } = {}) {
  const dir = join(root, app, 'e2e', '__sessions__', id, project);
  mkdirSync(dir, { recursive: true });
  const runs = options.runs ?? [{ file: 'run-1.session.json.gz' }];
  for (const run of runs) writeFileSync(join(dir, run.file), 'x'.repeat(run.bytes ?? 10));
  for (const file of options.extraFiles ?? []) writeFileSync(join(dir, file), 'x');
  writeFileSync(join(dir, 'history.json'), JSON.stringify({
    format: 'craft-e2e-session-history', schemaVersion: 1, id, project, keep: options.keep ?? 1,
    runs: runs.map((run) => ({ file: run.file, traceHash: 'h', traceSchemaVersion: 2, recordedAt: '2026-10-25T08:00:00.000Z', durationMs: 1, retry: run.retry ?? 0, gitSha: 'abc', dirty: false, title: 't', specFile: 'checkout.spec.ts', environment: {}, sizeBytes: run.bytes ?? 10 })),
  }));
  return dir;
}

describe('assertE2eSessionContract', () => {
  it('accepts the demonstration fixture and Playwright project', async () => {
    await expect(assertE2eSessionContract({ configs: ['libs/playwright-sessions/playwright.config.ts'], workspaceRoot: process.cwd() }))
      .resolves.toEqual({ warnings: [] });
  });

  it('refuses an id declared in two configs', async () => {
    const { check } = workspace({ shop: [{ title: 'paye', id: 'checkout' }], admin: [{ title: 'paye aussi', id: 'checkout' }] });
    await expect(check()).rejects.toThrow('id craftSession dupliqué "checkout"');
  });

  it('accepts the same file name in two apps with different ids', async () => {
    const { check } = workspace({ shop: [{ title: 'paye', id: 'shop.checkout' }], admin: [{ title: 'paye', id: 'admin.checkout' }] });
    await expect(check()).resolves.toEqual({ warnings: [] });
  });

  it.each([
    ['an orphan history', (root: string) => history(root, 'shop', 'renamed'), 'Historique orphelin'],
    ['an unknown project', (root: string) => history(root, 'shop', 'shop.checkout', 'firefox'), 'Projet Playwright inconnu'],
    ['a different keep', (root: string) => history(root, 'shop', 'shop.checkout', 'chromium', { keep: 2 }), 'keep de history.json différent'],
    ['an unreferenced file', (root: string) => history(root, 'shop', 'shop.checkout', 'chromium', { extraFiles: ['stray.session.json.gz'] }), 'Fichier de session non référencé'],
    ['a missing session', (root: string) => rmSync(join(history(root, 'shop', 'shop.checkout'), 'run-1.session.json.gz')), 'Session manquante'],
    ['too many runs', (root: string) => history(root, 'shop', 'shop.checkout', 'chromium', { runs: [{ file: 'run-1.session.json.gz' }, { file: 'run-2.session.json.gz' }] }), 'Trop de runs'],
    ['a history of another test', (root: string) => {
      const dir = history(root, 'shop', 'shop.checkout');
      writeFileSync(join(dir, 'history.json'), readFileSync(join(dir, 'history.json'), 'utf8').replace('"id":"shop.checkout"', '"id":"shop.other"'));
    }, 'Identité history.json incohérente'],
    ['a session over budget', (root: string) => history(root, 'shop', 'shop.checkout', 'chromium', { runs: [{ file: 'run-1.session.json.gz', bytes: 200 }] }), 'Session au-dessus du budget'],
  ])('refuses %s', async (_name, arrange, message) => {
    const { root, check } = workspace({ shop: [{ title: 'paye', id: 'shop.checkout' }] });
    arrange(root);
    await expect(check({ session: 100, test: 10_000 })).rejects.toThrow(message);
  });

  it('counts the test budget once for all its projects', async () => {
    const { root, check } = workspace({ shop: [{ title: 'paye', id: 'shop.checkout' }] });
    history(root, 'shop', 'shop.checkout', 'chromium', { runs: [{ file: 'run-1.session.json.gz', bytes: 300 }] });
    await expect(check({ session: 1_000, test: 100 })).rejects.toThrow(/Historique du test au-dessus du budget[^\n]*\n?$/);
  });

  it('only warns about a keep 1 reference recorded on a retry', async () => {
    const { root, check } = workspace({ shop: [{ title: 'paye', id: 'shop.checkout' }] });
    history(root, 'shop', 'shop.checkout', 'chromium', { runs: [{ file: 'run-1.session.json.gz', retry: 1 }] });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await check();
    expect(result.warnings).toEqual([expect.stringContaining('retry')]);
  });
});

describe('findCraftSessionConfigs', () => {
  it('finds the configs whose tests use the fixture, and only those', () => {
    const { root } = workspace({ shop: [], admin: [] });
    mkdirSync(join(root, 'plain/e2e'), { recursive: true });
    writeFileSync(join(root, 'plain/playwright.config.ts'), "export default { testDir: './e2e' };\n");
    writeFileSync(join(root, 'plain/e2e/a.spec.ts'), "import { test } from '@playwright/test';\n");
    mkdirSync(join(root, 'node_modules/pkg/e2e'), { recursive: true });
    writeFileSync(join(root, 'node_modules/pkg/playwright.config.ts'), "export default { testDir: './e2e' };\n");
    writeFileSync(join(root, 'node_modules/pkg/e2e/fixtures.ts'), "import '@craft-ts/playwright-sessions';\n");
    expect(findCraftSessionConfigs(root)).toEqual(['admin/playwright.config.ts', 'shop/playwright.config.ts']);
  });

  it('finds the pilot in this workspace', () => {
    expect(findCraftSessionConfigs(process.cwd())).toEqual(expect.arrayContaining(['apps/demo-ecommerce/playwright.config.ts', 'libs/playwright-sessions/playwright.config.ts']));
  });
});

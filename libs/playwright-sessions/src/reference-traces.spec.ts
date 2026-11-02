import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizeSessionTrace } from '@craft-ts/session-trace';
import { recordRun } from './history-store.js';
import { readReferenceTraces, readReferenceTracesAtBase } from './reference-traces.js';

const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });

const meta = { recordedAt: '2026-10-24T15:02:11.000Z', durationMs: 12, retry: 0, gitSha: 'f40a123cb', dirty: false, title: 'checkout', specFile: 'e2e/cart.spec.ts', environment: { browser: 'chromium' } };
const session = (routePath: string) => ({
  format: 'craft-debug-session', version: 6, startUrl: 'http://localhost/', exportedAt: 1, truncated: false, clips: [],
  events: [{ id: 'e1', sequence: 1, timestamp: 1, kind: 'route-activation', phase: 'succeeded', name: routePath, payload: { routePath, outcome: 'activated' } }],
});
function record(sessionsDir: string, id: string, routePath: string) {
  const value = session(routePath);
  recordRun(join(sessionsDir, id, 'chromium'), { id, project: 'chromium', keep: 1, session: value, trace: normalizeSessionTrace(value), meta });
}
const keys = (traces: Record<string, { steps: readonly { key: string }[] }> | undefined) =>
  traces && Object.fromEntries(Object.entries(traces).map(([test, trace]) => [test, trace.steps.map((step) => step.key)]));

describe('reference traces', () => {
  it('reads the latest reference of every test, keyed by id and project', () => {
    const dir = mkdtempSync(join(tmpdir(), 'craft-reference-traces-'));
    directories.push(dir);
    record(dir, 'shop.cart', 'cart');
    record(dir, 'admin.edit', 'admin');
    expect(keys(readReferenceTraces(dir))).toEqual({
      'admin.edit/chromium': ['route-activation:admin'],
      'shop.cart/chromium': ['route-activation:cart'],
    });
    expect(readReferenceTraces(join(dir, 'missing'))).toEqual({});
  });

  it('reads them as committed at the merge base with the base branch', () => {
    const repo = mkdtempSync(join(tmpdir(), 'craft-reference-git-'));
    directories.push(repo);
    const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'test');
    const app = join(repo, 'app');
    mkdirSync(app);
    record(join(app, 'e2e', '__sessions__'), 'shop.cart', 'cart');
    git('add', '.');
    git('commit', '-q', '-m', 'base');
    git('checkout', '-q', '-b', 'feature');
    rmSync(join(app, 'e2e', '__sessions__', 'shop.cart'), { recursive: true });
    record(join(app, 'e2e', '__sessions__'), 'shop.wishlist', 'wishlist');
    git('add', '-A');
    git('commit', '-q', '-m', 'feature');

    const options = { cwd: app, sessionsDir: 'e2e/__sessions__', baseRef: 'main' };
    expect(keys(readReferenceTracesAtBase(options))).toEqual({ 'shop.cart/chromium': ['route-activation:cart'] });
    expect(readReferenceTracesAtBase({ ...options, baseRef: 'nope' })).toBeUndefined();
    expect(readReferenceTracesAtBase({ ...options, sessionsDir: 'elsewhere' })).toEqual({});
  });
});

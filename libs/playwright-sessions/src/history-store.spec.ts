import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizeSessionTrace } from '@craft-ts/session-trace';
import { readBaselines, readHistory, recordRun } from './history-store.js';

const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'craft-session-history-'));
  directories.push(dir);
  const session = { format: 'craft-debug-session', version: 6, startUrl: 'http://localhost/', exportedAt: 1, truncated: false, events: [], clips: [] };
  const trace = normalizeSessionTrace(session);
  const meta = { recordedAt: '2026-10-24T15:02:11.000Z', durationMs: 12, retry: 0, gitSha: 'f40a123cb', dirty: false, title: 'checkout', specFile: 'e2e/cart.spec.ts', environment: { browser: 'chromium' } };
  return { dir, session, trace, meta };
}

describe('session history store', () => {
  it('writes once for a new trace, deduplicates it, and reads the gzip baseline', () => {
    const data = fixture();
    const input = { id: 'cart.checkout', project: 'chromium', keep: 2, session: data.session, trace: data.trace, meta: data.meta };
    expect(recordRun(data.dir, input)).toBe('written');
    const names = readdirSync(data.dir);
    expect(recordRun(data.dir, input)).toBe('unchanged');
    expect(readdirSync(data.dir)).toEqual(names);
    expect(readHistory(data.dir)?.runs).toHaveLength(1);
    expect(readBaselines(data.dir)[0]?.session).toEqual(data.session);
    expect(names.some((name) => name.endsWith('.tmp'))).toBe(false);
  });

  it('recomputes stored hashes instead of trusting them', () => {
    const data = fixture();
    const input = { id: 'cart.checkout', project: 'chromium', keep: 2, session: data.session, trace: data.trace, meta: data.meta };
    recordRun(data.dir, { ...input, trace: { ...data.trace, hash: 'written-by-an-old-normalizer' } });
    expect(recordRun(data.dir, input)).toBe('unchanged');
    expect(readBaselines(data.dir)[0]?.trace.hash).toBe(data.trace.hash);
  });

  it('rotates the oldest sessions when keep is exceeded', () => {
    const data = fixture();
    const hashes: string[] = [];
    for (const index of [1, 2, 3]) {
      const session = { ...data.session, events: [{ kind: 'dom', sequence: 1, payload: { interactionName: `Cart:button:step-${index}:click` } }] };
      const trace = normalizeSessionTrace(session);
      hashes.push(trace.hash);
      recordRun(data.dir, { id: 'cart.checkout', project: 'chromium', keep: 2, session, trace, meta: { ...data.meta, recordedAt: `2026-10-24T15:02:1${index}.000Z` } });
    }
    expect(readHistory(data.dir)?.runs.map((run) => run.traceHash)).toEqual([hashes[2], hashes[1]]);
    expect(readdirSync(data.dir).filter((name) => name.endsWith('.session.json.gz'))).toHaveLength(2);
  });
});

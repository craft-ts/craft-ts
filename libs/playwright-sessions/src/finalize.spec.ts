import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { finalizeCraftSession, type FinalizeInput } from './finalize.js';
import { readGitState } from './git.js';
import { readHistory } from './history-store.js';

const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const session = (status: number) => ({
  format: 'craft-debug-session', version: 6, startUrl: 'http://localhost/', exportedAt: 1, truncated: false, clips: [],
  events: [
    { id: 'e1', sequence: 1, timestamp: 1_000, kind: 'http', phase: 'started', operationId: 'f1', payload: { method: 'POST', url: 'http://localhost/__server-functions', body: '{"id":"shop.order"}' } },
    { id: 'e2', sequence: 2, timestamp: 1_010, kind: 'http', phase: 'succeeded', operationId: 'f1', response: { status, body: '"{}"' } },
  ],
});

/** A fake archive: answers by id, after `misses` 404s for that id. */
function archive(sessions: Record<string, unknown>, misses: Record<string, number> = {}) {
  const requests: string[] = [];
  const fetch = async (input: string | URL | Request) => {
    const id = String(input).split('/').at(-1)!;
    requests.push(id);
    if ((misses[id] ?? 0) > 0) { misses[id]! -= 1; return new Response(null, { status: 404 }); }
    return id in sessions ? Response.json(sessions[id]) : new Response(null, { status: 404 });
  };
  return { fetch: fetch as typeof globalThis.fetch, requests };
}

function input(overrides: Partial<FinalizeInput> & Pick<FinalizeInput, 'sessionIds' | 'fetch'>) {
  const historyDir = mkdtempSync(join(tmpdir(), 'craft-finalize-'));
  directories.push(historyDir);
  const attachments: Array<{ name: string; body: string }> = [];
  const annotations: Array<{ type: string; description: string }> = [];
  const value: FinalizeInput = {
    testId: 'shop.checkout', project: 'chromium', title: 'checkout',
    contract: { id: 'shop.checkout', keep: 2, reason: 'test', capture: 'required' },
    mode: 'update', status: 'passed', serverUrl: 'http://log.test', historyDir, markers: [{ label: 'payer', at: 1_005 }],
    meta: { recordedAt: '2026-10-25T08:00:00.000Z', durationMs: 10, retry: 0, gitSha: 'abc', dirty: false, title: 'checkout', specFile: 'e2e/checkout.spec.ts', environment: {} },
    lookupTimeoutMs: 1_000,
    attach: async (name, body) => { attachments.push({ name, body: body.toString() }); },
    annotate: (type, description) => { annotations.push({ type, description }); },
    ...overrides,
  };
  return { value, historyDir, attachments, annotations };
}

describe('finalizeCraftSession', () => {
  it('records a session seen by two pages once', async () => {
    const server = archive({ [ID_A]: session(200) });
    const { value, historyDir } = input({ sessionIds: [ID_A, ID_A], fetch: server.fetch });
    expect((await finalizeCraftSession(value)).recorded).toEqual(['written']);
    expect(server.requests).toEqual([ID_A]);
    expect(readHistory(historyDir)?.runs).toEqual([expect.objectContaining({ traceSchemaVersion: 2, markers: [{ label: 'payer', at: 1_005 }] })]);
  });

  it('warns when the test session was split in two', async () => {
    const server = archive({ [ID_A]: session(200), [ID_B]: session(500) });
    const recorded = await finalizeCraftSession(input({ sessionIds: [ID_A, ID_B], fetch: server.fetch }).value);
    expect(recorded.warnings).toEqual([expect.stringContaining('coupée en 2')]);
    const failed = input({ sessionIds: [ID_A, ID_B], fetch: server.fetch, status: 'failed', mode: 'compare' });
    await finalizeCraftSession({ ...failed.value, historyDir: failed.historyDir });
    expect(failed.attachments.map((item) => item.name)).toEqual(['craft-session-11111111.json.gz', 'craft-session-22222222.json.gz']);
  });

  it('waits for the same id after a 404 and never takes another run', async () => {
    const server = archive({ [ID_A]: session(200), [ID_B]: session(200) }, { [ID_A]: 2 });
    await finalizeCraftSession(input({ sessionIds: [ID_A], fetch: server.fetch }).value);
    expect(server.requests).toEqual([ID_A, ID_A, ID_A]);

    const missing = archive({ [ID_B]: session(200) });
    await expect(finalizeCraftSession(input({ sessionIds: [ID_A], fetch: missing.fetch, lookupTimeoutMs: 300 }).value)).rejects.toThrow(ID_A);
    expect(new Set(missing.requests)).toEqual(new Set([ID_A]));
  });

  it('compares a red run with the green history and attaches the report', async () => {
    const green = archive({ [ID_A]: session(200) });
    const recorded = input({ sessionIds: [ID_A], fetch: green.fetch });
    await finalizeCraftSession(recorded.value);
    const red = archive({ [ID_B]: session(500) });
    const failed = input({ sessionIds: [ID_B], fetch: red.fetch, status: 'failed', mode: 'compare', compareUrl: (id) => `http://dash.test/#/compare?run=${id}`, replayBaseline: async () => ({ status: 'completed' }) });
    const result = await finalizeCraftSession({ ...failed.value, historyDir: recorded.historyDir });
    expect(result.comparisons[0]?.firstDivergence).toMatchObject({ kind: 'changed-invariant', expected: { key: 'server-fn:shop.order' } });
    expect(failed.attachments.map((item) => item.name)).toEqual(['craft-session-diff.md', 'craft-session-diff.json', 'craft-session.json.gz']);
    const markdown = failed.attachments[0]!.body;
    expect(markdown).toContain('server-fn:shop.order · status : 200 → 500');
    expect(markdown).toContain('rejoue sans écart');
    expect(markdown).toContain(`http://dash.test/#/compare?run=${ID_B}`);
    expect(JSON.parse(failed.attachments[1]!.body)).toMatchObject({ sessionId: ID_B, baselineReplay: { status: 'completed' } });
    expect(failed.annotations).toEqual([expect.objectContaining({ type: 'craft-session-divergence' })]);
  });

  it('does nothing for a skipped test', async () => {
    const server = archive({ [ID_A]: session(500) });
    const skipped = input({ sessionIds: [ID_A], fetch: server.fetch, status: 'skipped', mode: 'compare' });
    await finalizeCraftSession(skipped.value);
    expect(server.requests).toEqual([]);
    expect(skipped.attachments).toEqual([]);
    expect(readdirSync(skipped.historyDir)).toEqual([]);
  });

  it('requires a capture from a green test', async () => {
    await expect(finalizeCraftSession(input({ sessionIds: [], fetch: archive({}).fetch }).value)).rejects.toThrow('aucune capture');
  });
});

describe('readGitState', () => {
  it('ignores the versioned histories when telling whether the tree is dirty', () => {
    const repository = mkdtempSync(join(tmpdir(), 'craft-git-'));
    directories.push(repository);
    const git = (...args: string[]) => execFileSync('git', args, { cwd: repository, stdio: 'ignore' });
    git('init', '-q'); git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
    execFileSync('mkdir', ['-p', join(repository, 'e2e/__sessions__/shop.checkout/chromium')]);
    execFileSync('touch', [join(repository, 'e2e/__sessions__/shop.checkout/chromium/history.json')]);
    expect(readGitState(repository)).toMatchObject({ dirty: false });
    execFileSync('touch', [join(repository, 'e2e/checkout.spec.ts')]);
    expect(readGitState(repository)).toMatchObject({ dirty: true });
  });

  it('reads unknown and clean outside a git checkout', () => {
    expect(readGitState(tmpdir(), (() => { throw new Error('not a repository'); }) as never)).toEqual({ sha: 'unknown', dirty: false });
  });
});

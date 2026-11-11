import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogHttpServer } from './http-server.js';
import { LogStore } from './log-store.js';
import { createSessionsCheckAccess, findSessionsCheckRepository } from './sessions-check.js';

const report = (origin: string, extra: Record<string, unknown> = {}) => ({
  format: 'craft-golden-check',
  schemaVersion: 1,
  app: 'shop',
  origin,
  base: 'main (abc)',
  head: 'arbre de travail',
  sessions: [{ sessionId: '801744a1-0000-4000-8000-000000000000', verdict: 'changed', reason: '2 moment(s) sur 8 diffèrent', change: { moments: [3, 5], fingerprint: 'f1' } }],
  counts: { regression: 0, changed: 1, flaky: 0, stale: 0, unchanged: 0 },
  approved: 0,
  passed: false,
  ...extra,
});

describe('the last sessions:check of an app', () => {
  let repository: string;
  let server: ReturnType<typeof createLogHttpServer> | undefined;
  const writeReport = (app: string, content: unknown) => {
    mkdirSync(join(repository, 'tmp', 'sessions-check', app), { recursive: true });
    writeFileSync(join(repository, 'tmp', 'sessions-check', app, 'report.json'), JSON.stringify(content));
  };
  const start = async (run?: Parameters<typeof createSessionsCheckAccess>[0]['run']) => {
    server = createLogHttpServer({
      store: new LogStore({ directory: join(repository, 'logs') }),
      sessionsCheck: createSessionsCheckAccess({ repository, ...(run ? { run } : {}) }),
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };

  beforeEach(() => {
    repository = mkdtempSync(join(tmpdir(), 'sessions-check-http-'));
  });
  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    rmSync(repository, { recursive: true, force: true });
  });

  it('finds the repository that has the command, from below it', () => {
    mkdirSync(join(repository, 'tools', 'sessions-check'), { recursive: true });
    writeFileSync(join(repository, 'tools', 'sessions-check', 'sessions-check.mjs'), '');
    mkdirSync(join(repository, 'apps', 'log-server'), { recursive: true });
    expect(findSessionsCheckRepository(join(repository, 'apps', 'log-server'))).toBe(repository);
    expect(findSessionsCheckRepository(tmpdir())).toBeUndefined();
  });

  it('answers with the report of the app recorded at the origin, or none', async () => {
    writeReport('shop', report('http://localhost:4204'));
    writeReport('other', report('http://localhost:4300'));
    writeReport('broken', '{');
    const base = await start();
    const found = await (await fetch(`${base}/sessions/check?origin=${encodeURIComponent('http://localhost:4204')}`)).json();
    expect(found).toMatchObject({ app: 'shop', report: { origin: 'http://localhost:4204', passed: false } });
    expect(await (await fetch(`${base}/sessions/check?origin=http://localhost:9`)).json()).toEqual({ report: null });
  });

  it('serves the pictures of the last check, and nothing else', async () => {
    writeReport('shop', report('http://localhost:4204'));
    const pictures = join(repository, 'tmp', 'sessions-check', 'shop', 'images', '801744a1-0000-4000-8000-000000000000');
    mkdirSync(pictures, { recursive: true });
    writeFileSync(join(pictures, '003-head.png'), 'png');
    const base = await start();
    const picture = (path: string, origin = 'http://localhost:4204') =>
      fetch(`${base}/sessions/check/image?origin=${encodeURIComponent(origin)}&path=${encodeURIComponent(path)}`);
    const found = await picture('images/801744a1-0000-4000-8000-000000000000/003-head.png');
    expect([found.status, found.headers.get('content-type'), await found.text()]).toEqual([200, 'image/png', 'png']);
    expect((await picture('images/801744a1-0000-4000-8000-000000000000/003-base.png')).status).toBe(404);
    expect((await picture('report.json')).status).toBe(404);
    expect((await picture('images/../report.json')).status).toBe(404);
    expect((await picture('images/801744a1-0000-4000-8000-000000000000/003-head.png', 'http://localhost:9')).status).toBe(404);
  });

  it('approves through the command, and gives its refusal back', async () => {
    writeReport('shop', report('http://localhost:4204'));
    const run = vi.fn(async (args: readonly string[]) => {
      if (args[1]!.startsWith('801744a1')) {
        writeReport('shop', report('http://localhost:4204', { approved: 1, passed: true }));
        return { code: 0, stdout: 'Changement de 801744a1 approuvé', stderr: '' };
      }
      return { code: 1, stdout: '', stderr: 'bruit\n801744b2 est une régression : elle se corrige, elle ne s’approuve pas.' };
    });
    const base = await start(run);
    const post = (sessionId: string) =>
      fetch(`${base}/sessions/check/approve`, { method: 'POST', body: JSON.stringify({ origin: 'http://localhost:4204', sessionId }) });

    const approved = await post('801744a1-0000-4000-8000-000000000000');
    expect(approved.status).toBe(200);
    expect(await approved.json()).toMatchObject({ approved: true, app: 'shop', report: { approved: 1, passed: true } });
    expect(run).toHaveBeenCalledWith(['--approve', '801744a1-0000-4000-8000-000000000000', '--app', 'shop']);

    const refused = await post('801744b2-0000-4000-8000-000000000000');
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ approved: false, message: expect.stringContaining('ne s’approuve pas') });

    expect((await post('../../etc')).status).toBe(400);
    const elsewhere = await fetch(`${base}/sessions/check/approve`, { method: 'POST', body: JSON.stringify({ origin: 'http://localhost:9', sessionId: '801744a1' }) });
    expect(await elsewhere.json()).toMatchObject({ approved: false, message: expect.stringContaining('Aucune vérification') });
  });

  it('says when the server does not run in such a repository', async () => {
    server = createLogHttpServer({ store: new LogStore({ directory: join(repository, 'logs') }) });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    expect((await fetch(`${base}/sessions/check?origin=x`)).status).toBe(503);
  });
});

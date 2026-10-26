import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLogHttpServer } from './http-server.js';
import { LogStore } from './log-store.js';
import { ResumeCheckpointStore } from './resume-checkpoints.js';

const SESSION = '00000000-0000-4000-8000-000000000001';

function checkpoint(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: SESSION,
    beforeSequence: 40,
    origin: 'http://localhost:4300',
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    ttlReason: 'jeton de session valable une heure',
    snapshot: { format: 'craft-debug-app-snapshot', version: 1, route: '/admin', primitives: {}, storage: [], warnings: [] },
    probes: [{ method: 'GET', url: '/api/products/flat-white', expect: { status: 200 } }],
    created: [{ kind: 'product', id: 'p-9034', cleanup: { method: 'DELETE', url: '/api/products/p-9034', expect: { status: 204 } } }],
    deviations: ['produit recréé (p-9034 au lieu de flat-white)'],
    ...overrides,
  };
}

describe('resume checkpoints', () => {
  let directory: string;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'resume-checkpoints-'));
    server = createLogHttpServer({
      store: new LogStore({ directory: join(directory, 'logs') }),
      checkpoints: new ResumeCheckpointStore(join(directory, 'checkpoints')),
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  });

  const post = (body: unknown) =>
    fetch(`${baseUrl}/sessions/checkpoints`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('saves a point, lists it without its snapshot, serves and deletes it', async () => {
    const created = await post(checkpoint());
    expect(created.status).toBe(201);
    const { checkpoint: summary } = (await created.json()) as { checkpoint: { id: string } };
    expect(summary).not.toHaveProperty('snapshot');

    const listed = await fetch(`${baseUrl}/sessions/checkpoints?sessionId=${SESSION}&beforeSequence=40`);
    await expect(listed.json()).resolves.toMatchObject({
      checkpoints: [{ id: summary.id, expired: false, route: '/admin', deviations: ['produit recréé (p-9034 au lieu de flat-white)'] }],
    });
    const other = await fetch(`${baseUrl}/sessions/checkpoints?beforeSequence=12`);
    await expect(other.json()).resolves.toEqual({ checkpoints: [] });

    const full = await fetch(`${baseUrl}/sessions/checkpoints/${summary.id}`);
    await expect(full.json()).resolves.toMatchObject({ checkpoint: { snapshot: { route: '/admin' } } });

    const deleted = await fetch(`${baseUrl}/sessions/checkpoints/${summary.id}`, { method: 'DELETE' });
    await expect(deleted.json()).resolves.toEqual({ deleted: true });
    expect((await fetch(`${baseUrl}/sessions/checkpoints/${summary.id}`)).status).toBe(404);
  });

  it('refuses a point without a reasoned, future expiry or a snapshot', async () => {
    expect((await post(checkpoint({ expiresAt: '2001-01-01T00:00:00Z' }))).status).toBe(400);
    expect((await post(checkpoint({ ttlReason: ' ' }))).status).toBe(400);
    expect((await post(checkpoint({ snapshot: {} }))).status).toBe(400);
    expect((await post(checkpoint({ probes: [{ url: '/x' }] }))).status).toBe(400);
  });

  it('marks expired points', () => {
    let now = new Date('2026-10-26T10:00:00Z');
    const store = new ResumeCheckpointStore(join(directory, 'clock'), () => now);
    store.save({ ...checkpoint(), expiresAt: '2026-10-26T11:00:00.000Z' } as never);
    expect(store.list()[0]?.expired).toBe(false);
    now = new Date('2026-10-26T11:00:01Z');
    expect(store.list()[0]?.expired).toBe(true);
  });
});

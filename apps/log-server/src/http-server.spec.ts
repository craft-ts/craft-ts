import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLogHttpServer } from './http-server.js';
import { LogStore } from './log-store.js';

describe('log http server', () => {
  let directory: string;
  let store: LogStore;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'log-http-'));
    store = new LogStore({ directory });
    server = createLogHttpServer({ store });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  });

  function post(body: unknown): Promise<Response> {
    return fetch(`${baseUrl}/logs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  it('accepts a batch and persists it', async () => {
    const response = await post({
      clientId: 'client-1',
      entries: [
        { level: 'log', message: 'hello', from: ['App'] },
        { level: 'error', message: 'boom' },
      ],
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ accepted: 2 });

    const lines = readFileSync(store.filePath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      level: 'log',
      message: 'hello',
      clientId: 'client-1',
    });
  });

  it('answers CORS preflight', async () => {
    const response = await fetch(`${baseUrl}/logs`, { method: 'OPTIONS' });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('reports health with the target file', async () => {
    const response = await fetch(`${baseUrl}/health`);

    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      file: store.filePath,
    });
  });

  it('rejects malformed JSON with 400', async () => {
    const response = await post('{ not json');

    expect(response.status).toBe(400);
  });

  it('rejects bodies over the limit with 413', async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    server = createLogHttpServer({ store, maxBodySize: 64 });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const response = await post({
      entries: [{ level: 'log', message: 'x'.repeat(500) }],
    });

    expect(response.status).toBe(413);
  });

  it('clears the store on DELETE /logs', async () => {
    await post({ entries: [{ level: 'log', message: 'a' }] });

    const response = await fetch(`${baseUrl}/logs`, { method: 'DELETE' });

    expect(response.status).toBe(200);
    expect(store.size()).toBe(0);
  });

  it('returns 404 for unknown routes', async () => {
    const response = await fetch(`${baseUrl}/nope`);

    expect(response.status).toBe(404);
  });
});

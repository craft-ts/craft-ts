import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLogHttpServer } from './http-server.js';
import { LogStore } from './log-store.js';
import { ResumeRecipeStore } from './resume-recipes.js';

const SESSION = '00000000-0000-4000-8000-000000000001';
const recipe = {
  sessionId: SESSION,
  beforeSequence: 12,
  origin: 'http://localhost:4301',
  objective: { goal: 'Save the new product price', exact: ['draft price'], approximate: [], mayWrite: true },
  strategy: 'autonomous',
  steps: [{ type: 'expect', level: 'essential', condition: { address: 'draft / state:product', path: 'price', equals: '4.83' } }, { type: 'checkpoint' }],
  cleanup: [{ address: 'products.delete', args: ['{{created.product.id}}'] }],
  revisions: [{ at: '2026-10-27T10:00:00.000Z', by: 'ai', reason: 'Initial recipe.' }],
};

describe('resume recipe API', () => {
  let directory: string;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'resume-recipes-http-'));
    server = createLogHttpServer({
      store: new LogStore({ directory: join(directory, 'logs') }),
      recipes: new ResumeRecipeStore(join(directory, 'recipes')),
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  });

  const post = (path: string, body: unknown) => fetch(`${baseUrl}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });

  it('stores, lists, retrieves and tracks recipe runs', async () => {
    const created = await post('/sessions/recipes', recipe);
    expect(created.status).toBe(201);
    const { recipe: saved } = await created.json() as { recipe: { id: string } };

    const list = await fetch(`${baseUrl}/sessions/recipes?sessionId=${SESSION}&beforeSequence=12`);
    await expect(list.json()).resolves.toMatchObject({ recipes: [{ id: saved.id }] });
    await expect(fetch(`${baseUrl}/sessions/recipes/${saved.id}`).then((response) => response.json()))
      .resolves.toMatchObject({ recipe: { objective: { mayWrite: true } } });

    const started = await post(`/sessions/recipes/${saved.id}/runs`, { supervised: true });
    const { run } = await started.json() as { run: { id: string } };
    await post(`/sessions/recipes/${saved.id}/runs/${run.id}`, {
      status: 'completed', currentStep: 1,
      events: [{ at: new Date().toISOString(), kind: 'completed', step: 1 }],
    });
    await expect(fetch(`${baseUrl}/sessions/recipes/${saved.id}/runs`).then((response) => response.json()))
      .resolves.toMatchObject({ runs: [{ id: run.id, status: 'completed', supervised: true }] });
  });

  it('rejects a recipe carrying a password field', async () => {
    const response = await post('/sessions/recipes', {
      ...recipe, steps: [{ type: 'act', password: 'never persist this' }],
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('handoff') });
  });
});

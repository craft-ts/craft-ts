import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { resumeStory } from '@craft-ts/session-trace';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LogReader } from './log-reader.js';
import { createLogMcpServer } from './mcp-server.js';

const SESSION = '00000000-0000-4000-8000-000000000001';
const RECIPE = '00000000-0000-4000-8000-000000000002';
const REQUEST = '00000000-0000-4000-8000-000000000003';
const OTHER_REQUEST = '00000000-0000-4000-8000-000000000004';
const archive = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL(
        '../../session-trace/src/__fixtures__/admin.edit-product.session.json.gz',
        import.meta.url,
      ),
    ),
  ).toString('utf8'),
) as { events: Record<string, unknown>[]; startUrl?: string };

describe('resume tools', () => {
  let directory: string;
  let client: Client;
  let request: Record<string, unknown> | null;
  let thread: Record<string, unknown>[];
  let recipeRuns: Record<string, unknown>[];
  let previousFetch: typeof fetch;
  let previousUrl: string | undefined;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'log-mcp-resume-'));
    previousFetch = globalThis.fetch;
    previousUrl = process.env['LOG_SERVER_URL'];
    process.env['LOG_SERVER_URL'] = 'http://log.test';
    request = {
      id: REQUEST,
      sessionId: SESSION,
      beforeSequence: 40,
      createdAt: '2026-10-26T10:00:00.000Z',
    };
    thread = [];
    recipeRuns = [
      {
        id: 'run-1',
        status: 'completed',
        startedAt: '2026-10-27T10:00:00.000Z',
      },
    ];
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === '/sessions/resume-requests/latest')
        return Response.json({ request });
      if (url.pathname === `/sessions/resume-requests/${REQUEST}`)
        return Response.json({
          request: {
            id: REQUEST,
            sessionId: SESSION,
            beforeSequence: 40,
            createdAt: '2026-10-26T10:00:00.000Z',
          },
        });
      if (url.pathname === '/sessions/recipes')
        return Response.json({
          recipes: [{ id: RECIPE, sessionId: SESSION, runs: recipeRuns }],
        });
      if (url.pathname === `/sessions/recipes/${RECIPE}`)
        return Response.json({
          recipe: {
            id: RECIPE,
            origin: 'http://app.test',
            objective: { goal: 'Edit a product' },
            steps: [
              { type: 'goto', route: '/admin' },
              { type: 'handoff', message: 'Sign in as admin.' },
              { type: 'act', action: { id: 'save-product', fill: '4.83' } },
            ],
          },
        });
      if (url.pathname === `/sessions/recipes/${RECIPE}/runs`)
        return Response.json({ runs: [{ id: 'run-1', status: 'completed' }] });
      if (url.pathname === `/sessions/resume-requests/${REQUEST}/messages`) {
        if (init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as Record<string, unknown>;
          const message = {
            id: thread.length + 1,
            at: 'now',
            kind: 'step',
            ...body,
          };
          thread.push(message);
          return Response.json({ message }, { status: 201 });
        }
        const since = Number(url.searchParams.get('since') ?? '0');
        return Response.json({
          messages: thread.filter((message) => Number(message['id']) > since),
        });
      }
      if (url.pathname === `/sessions/${SESSION}`)
        return Response.json(archive);
      return new Response(null, { status: 404 });
    };
    const server = createLogMcpServer(new LogReader({ directory }));
    client = new Client({ name: 'test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterEach(() => {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env['LOG_SERVER_URL'];
    else process.env['LOG_SERVER_URL'] = previousUrl;
    rmSync(directory, { recursive: true, force: true });
  });

  async function call(name: string, args: Record<string, unknown> = {}) {
    const result = await client.callTool({ name, arguments: args });
    const structured = result.structuredContent as
      | { result?: Record<string, unknown> }
      | undefined;
    if (!structured?.result)
      throw new Error(
        `No structured result for ${name}: ${JSON.stringify(result)}`,
      );
    return structured.result;
  }

  it('reads the latest request with a summary of its session', async () => {
    await expect(call('resume.request')).resolves.toMatchObject({
      request: { sessionId: SESSION, beforeSequence: 40 },
      session: { events: archive.events.length },
      // Reading the request is enough to know what comes next.
      method: expect.arrayContaining([
        expect.stringContaining('resume.doctor'),
        expect.stringContaining('recipe.list'),
        expect.stringContaining('autonome'),
        expect.stringContaining('app.handoff'),
        expect.stringContaining('checkpoint.save'),
      ]),
    });
  });

  it('reads an exact request even after a newer request was published', async () => {
    request = {
      id: OTHER_REQUEST,
      sessionId: '00000000-0000-4000-8000-000000000005',
      beforeSequence: 99,
      createdAt: '2026-10-27T10:00:00.000Z',
    };
    await expect(
      call('resume.request', { requestId: REQUEST }),
    ).resolves.toMatchObject({
      request: { id: REQUEST, sessionId: SESSION, beforeSequence: 40 },
    });
    await expect(
      call('session.story', { requestId: REQUEST }),
    ).resolves.toMatchObject({
      point: { requestId: REQUEST, sessionId: SESSION, beforeSequence: 40 },
    });
  });

  it('returns a failed recipe run alongside the request as a repair handoff', async () => {
    recipeRuns = [
      {
        id: 'run-2',
        status: 'failed',
        startedAt: '2026-10-27T11:00:00.000Z',
        currentStep: 3,
        events: [
          { kind: 'failed', step: 3, detail: 'essential expectation failed' },
        ],
      },
    ];
    await expect(call('resume.request')).resolves.toMatchObject({
      repair: {
        recipeId: RECIPE,
        runId: 'run-2',
        failedStep: 3,
        failure: { kind: 'failed' },
      },
      method: expect.arrayContaining([
        expect.stringContaining('resume.request.repair'),
      ]),
    });
  });

  it('tells the story up to the requested point when no session is named', async () => {
    const story = await call('session.story');
    const expected = resumeStory(archive, { beforeSequence: 40 });
    expect(story['point']).toEqual({
      sessionId: SESSION,
      beforeSequence: 40,
      requestId: REQUEST,
    });
    expect(story['steps']).toEqual(JSON.parse(JSON.stringify(expected.steps)));
  });

  it('lists recipes and reads a recipe with its execution history', async () => {
    await expect(
      call('recipe.list', { sessionId: SESSION, beforeSequence: 40 }),
    ).resolves.toMatchObject({
      recipes: [{ id: RECIPE, sessionId: SESSION }],
    });
    await expect(call('recipe.get', { id: RECIPE })).resolves.toMatchObject({
      recipe: { objective: { goal: 'Edit a product' } },
      runs: [{ id: 'run-1', status: 'completed' }],
    });
  });

  it('exports an exploratory Playwright scaffold and marks human steps for review', async () => {
    await expect(
      call('recipe.exportPlaywright', { id: RECIPE }),
    ).resolves.toMatchObject({
      recipeId: RECIPE,
      fileName: 'edit-a-product.spec.ts',
      manualSteps: [1],
      source: expect.stringContaining(
        'await page.goto(new URL("/admin", baseURL).toString())',
      ),
    });
  });

  it('lets the call override the point and name the session', async () => {
    const story = await call('session.story', { sessionId: SESSION });
    expect(story['point']).toEqual({ sessionId: SESSION });
    expect((story['steps'] as unknown[]).length).toBeGreaterThan(
      resumeStory(archive, { beforeSequence: 40 }).steps.length,
    );
  });

  it('describes the target, the prerequisites and a recorded call', async () => {
    await expect(call('session.target')).resolves.toMatchObject({
      route: '/admin',
    });
    await expect(call('session.prerequisites')).resolves.toMatchObject({
      identities: [expect.objectContaining({ role: 'admin' })],
      session: { open: true },
    });
    await expect(
      call('session.recordedCall', { call: 'ecommerce.auth.login' }),
    ).resolves.toMatchObject({
      call: 'ecommerce.auth.login',
      response: { status: 200 },
    });
  });

  it('explains what to do when nobody asked to resume', async () => {
    request = null;
    await expect(call('resume.request')).resolves.toMatchObject({
      request: null,
    });
    await expect(call('session.target')).resolves.toMatchObject({
      error: expect.stringContaining('Reprendre ici'),
    });
  });
  it('serves the guided resume method as a prompt', async () => {
    const prompts = await client.listPrompts();
    expect(prompts.prompts.map((prompt) => prompt.name)).toEqual([
      'reprise-guidee',
    ]);
    const prompt = await client.getPrompt({
      name: 'reprise-guidee',
      arguments: { requestId: REQUEST, sessionId: SESSION },
    });
    const text = (prompt.messages[0]?.content as { text: string }).text;
    expect(text).toContain('app.handoff');
    // Doctor and read-only discovery precede the goal interview; app actions follow it.
    const doctor = text.indexOf('1. Si le prompt contient un requestId');
    const goal = text.indexOf("2. Avant toute action dans l'app");
    const drive = text.indexOf("4. Vérifier d'abord");
    expect(doctor).toBeGreaterThan(0);
    expect(goal).toBeGreaterThan(doctor);
    expect(drive).toBeGreaterThan(goal);
    expect(text).toContain('checkpoint.save seul ne suffit pas');
    expect(text).toContain('status=completed');
    expect(text).toContain('en passant recipeId depuis la recette');
    expect(text).not.toContain('la même question dans le fil');
    expect(text).toContain('checkpoint.save');
    expect(text).toContain('recipe.save');
    expect(text).toContain(SESSION);
    expect(text).toContain(REQUEST);
  });
  it('writes in the dashboard thread and returns what the person answered since', async () => {
    await call('resume.say', { text: 'J’ouvre l’app sur /admin.' });
    thread.push({
      id: thread.length + 1,
      at: 'now',
      from: 'person',
      kind: 'reply',
      text: 'Prends le compte de Camille.',
    });

    const said = await call('resume.say', {
      text: 'À vous : connectez-vous.',
      kind: 'handoff',
    });

    expect(said['message']).toMatchObject({ from: 'ai', kind: 'handoff' });
    expect(said['replies']).toEqual([
      expect.objectContaining({ text: 'Prends le compte de Camille.' }),
    ]);
    await expect(call('resume.replies', { since: 2 })).resolves.toMatchObject({
      replies: [],
    });
    await expect(call('resume.replies')).resolves.toMatchObject({
      requestId: REQUEST,
      replies: [expect.objectContaining({ from: 'person' })],
    });
  });
});

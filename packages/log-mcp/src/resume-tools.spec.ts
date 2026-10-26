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
const archive = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL('../../session-trace/src/__fixtures__/admin.edit-product.session.json.gz', import.meta.url),
    ),
  ).toString('utf8'),
) as { events: Record<string, unknown>[]; startUrl?: string };

describe('resume tools', () => {
  let directory: string;
  let client: Client;
  let request: Record<string, unknown> | null;
  let previousFetch: typeof fetch;
  let previousUrl: string | undefined;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'log-mcp-resume-'));
    previousFetch = globalThis.fetch;
    previousUrl = process.env['LOG_SERVER_URL'];
    process.env['LOG_SERVER_URL'] = 'http://log.test';
    request = { id: 'r1', sessionId: SESSION, beforeSequence: 40, createdAt: '2026-10-26T10:00:00.000Z' };
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/sessions/resume-requests/latest') return Response.json({ request });
      if (url.pathname === `/sessions/${SESSION}`) return Response.json(archive);
      return new Response(null, { status: 404 });
    };
    const server = createLogMcpServer(new LogReader({ directory }));
    client = new Client({ name: 'test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  });

  afterEach(() => {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env['LOG_SERVER_URL'];
    else process.env['LOG_SERVER_URL'] = previousUrl;
    rmSync(directory, { recursive: true, force: true });
  });

  async function call(name: string, args: Record<string, unknown> = {}) {
    const result = await client.callTool({ name, arguments: args });
    return (result.structuredContent as { result: Record<string, unknown> }).result;
  }

  it('reads the latest request with a summary of its session', async () => {
    await expect(call('resume.request')).resolves.toMatchObject({
      request: { sessionId: SESSION, beforeSequence: 40 },
      session: { events: archive.events.length },
    });
  });

  it('tells the story up to the requested point when no session is named', async () => {
    const story = await call('session.story');
    const expected = resumeStory(archive, { beforeSequence: 40 });
    expect(story['point']).toEqual({ sessionId: SESSION, beforeSequence: 40, requestId: 'r1' });
    expect(story['steps']).toEqual(JSON.parse(JSON.stringify(expected.steps)));
  });

  it('lets the call override the point and name the session', async () => {
    const story = await call('session.story', { sessionId: SESSION });
    expect(story['point']).toEqual({ sessionId: SESSION });
    expect((story['steps'] as unknown[]).length).toBeGreaterThan(
      resumeStory(archive, { beforeSequence: 40 }).steps.length,
    );
  });

  it('describes the target, the prerequisites and a recorded call', async () => {
    await expect(call('session.target')).resolves.toMatchObject({ route: '/admin' });
    await expect(call('session.prerequisites')).resolves.toMatchObject({
      identities: [expect.objectContaining({ role: 'admin' })],
      session: { open: true },
    });
    await expect(call('session.recordedCall', { call: 'ecommerce.auth.login' })).resolves.toMatchObject({
      call: 'ecommerce.auth.login',
      response: { status: 200 },
    });
  });

  it('explains what to do when nobody asked to resume', async () => {
    request = null;
    await expect(call('resume.request')).resolves.toMatchObject({ request: null });
    await expect(call('session.target')).resolves.toMatchObject({
      error: expect.stringContaining('Reprendre ici'),
    });
  });
});

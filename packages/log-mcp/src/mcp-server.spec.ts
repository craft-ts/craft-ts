import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { compareSessionTraces, normalizeSessionTrace } from '@craft-ts/session-trace';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LogReader } from './log-reader.js';
import { createLogMcpServer } from './mcp-server.js';

describe('logs MCP server', () => {
  let directory: string;
  let reader: LogReader;
  let client: Client;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'log-mcp-'));
    reader = new LogReader({ directory });
    writeFileSync(
      join(directory, 'app.jsonl'),
      [
        {
          level: 'error',
          message: 'boom',
          from: ['App', 'UserCard'],
          receivedAt: '2026-07-25T08:00:00.000Z',
          timestamp: '2026-07-25T08:00:00.000Z',
          seq: 1,
        },
        {
          level: 'log',
          message: 'hello',
          from: ['App'],
          receivedAt: '2026-07-25T08:00:01.000Z',
          timestamp: '2026-07-25T08:00:01.000Z',
          seq: 2,
        },
      ]
        .map((entry) => JSON.stringify(entry))
        .join('\n')
        .concat('\n'),
      'utf8',
    );

    const server = createLogMcpServer(reader);
    client = new Client({ name: 'test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('exposes the four log tools', async () => {
    const tools = await client.listTools();

    expect(tools.tools.map(({ name }) => name)).toEqual([
      'logs.search',
      'logs.tail',
      'logs.stats',
      'logs.clear',
      'sessions.compare',
    ]);
  });

  it('returns exactly what the shared comparator computes on the same files', async () => {
    const previousFetch = globalThis.fetch;
    const previousUrl = process.env['LOG_SERVER_URL'];
    process.env['LOG_SERVER_URL'] = 'http://log.test';
    const baselineGzip = readFileSync(new URL('../../session-trace/src/__fixtures__/shop.checkout.session.json.gz', import.meta.url));
    const baseline = JSON.parse(gunzipSync(baselineGzip).toString('utf8')) as { events: Array<Record<string, unknown>> };
    // The order server function answers 500 in the observed run.
    const observed = {
      ...baseline,
      events: baseline.events.map((event) => event['operationId'] === 'fetch-4' && event['phase'] === 'succeeded' ? { ...event, response: { status: 500, body: '"{}"' } } : event),
    };
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/e2e-sessions') return Response.json({ sessions: [{ root: 0, id: 'shop.checkout', project: 'chromium', runs: [{ file: 'run.session.json.gz' }] }] });
      if (url.pathname === '/sessions/00000000-0000-4000-8000-000000000001') return Response.json(observed);
      if (url.pathname.endsWith('/run.session.json.gz')) return new Response(baselineGzip);
      return new Response(null, { status: 404 });
    };
    try {
      const result = await client.callTool({ name: 'sessions.compare', arguments: { testId: 'shop.checkout', project: 'chromium', sessionId: '00000000-0000-4000-8000-000000000001' } });
      const payload = result.structuredContent as { result: { dashboardUrl: string; comparison: unknown } };
      const expected = compareSessionTraces(normalizeSessionTrace(observed), [normalizeSessionTrace(baseline)]);
      expect(payload.result.comparison).toEqual(JSON.parse(JSON.stringify(expected)));
      expect(expected.firstDivergence).toMatchObject({ kind: 'changed-invariant', expected: { key: 'server-fn:ecommerce.checkout' } });
      expect(payload.result.dashboardUrl).toContain('#/compare?');
    } finally {
      globalThis.fetch = previousFetch;
      if (previousUrl === undefined) delete process.env['LOG_SERVER_URL']; else process.env['LOG_SERVER_URL'] = previousUrl;
    }
  });

  it('searches with filters', async () => {
    const result = await client.callTool({
      name: 'logs.search',
      arguments: { level: ['error'] },
    });

    expect(result.structuredContent).toEqual({
      result: [
        expect.objectContaining({ message: 'boom', level: 'error' }),
      ],
    });
  });

  it('tails the most recent entries', async () => {
    const result = await client.callTool({
      name: 'logs.tail',
      arguments: { count: 1 },
    });

    expect(result.structuredContent).toEqual({
      result: [expect.objectContaining({ message: 'hello' })],
    });
  });

  it('reports stats including the backing files', async () => {
    const result = await client.callTool({
      name: 'logs.stats',
      arguments: {},
    });

    expect(result.structuredContent).toEqual({
      result: expect.objectContaining({
        total: 2,
        byLevel: { error: 1, log: 1 },
        files: [reader.filePath],
      }),
    });
  });

  it('clears the stored logs', async () => {
    const result = await client.callTool({
      name: 'logs.clear',
      arguments: {},
    });

    expect(result.structuredContent).toEqual({ result: { removedFiles: 1 } });
    expect(reader.readAll()).toEqual([]);
  });

  it('exposes read-only resume context and queues proposals for approval', async () => {
    const proposalCalls: unknown[] = [];
    const applyCalls: string[] = [];
    const server = createLogMcpServer(reader, {
      async readActiveContext() {
        return {
          sessionId: '23e5a8e0-3f2c-4b09-a9fa-6b78ed0c5678',
          context: {
            phase: 'execute',
            plan: { status: 'ready' },
            mismatches: [{ call: 'POST /checkout' }],
          },
        };
      },
      async proposeOverrides(proposal) {
        proposalCalls.push(proposal);
        return { status: 'proposed' };
      },
      async requestApply(proposalId) {
        applyCalls.push(proposalId);
        return { status: 'apply-requested' };
      },
    });
    const client = new Client({ name: 'resume-test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const tools = await client.listTools();
    expect(tools.tools.map(({ name }) => name)).toContain('resume_plan');
    expect(tools.tools.map(({ name }) => name)).toContain('resume_mismatch');
    expect(tools.tools.map(({ name }) => name)).toContain(
      'resume_propose_overrides',
    );
    expect(tools.tools.map(({ name }) => name)).toContain('resume_apply');

    const plan = await client.callTool({ name: 'resume_plan', arguments: {} });
    expect(plan.structuredContent).toMatchObject({
      result: { sessionId: '23e5a8e0-3f2c-4b09-a9fa-6b78ed0c5678', plan: { status: 'ready' } },
    });
    const mismatch = await client.callTool({
      name: 'resume_mismatch',
      arguments: {},
    });
    expect(mismatch.structuredContent).toMatchObject({
      result: { mismatches: [{ call: 'POST /checkout' }] },
    });
    await client.callTool({
      name: 'resume_propose_overrides',
      arguments: {
        rationale: 'Mirror the captured response.',
        overrides: [
          {
            call: 'POST /checkout',
            response: { ok: true },
            status: 403,
            frozen: true,
            assistedBy: 'ai',
          },
        ],
      },
    });
    const apply = await client.callTool({
      name: 'resume_apply',
      arguments: { proposalId: '6c1bbaec-8365-4971-94d9-1e0616de119a' },
    });
    expect(apply.structuredContent).toEqual({
      result: { status: 'apply-requested' },
    });
    expect(proposalCalls).toHaveLength(1);
    expect(applyCalls).toEqual(['6c1bbaec-8365-4971-94d9-1e0616de119a']);
    await Promise.all([client.close(), server.close()]);
  });
});

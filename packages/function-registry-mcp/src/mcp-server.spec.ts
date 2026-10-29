import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it, vi } from 'vitest';
import { createRegistryMcpServer } from './mcp-server.js';

describe('registry MCP server', () => {
  it('exposes all registry capabilities and relays calls', async () => {
    const request = vi.fn(async () => [{ key: 'save' }]);
    const server = createRegistryMcpServer({ request });
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const tools = await client.listTools();
    expect(tools.tools.map(({ name }) => name)).toEqual([
      'page',
      'registry.clients',
      'registry.list',
      'registry.get',
      'registry.call',
      'registry.query.get',
      'registry.query.set',
      'registry.query.update',
      'registry.query.patch',
      'registry.mutation.get',
      'registry.mutation.set',
      'registry.mutation.update',
      'registry.mutation.patch',
      'registry.asyncProcess.get',
      'registry.asyncProcess.set',
      'registry.asyncProcess.update',
      'registry.asyncProcess.patch',
      'registry.queryParams.get',
      'registry.queryParams.set',
      'registry.queryParams.update',
      'registry.queryParams.patch',
      'registry.override',
      'registry.restore',
      'registry.logs',
      'app.launch',
      'app.diff',
      'app.replay',
      'app.handoff',
      'app.writes',
      'resume.doctor',
      'checkpoint.save',
      'checkpoint.list',
      'checkpoint.restore',
      'checkpoint.validate',
      'checkpoint.cleanup',
      'recipe.save',
      'recipe.run',
      'recipe.repair',
    ]);

    await client.callTool({
      name: 'page',
      arguments: {
        clientId: 'browser-a',
        act: [{ id: 'email', fill: 'a@b.c' }],
        detail: 'controls',
        timeoutMs: 5_000,
      },
    });
    expect(request).toHaveBeenCalledWith('page', {
      clientId: 'browser-a',
      act: [{ id: 'email', fill: 'a@b.c' }],
      detail: 'controls',
      timeoutMs: 5_000,
    });

    await client.callTool({
      name: 'page',
      arguments: {
        act: [{ goto: '/login-form' }],
      },
    });
    expect(request).toHaveBeenCalledWith('page', {
      act: [{ goto: '/login-form' }],
    });

    await client.callTool({
      name: 'registry.clients',
      arguments: {},
    });
    expect(request).toHaveBeenCalledWith('registry/clients');

    const result = await client.callTool({
      name: 'registry.list',
      arguments: { clientId: 'browser-a' },
    });
    expect(request).toHaveBeenCalledWith('registry/list', {
      clientId: 'browser-a',
    });
    expect(result.structuredContent).toEqual({ result: [{ key: 'save' }] });

    await client.callTool({
      name: 'registry.query.update',
      arguments: {
        clientId: 'browser-a',
        key: 'query',
        id: 'page-1',
        source: '(current) => current',
      },
    });
    expect(request).toHaveBeenLastCalledWith('registry/resource/update', {
      clientId: 'browser-a',
      key: 'query',
      id: 'page-1',
      source: '(current) => current',
      kind: 'query',
    });

    await client.callTool({
      name: 'registry.queryParams.patch',
      arguments: {
        clientId: 'browser-a',
        key: 'queryParams',
        source: '() => ({ page: 2 })',
      },
    });
    expect(request).toHaveBeenLastCalledWith('registry/resource/patch', {
      clientId: 'browser-a',
      key: 'queryParams',
      source: '() => ({ page: 2 })',
      kind: 'queryParams',
    });

    await client.callTool({
      name: 'registry.override',
      arguments: {
        clientId: 'browser-a',
        key: 'increment',
        source: '({ state }) => state.update(value => value + 10)',
      },
    });
    expect(request).toHaveBeenLastCalledWith('registry/override', {
      clientId: 'browser-a',
      key: 'increment',
      source: '({ state }) => state.update(value => value + 10)',
    });

    await client.close();
    await server.close();
  });

  it('tells agents to omit clientId when exactly one tab is ready', async () => {
    const request = vi.fn(async () => []);
    const server = createRegistryMcpServer({ request });
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const tools = await client.listTools();
    const pageTool = tools.tools.find((tool) => tool.name === 'page');
    expect(pageTool?.description).toContain(
      'Omit clientId when exactly one tab is ready',
    );

    await client.close();
    await server.close();
  });

  it('serializes undefined tool results without invalid MCP content', async () => {
    const request = vi.fn(async () => undefined);
    const server = createRegistryMcpServer({ request });
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const result = await client.callTool({
      name: 'registry.query.patch',
      arguments: {
        clientId: 'browser-a',
        key: 'query',
        source: '(current) => current',
      },
    });

    expect(request).toHaveBeenCalledWith('registry/resource/patch', {
      clientId: 'browser-a',
      key: 'query',
      source: '(current) => current',
      kind: 'query',
    });
    expect(result.content).toEqual([{ type: 'text', text: 'null' }]);
    expect(result.structuredContent).toBeUndefined();

    await client.close();
    await server.close();
  });
  it('gives the person five minutes by default when handing off', async () => {
    const request = vi.fn(async () => ({ outcome: 'condition', waitedMs: 10 }));
    const server = createRegistryMcpServer({ request });
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    await client.callTool({
      name: 'app.handoff',
      arguments: {
        message: 'Connecte-toi en product-manager.',
        field: 'sign-in-password',
        until: {
          address: 'service:session / query:currentUser',
          path: 'role',
          equals: 'product-manager',
        },
      },
    });

    expect(request).toHaveBeenCalledWith('app/handoff', {
      message: 'Connecte-toi en product-manager.',
      field: 'sign-in-password',
      until: {
        address: 'service:session / query:currentUser',
        path: 'role',
        equals: 'product-manager',
      },
      timeoutMs: 300_000,
    });
    await client.close();
  });
  it('guides recipe authoring with typed hand-off steps and safe defaults', async () => {
    const posted: Record<string, unknown>[] = [];
    const fetchStub = (async (_url: string | URL | Request, init?: RequestInit) => {
      posted.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Response.json({ recipe: { id: '00000000-0000-4000-8000-000000000021' } });
    }) as typeof fetch;
    const server = createRegistryMcpServer(
      { request: vi.fn(async () => ({})) },
      { logServerUrl: 'http://log.test', fetch: fetchStub },
    );
    const client = new Client({ name: 'recipe-authoring-test', version: '1.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const listed = await client.listTools();
    const recipeSave = listed.tools.find(({ name }) => name === 'recipe.save');
    expect(recipeSave?.description).toContain('typed step schema');
    const deleteMock = {
      call: 'ecommerce.product.delete',
      defaultCaseId: 'removed',
      cases: [{
        id: 'removed',
        kind: 'success',
        response: { ok: true },
        nextChoices: { 'ecommerce.admin.overview': 'deleted' },
      }],
    };
    await client.callTool({
      name: 'recipe.save',
      arguments: {
        sessionId: '00000000-0000-4000-8000-000000000001',
        beforeSequence: 40,
        origin: 'http://localhost:4300',
        objective: { goal: 'Reprendre après connexion' },
        network: { mode: 'mocked', mocks: [deleteMock] },
        steps: [
          { type: 'goto', route: '/connexion' },
          {
            type: 'handoff',
            message: 'Connecte-toi, puis je continue.',
            field: 'sign-in-password',
            until: {
              address: 'service:session / query:currentUser',
              path: 'token',
              unmasked: true,
            },
          },
          { type: 'checkpoint', ttlReason: 'Session de démonstration.' },
        ],
      },
    });

    expect(posted[0]).toMatchObject({
      objective: {
        goal: 'Reprendre après connexion',
        exact: [],
        approximate: [],
        mayWrite: false,
      },
      strategy: 'autonomous',
      network: { mode: 'mocked', mocks: [deleteMock] },
      steps: [
        { type: 'goto', route: '/connexion' },
        {
          type: 'handoff',
          field: 'sign-in-password',
          until: { path: 'token', unmasked: true },
        },
        { type: 'checkpoint' },
      ],
      cleanup: [],
      revisions: [],
    });
    await client.close();
  });
  it('keeps the recipe tool call open long enough for a human hand-off', async () => {
    const recipeId = '00000000-0000-4000-8000-000000000011';
    const request = vi.fn(async () => ({
      runId: '00000000-0000-4000-8000-000000000012',
      status: 'completed',
    }));
    const server = createRegistryMcpServer({ request });
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    await client.callTool({ name: 'recipe.run', arguments: { id: recipeId } });

    expect(request).toHaveBeenCalledWith('app/recipe/run', {
      id: recipeId,
      timeoutMs: 15 * 60_000,
    });
    await client.close();
  });
  it('freezes the tab state with the expiry the AI chose', async () => {
    const request = vi.fn(async (method: string) =>
      method === 'app/checkpoint/capture'
        ? {
            origin: 'http://localhost:4300',
            snapshot: { format: 'craft-debug-app-snapshot', route: '/admin' },
          }
        : [{ ok: true }],
    );
    const posted: Array<{ url: string; method?: string; body?: unknown }> = [];
    const fetchStub = (async (url: string, init?: RequestInit) => {
      posted.push({
        url,
        ...(init?.method ? { method: init.method } : {}),
        ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
      });
      return Response.json(
        init?.method === 'POST'
          ? { checkpoint: { id: 'c1' } }
          : { deleted: true },
      );
    }) as typeof fetch;
    const server = createRegistryMcpServer(
      { request },
      { logServerUrl: 'http://log.test/', fetch: fetchStub },
    );
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const before = Date.now();
    const saved = await client.callTool({
      name: 'checkpoint.save',
      arguments: {
        sessionId: '00000000-0000-4000-8000-000000000001',
        beforeSequence: 40,
        ttlMs: 2 * 60 * 60_000,
        ttlReason: 'jeton de session valable deux heures',
        probes: [{ url: '/api/products/flat-white', expect: { status: 200 } }],
        deviations: ['connectée avec ines@staging'],
      },
    });
    expect(saved.structuredContent).toEqual({ result: { id: 'c1' } });
    expect(request).toHaveBeenCalledWith('app/checkpoint/capture', {});
    const body = posted[0]!.body as Record<string, unknown>;
    expect(posted[0]!.url).toBe('http://log.test/sessions/checkpoints');
    expect(body).toMatchObject({
      sessionId: '00000000-0000-4000-8000-000000000001',
      origin: 'http://localhost:4300',
      snapshot: { route: '/admin' },
      ttlReason: 'jeton de session valable deux heures',
    });
    expect(
      Date.parse(String(body['expiresAt'])) - before,
    ).toBeGreaterThanOrEqual(2 * 60 * 60_000 - 1_000);

    const cleaned = await client.callTool({
      name: 'checkpoint.cleanup',
      arguments: { id: '00000000-0000-4000-8000-0000000000c1' },
    });
    expect(cleaned.structuredContent).toEqual({
      result: { cleaned: [{ ok: true }], forgotten: true },
    });
    expect(posted.at(-1)).toEqual({
      url: 'http://log.test/sessions/checkpoints/00000000-0000-4000-8000-0000000000c1',
      method: 'DELETE',
    });
    await client.close();
  });
});

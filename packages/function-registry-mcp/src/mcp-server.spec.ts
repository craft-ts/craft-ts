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
});

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
      'registry.list',
      'registry.get',
      'registry.call',
      'registry.logs',
    ]);

    const result = await client.callTool({
      name: 'registry.list',
      arguments: {},
    });
    expect(request).toHaveBeenCalledWith('registry/list');
    expect(result.structuredContent).toEqual({ result: [{ key: 'save' }] });

    await client.close();
    await server.close();
  });
});

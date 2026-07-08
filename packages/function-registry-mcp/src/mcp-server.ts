import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { RegistryBridgeBroker } from './bridge-broker.js';
import type { RegistryMethod } from './protocol.js';

type RegistryRequester = Pick<RegistryBridgeBroker, 'request'>;

export function createRegistryMcpServer(bridge: RegistryRequester): McpServer {
  const server = new McpServer({
    name: 'ng-craft-function-registry',
    version: '0.1.0',
  });

  registerTool(
    server,
    bridge,
    'registry.list',
    'registry/list',
    'List active registry entries',
  );
  registerTool(
    server,
    bridge,
    'registry.get',
    'registry/get',
    'Get one active registry entry',
    { key: z.string().min(1) },
  );
  registerTool(
    server,
    bridge,
    'registry.call',
    'registry/call',
    'Invoke an active registry entry',
    { key: z.string().min(1), args: z.array(z.unknown()).optional() },
  );
  registerTool(
    server,
    bridge,
    'registry.logs',
    'registry/logs',
    'Read observable registry and bridge events',
    { sinceId: z.number().int().nonnegative().optional() },
  );

  return server;
}

function registerTool(
  server: McpServer,
  bridge: RegistryRequester,
  toolName: string,
  method: RegistryMethod,
  description: string,
  inputSchema?: Record<string, z.ZodType>,
): void {
  if (inputSchema === undefined) {
    server.registerTool(toolName, { description }, async () => {
      const result = await bridge.request(method);
      return toolResult(result);
    });
    return;
  }

  server.registerTool(
    toolName,
    { description, inputSchema },
    async (params) => {
      const result = await bridge.request(method, params);
      return toolResult(result);
    },
  );
}

function toolResult(result: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    structuredContent: { result },
  };
}

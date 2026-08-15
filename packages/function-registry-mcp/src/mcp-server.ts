import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { RegistryBridgeBroker } from './bridge-broker.js';
import type { RegistryBrokerMethod } from './protocol.js';

type RegistryRequester = Pick<RegistryBridgeBroker, 'request'>;
type PrimitiveValueKind = 'query' | 'asyncProcess' | 'mutation' | 'queryParams';

export function createRegistryMcpServer(bridge: RegistryRequester): McpServer {
  const server = new McpServer({
    name: 'ng-craft-function-registry',
    version: '0.1.0',
  });

  registerTool(
    server,
    bridge,
    'page',
    'page',
    'Read named controls on the connected browser tab, or run act (fill / click / press) then return the new page state. Omit clientId when exactly one tab is connected. Default detail is controls; pass detail "dom-styles" only to debug layout/CSS.',
    {
      clientId: z.string().min(1).optional(),
      act: z
        .array(
          z.object({
            id: z.string().min(1),
            fill: z.unknown().optional(),
            press: z.string().optional(),
            match: z
              .object({
                index: z.number().int().nonnegative().optional(),
                track: z.string().min(1).optional(),
              })
              .optional(),
          }),
        )
        .optional(),
      detail: z.enum(['controls', 'dom-styles']).optional(),
      styles: z.array(z.string()).optional(),
      timeoutMs: z.number().int().nonnegative().optional(),
    },
    true,
  );

  registerTool(
    server,
    bridge,
    'registry.clients',
    'registry/clients',
    'List connected browser registry clients; use clientId to target all other tools when more than one client is connected',
  );

  registerTool(
    server,
    bridge,
    'registry.list',
    'registry/list',
    'List active registry entries',
    { clientId: z.string().min(1).optional() },
  );
  registerTool(
    server,
    bridge,
    'registry.get',
    'registry/get',
    'Get one active registry entry',
    { clientId: z.string().min(1).optional(), key: z.string().min(1) },
  );
  registerTool(
    server,
    bridge,
    'registry.call',
    'registry/call',
    'Invoke an active registry entry',
    {
      clientId: z.string().min(1).optional(),
      key: z.string().min(1),
      args: z.array(z.unknown()).optional(),
    },
    true,
  );
  registerPrimitiveValueTools(server, bridge, 'query', true);
  registerPrimitiveValueTools(server, bridge, 'mutation', true);
  registerPrimitiveValueTools(server, bridge, 'asyncProcess', true);
  registerPrimitiveValueTools(server, bridge, 'queryParams', false);
  registerTool(
    server,
    bridge,
    'registry.override',
    'registry/override',
    'Replace an active primitive method at runtime with a development-only JavaScript function such as ({ state }) => state.update(current => current + 10), ({ query }) => query.set(value), or ({ queryParams }) => queryParams.patch(current => ({ page: current.page + 1 }))',
    {
      clientId: z.string().min(1).optional(),
      key: z.string().min(1),
      source: z.string().min(1).max(20_000),
    },
    true,
  );
  registerTool(
    server,
    bridge,
    'registry.restore',
    'registry/restore',
    'Remove a runtime override and restore the original state method',
    { clientId: z.string().min(1).optional(), key: z.string().min(1) },
    true,
  );
  registerTool(
    server,
    bridge,
    'registry.logs',
    'registry/logs',
    'Read observable registry and bridge events',
    {
      clientId: z.string().min(1).optional(),
      sinceId: z.number().int().nonnegative().optional(),
    },
  );

  return server;
}

function registerPrimitiveValueTools(
  server: McpServer,
  bridge: RegistryRequester,
  kind: PrimitiveValueKind,
  supportsId: boolean,
): void {
  const capitalizedKind = kind === 'queryParams' ? 'queryParams' : kind;
  const baseSchema = {
    clientId: z.string().min(1).optional(),
    key: z.string().min(1),
    ...(supportsId ? { id: z.string().min(1).optional() } : {}),
  };

  registerPrimitiveTool(
    server,
    bridge,
    `registry.${kind}.get`,
    'registry/resource/get',
    `Read the current ${capitalizedKind} value${supportsId ? '; pass id for a grouped instance' : ''}`,
    baseSchema,
    kind,
  );
  registerPrimitiveTool(
    server,
    bridge,
    `registry.${kind}.set`,
    'registry/resource/set',
    `Imperatively set the current ${capitalizedKind} value${supportsId ? '; pass id for a grouped instance' : ''}`,
    { ...baseSchema, value: z.unknown() },
    kind,
    true,
  );
  registerPrimitiveTool(
    server,
    bridge,
    `registry.${kind}.update`,
    'registry/resource/update',
    `Imperatively update the current ${capitalizedKind} value with JavaScript source evaluating to (current) => next${supportsId ? '; pass id for a grouped instance' : ''}`,
    { ...baseSchema, source: z.string().min(1).max(20_000) },
    kind,
    true,
  );
  registerPrimitiveTool(
    server,
    bridge,
    `registry.${kind}.patch`,
    'registry/resource/patch',
    `Imperatively patch the current ${capitalizedKind} value with JavaScript source evaluating to (current) => partialObject${supportsId ? '; pass id for a grouped instance' : ''}`,
    { ...baseSchema, source: z.string().min(1).max(20_000) },
    kind,
    true,
  );
}

function registerPrimitiveTool(
  server: McpServer,
  bridge: RegistryRequester,
  toolName: string,
  method: RegistryBrokerMethod,
  description: string,
  inputSchema: Record<string, z.ZodType>,
  kind: PrimitiveValueKind,
  mutating = false,
): void {
  const annotations = {
    readOnlyHint: !mutating,
    destructiveHint: mutating,
  };
  server.registerTool(
    toolName,
    { description, inputSchema, annotations },
    async (params) => {
      const result = await bridge.request(method, { ...params, kind });
      return toolResult(result);
    },
  );
}

function registerTool(
  server: McpServer,
  bridge: RegistryRequester,
  toolName: string,
  method: RegistryBrokerMethod,
  description: string,
  inputSchema?: Record<string, z.ZodType>,
  mutating = false,
): void {
  const annotations = {
    readOnlyHint: !mutating,
    destructiveHint: mutating,
  };
  if (inputSchema === undefined) {
    server.registerTool(toolName, { description, annotations }, async () => {
      const result = await bridge.request(method);
      return toolResult(result);
    });
    return;
  }

  server.registerTool(
    toolName,
    { description, inputSchema, annotations },
    async (params) => {
      const result = await bridge.request(method, params);
      return toolResult(result);
    },
  );
}

function toolResult(result: unknown) {
  const text = result === undefined ? 'null' : JSON.stringify(result, null, 2);
  return {
    content: [{ type: 'text' as const, text }],
    ...(result === undefined ? {} : { structuredContent: { result } }),
  };
}

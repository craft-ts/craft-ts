import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { RegistryBridgeBroker } from './bridge-broker.js';
import type { RegistryBrokerMethod } from './protocol.js';

type RegistryRequester = Pick<RegistryBridgeBroker, 'request'>;
type PrimitiveValueKind = 'query' | 'asyncProcess' | 'mutation' | 'queryParams';

export function createRegistryMcpServer(bridge: RegistryRequester): McpServer {
  const server = new McpServer({
    name: 'craft-ts-function-registry',
    version: '0.1.0',
  });

  registerTool(
    server,
    bridge,
    'page',
    'page',
    'Read named controls on the connected browser tab, or run act (goto / fill / click / press) then return the new page state. Omit clientId when exactly one tab is ready. Default detail is controls; pass detail "dom-styles" only to debug layout/CSS.',
    {
      clientId: z.string().min(1).optional(),
      act: z
        .array(
          z.union([
            z.object({
              goto: z.string().min(1),
            }),
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
          ]),
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
    'List every page/registry client card (ready, connecting, reloading). Pass clientId to page and registry.* when more than one card is ready.',
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

  registerGuidedResumeTools(server, bridge);

  return server;
}

/**
 * Driving a tab towards a recorded point. The tab answers them when the app
 * installs the guided resume (`provideCraftGuidedResume`); the archive is read
 * by the tab itself from the log server.
 */
function registerGuidedResumeTools(
  server: McpServer,
  bridge: RegistryRequester,
): void {
  const point = {
    clientId: z.string().min(1).optional(),
    sessionId: z.string().uuid(),
    beforeSequence: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('The point is just before this event; the end of the session when omitted'),
    participantId: z.string().min(1).optional().describe('The recorded tab to follow'),
    timeoutMs: z.number().int().positive().max(120_000).optional(),
  };
  registerTool(
    server,
    bridge,
    'app.launch',
    'app/launch',
    'Reload the connected tab on the recorded state of a session point (route, primitives, storage), with the write barrier on: writes to other origins are held, the others journaled (app.writes). Without sessionId, reload the app fresh in the same mode. Then call app.diff.',
    { ...point, sessionId: point.sessionId.optional() },
    true,
  );
  registerTool(
    server,
    bridge,
    'app.diff',
    'app/diff',
    'Compare the live tab with the recorded point: route and primitive values by address (ordinal-free), each equal, different, missing (recorded, not live) or extra. An empty `differences` means the app is at the point.',
    point,
  );
  registerTool(
    server,
    bridge,
    'app.replay',
    'app/replay',
    'Invoke a replayable method of the live tab by its address (as session.story shows it), with arguments adapted to the live data. Waits for the call to settle and returns its outcome.',
    {
      clientId: z.string().min(1).optional(),
      address: z.string().min(1),
      args: z.array(z.unknown()).optional(),
      timeoutMs: z.number().int().positive().max(120_000).optional(),
    },
    true,
  );
  const condition = z.union([
    z.object({
      address: z.string().min(1).describe('Primitive address, ordinal-free'),
      path: z.string().min(1).optional().describe('Dot path in the value, e.g. user.role'),
      equals: z.unknown().optional(),
      notEquals: z.unknown().optional(),
      exists: z.boolean().optional(),
    }),
    z.object({ route: z.string().min(1).describe('Route prefix to reach') }),
  ]);
  server.registerTool(
    'app.handoff',
    {
      description:
        'Hand the tab to the person for what you must not or cannot do (credentials, codes, choices only they can make): shows an « À vous » banner with the message, highlights the field, and waits until the condition holds in the live state, the person confirms or declines, or the time is up (5 minutes by default). Never ask for the secret itself.',
      inputSchema: {
        clientId: z.string().min(1).optional(),
        message: z.string().min(1).max(500),
        field: z.string().min(1).optional().describe('Control id to highlight (page controls)'),
        until: condition.optional(),
        timeoutMs: z.number().int().positive().max(15 * 60_000).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (params) =>
      toolResult(
        await bridge.request('app/handoff', {
          ...params,
          timeoutMs: params.timeoutMs ?? 5 * 60_000,
        }),
      ),
  );
  registerTool(
    server,
    bridge,
    'app.writes',
    'app/writes',
    'List the writes the tab made since the guided resume started: allowed (same origin, journaled) and held (another origin, never sent).',
    { clientId: z.string().min(1).optional() },
  );
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

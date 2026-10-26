import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { RegistryBridgeBroker } from './bridge-broker.js';
import type { RegistryBrokerMethod } from './protocol.js';

type RegistryRequester = Pick<RegistryBridgeBroker, 'request'>;
type PrimitiveValueKind = 'query' | 'asyncProcess' | 'mutation' | 'queryParams';

export type RegistryMcpServerOptions = Readonly<{
  /** Where resume points are kept; `LOG_SERVER_URL` or the local log server. */
  logServerUrl?: string;
  fetch?: typeof fetch;
}>;

export function createRegistryMcpServer(
  bridge: RegistryRequester,
  options: RegistryMcpServerOptions = {},
): McpServer {
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
  registerCheckpointTools(server, bridge, options);

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
      matches: z
        .string()
        .min(1)
        .optional()
        .describe('Regular expression on the value text'),
      unmasked: z
        .boolean()
        .optional()
        .describe('true: a real value, not a recording mask ([REDACTED], craft-ref:…); see session.prerequisites signedInWhen'),
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
    'List the writes the tab made since the guided resume started, by fetch or XHR: allowed (same origin, journaled) and held (another origin, never sent). A server function named like a read (overview, get…) is counted in `reads`, not listed.',
    { clientId: z.string().min(1).optional() },
  );
}

const probe = z.object({
  method: z.string().min(1).optional(),
  url: z.string().min(1).describe('Same-origin path; may use {{state <address> <path>}}'),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
  expect: z.object({
    status: z.number().int().optional(),
    match: z.array(z.string()).optional().describe('Substrings the answer must contain'),
  }),
});

/**
 * Resume points: the AI freezes the tab once it is at the recorded point, so
 * the point reopens later without it while its probes still hold.
 */
function registerCheckpointTools(
  server: McpServer,
  bridge: RegistryRequester,
  options: RegistryMcpServerOptions,
): void {
  const http = options.fetch ?? fetch;
  const base = () =>
    (options.logServerUrl ?? process.env['LOG_SERVER_URL'] ?? 'http://127.0.0.1:4319').replace(/\/$/, '');
  const json = async (path: string, init?: RequestInit) => {
    const response = await http(`${base()}${path}`, init);
    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new Error(String(body['error'] ?? `HTTP ${response.status}`));
    return body;
  };
  const clientId = z.string().min(1).optional();

  server.registerTool(
    'checkpoint.save',
    {
      description:
        'Freeze the connected tab as a resume point of a recorded session, once app.diff says it is there. You choose how long it stays valid and say why (token lifetime, data that will be reset…). Probes are same-origin requests replayed before every reopen; list what the resume created with a cleanup request, and the deviations you accepted.',
      inputSchema: {
        clientId,
        sessionId: z.string().uuid(),
        beforeSequence: z.number().int().nonnegative().optional(),
        label: z.string().min(1).max(200).optional(),
        ttlMs: z.number().int().min(60_000).max(30 * 24 * 60 * 60_000),
        ttlReason: z.string().min(1).max(300),
        probes: z.array(probe).max(20).optional(),
        created: z
          .array(z.object({ kind: z.string().min(1), id: z.string().min(1), cleanup: probe.optional() }))
          .max(50)
          .optional(),
        deviations: z.array(z.string().min(1).max(300)).max(30).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ clientId: target, ttlMs, ...point }) => {
      const captured = (await bridge.request('app/checkpoint/capture', {
        ...(target === undefined ? {} : { clientId: target }),
      })) as { origin: string; snapshot: unknown };
      const saved = await json('/sessions/checkpoints', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...point,
          origin: captured.origin,
          snapshot: captured.snapshot,
          expiresAt: new Date(Date.now() + ttlMs).toISOString(),
        }),
      });
      return toolResult(saved['checkpoint']);
    },
  );

  server.registerTool(
    'checkpoint.list',
    {
      description:
        'List the resume points kept for a session (or all), newest first, with their expiry, reason, probes and deviations. `expired` is computed now; checkpoint.validate also runs the probes.',
      inputSchema: {
        sessionId: z.string().uuid().optional(),
        beforeSequence: z.number().int().nonnegative().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ sessionId, beforeSequence }) => {
      const query = new URLSearchParams({
        ...(sessionId === undefined ? {} : { sessionId }),
        ...(beforeSequence === undefined ? {} : { beforeSequence: String(beforeSequence) }),
      });
      const listed = await json(`/sessions/checkpoints${query.size ? `?${query}` : ''}`);
      return toolResult(listed['checkpoints']);
    },
  );

  registerTool(
    server,
    bridge,
    'checkpoint.restore',
    'app/checkpoint/restore',
    'Reload the connected tab on a resume point (state and origin storage). Then call checkpoint.validate.',
    { clientId, id: z.string().uuid(), timeoutMs: z.number().int().positive().max(120_000).optional() },
    true,
  );
  registerTool(
    server,
    bridge,
    'checkpoint.validate',
    'app/checkpoint/validate',
    'Check a resume point from the connected tab: not expired, same origin, and every probe answers as expected. A failing probe tells what to repair, starting from the point.',
    { clientId, id: z.string().uuid(), timeoutMs: z.number().int().positive().max(120_000).optional() },
  );

  server.registerTool(
    'checkpoint.cleanup',
    {
      description:
        'Delete what the resume created (the cleanup request of each created entity, sent from the connected tab), then forget the point unless keep is true.',
      inputSchema: { clientId, id: z.string().uuid(), keep: z.boolean().optional() },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ clientId: target, id, keep }) => {
      const cleaned = (await bridge.request('app/checkpoint/cleanup', {
        ...(target === undefined ? {} : { clientId: target }),
        id,
      })) as readonly { ok: boolean }[];
      const forget = keep !== true && cleaned.every((result) => result.ok);
      if (forget)
        await json(`/sessions/checkpoints/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return toolResult({ cleaned, forgotten: forget });
    },
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
